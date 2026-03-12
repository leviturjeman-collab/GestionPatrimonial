import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import {
    InputCell, FormulaCell, OutputCell, SectionHeader,
    ProjTable, SensTable,
    fmtEur, fmtPct, fmtN, num, pct,
    discountCashFlows,
    GOLD_BG, GREEN_BG, BLUE_CLR, GOLD_CLR, GREEN_CLR, RED_CLR,
    SCEN_LABELS, SCEN_COLORS,
    type Scenario,
} from '../lib/valuation/modelUtils'
import { computeWACC, sensitivityMatrix, range, getSpanishREDefaults } from '../lib/valuation/wacc'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Asset } from '../types'

const SCEN_ADJ: Record<Scenario, { rentAdj: number; occAdj: number; capRateAdj: number; waccAdj: number }> = {
    pessimistic: { rentAdj: 0.88, occAdj: 0.85, capRateAdj: 0.005, waccAdj: 0.015 },
    base: { rentAdj: 1.00, occAdj: 1.00, capRateAdj: 0.000, waccAdj: 0.000 },
    optimistic: { rentAdj: 1.12, occAdj: 1.05, capRateAdj: -0.003, waccAdj: -0.010 },
}

interface Inputs {
    name: string; city: string; regime: 'owned' | 'leased'; assetType: string
    areaSqm: string; rentableAreaPct: string; yearBuilt: string; floors: string
    bedrooms: string; pricePerSqm: string
    // Purchase & Market Value
    purchasePrice: string; purchaseYear: string; currentMarketValue: string
    // Revenue
    rentPerSqm: string; occupancyRate: string; otherIncomeAnnual: string
    // Costs
    ibiAnnual: string; insuranceAnnual: string; communityAnnual: string
    maintenancePct: string; managementFeePct: string
    rehabilitationCapex: string; structuralCapex: string
    rentalGrowth: string; inflacion: string
    // Spanish-specific costs
    basuraAnnual: string; derramaAnnual: string; suministrosAnnual: string
    gastosNotaria: string; itpAjd: string
    plusvaliaMunicipal: string; honorariosAgenciaPct: string
    // Financing
    mortgageOutstanding: string; annualDebtService: string; cash: string
    // WACC / CAPM
    rf: string; erp: string; beta: string; crp: string; sizePremium: string
    debtCost: string; taxRate: string; equityWeight: string
    // Exit
    capRate: string; propertyAppreciation: string
    horizon: string; terminalGrowth: string; exitMultiple: string; tvMethod: 'gordon' | 'caprate'
    ownershipPct: string
    // Lease-specific
    leaseExpiry: string; leaseRentPaid: string; leaseRenewable: string
}

const DEFAULTS: Inputs = {
    name: '', city: '', regime: 'owned', assetType: 'local_comercial',
    areaSqm: '100', rentableAreaPct: '100', yearBuilt: '2000', floors: '1', bedrooms: '0', pricePerSqm: '3000',
    purchasePrice: '0', purchaseYear: '', currentMarketValue: '0',
    rentPerSqm: '20', occupancyRate: '92', otherIncomeAnnual: '0',
    ibiAnnual: '1200', insuranceAnnual: '600', communityAnnual: '900',
    maintenancePct: '6', managementFeePct: '8',
    rehabilitationCapex: '0', structuralCapex: '0',
    rentalGrowth: '2.5', inflacion: '2',
    basuraAnnual: '250', derramaAnnual: '0', suministrosAnnual: '0',
    gastosNotaria: '0', itpAjd: '0',
    plusvaliaMunicipal: '0', honorariosAgenciaPct: '4',
    mortgageOutstanding: '0', annualDebtService: '0', cash: '0',
    rf: '3.2', erp: '5.8', beta: '0.60', crp: '0.72', sizePremium: '2.0',
    debtCost: '4.0', taxRate: '25', equityWeight: '100',
    capRate: '5.5', propertyAppreciation: '3',
    horizon: '10', terminalGrowth: '2', exitMultiple: '20', tvMethod: 'caprate',
    ownershipPct: '100',
    leaseExpiry: '', leaseRentPaid: '', leaseRenewable: 'si',
}

// ── Core model computation ───────────────────────────────────
function computeModel(inp: Inputs, scen: Scenario = 'base') {
    const adj = SCEN_ADJ[scen]
    const H = Math.max(1, parseInt(inp.horizon) || 10)

    const sqm = num(inp.areaSqm) * (pct(inp.rentableAreaPct) / 100)
    const grossRentBase = sqm * num(inp.rentPerSqm) * 12 * adj.rentAdj
    const occRate = Math.min(pct(inp.occupancyRate) * adj.occAdj, 1)
    const effectiveRentBase = grossRentBase * occRate + num(inp.otherIncomeAnnual)
    const rentalGrowth = pct(inp.rentalGrowth)

    const ibi = num(inp.ibiAnnual)
    const ins = num(inp.insuranceAnnual)
    const com = num(inp.communityAnnual)
    const basura = num(inp.basuraAnnual)
    const derrama = num(inp.derramaAnnual)
    const suministros = num(inp.suministrosAnnual)
    const itpAmort = (num(inp.itpAjd) + num(inp.gastosNotaria)) / H  // amortize acquisition costs
    const mgmt = pct(inp.managementFeePct)
    const maint = pct(inp.maintenancePct)
    const taxR = pct(inp.taxRate)
    const capRate = pct(inp.capRate) + adj.capRateAdj
    const propApp = pct(inp.propertyAppreciation)

    // WACC — auto-calculate equity weight from debt/value if mortgage > 0
    const assetValueRef = num(inp.currentMarketValue) > 0 ? num(inp.currentMarketValue) : sqm * num(inp.pricePerSqm)
    const mortgageAmt = num(inp.mortgageOutstanding)
    const autoEquityWeight = assetValueRef > 0 && mortgageAmt > 0
        ? Math.max(0, Math.min(1, 1 - mortgageAmt / assetValueRef))
        : pct(inp.equityWeight) / 100
    const eW = pct(inp.equityWeight) === 100 && mortgageAmt > 0 && assetValueRef > 0 ? autoEquityWeight : pct(inp.equityWeight) / 100
    const dW = 1 - eW
    const waccResult = computeWACC({
        riskFreeRate: pct(inp.rf), equityRiskPremium: pct(inp.erp), beta: num(inp.beta),
        countryRiskPremium: pct(inp.crp), sizePremium: pct(inp.sizePremium),
        costOfDebt: pct(inp.debtCost), taxRate: taxR,
        equityWeight: eW, debtWeight: dW,
    })
    const wacc = waccResult.wacc + adj.waccAdj

    const years: {
        year: number; grossRent: number; effectiveRent: number
        managementFee: number; maintenance: number; spanishCosts: number; opex: number; noi: number
        da: number; ebit: number; tax: number; nopat: number
        capex: number; fcf: number; noiYield: number
    }[] = []

    let curEffRent = effectiveRentBase
    for (let y = 1; y <= H; y++) {
        curEffRent *= (1 + rentalGrowth)
        const grossRent = curEffRent / occRate
        const mgmtFee = curEffRent * mgmt
        const maintCost = curEffRent * maint
        const inflFactor = Math.pow(1 + pct(inp.inflacion), y)
        const ibiY = ibi * inflFactor
        const insY = ins * inflFactor
        const comY = com * inflFactor
        const basuraY = basura * inflFactor
        const derramaY = derrama * inflFactor
        const suministrosY = suministros * inflFactor
        const spanishCosts = basuraY + derramaY + suministrosY + itpAmort
        const opex = mgmtFee + maintCost + ibiY + insY + comY + spanishCosts
        const noi = curEffRent - opex
        const da = num(inp.rehabilitationCapex) / 30 + num(inp.structuralCapex) / 50
        const ebit = noi - da
        const tax = Math.max(ebit * taxR, 0)
        const nopat = ebit - tax
        const capex = (num(inp.rehabilitationCapex) + num(inp.structuralCapex)) / H
        const fcf = nopat + da - capex
        years.push({ year: y, grossRent, effectiveRent: curEffRent, managementFee: mgmtFee, maintenance: maintCost, spanishCosts, opex, noi, da, ebit, tax, nopat, capex, fcf, noiYield: noi / (assetValueRef || 1) })
    }

    const pvFCFs = discountCashFlows(years.map(y => y.fcf), wacc)

    // Terminal value — net of exit costs (plusvalía municipal + agency fees)
    const lastNOI = years[years.length - 1].noi * (1 + rentalGrowth)
    const byCapRateExit = lastNOI / capRate
    const byAppreciation = assetValueRef * Math.pow(1 + propApp, H)
    const grossExitValue = inp.tvMethod === 'caprate' ? byCapRateExit : byAppreciation
    const exitCosts = num(inp.plusvaliaMunicipal) + grossExitValue * pct(inp.honorariosAgenciaPct)
    const netExitValue = grossExitValue - exitCosts
    const pvExit = netExitValue / Math.pow(1 + wacc, H)

    const ev = pvFCFs + pvExit
    const noi0 = years[0]?.noi ?? 0
    const byCapRateNow = noi0 / capRate
    const grossYield = assetValueRef > 0 ? (effectiveRentBase / assetValueRef) * 100 : 0
    const netYield = assetValueRef > 0 ? (noi0 / assetValueRef) * 100 : 0
    const equityValue = Math.max(ev - mortgageAmt + num(inp.cash), 0) * (pct(inp.ownershipPct) / 100)
    // Extra KPIs
    const purchaseP = num(inp.purchasePrice)
    const cashOnCash = purchaseP > 0 ? ((noi0 - num(inp.annualDebtService)) / purchaseP) * 100 : 0
    const priceToRent = effectiveRentBase > 0 ? assetValueRef / effectiveRentBase : 0
    const equityWeightActual = eW

    return { years, waccResult, wacc, pvFCFs, pvExit, ev, equityValue, byCapRateNow, grossYield, netYield, noi0, effectiveRentBase, sqm, capRate, cashOnCash, priceToRent, equityWeightActual, grossExitValue, exitCosts }
}

// ═══════════════════════════════════════════════════════════════
export default function RealEstateModelPage({ asset }: { asset: Asset }) {
    const navigate = useNavigate()
    const { user } = useAuth()
    const sd = (asset.sector_data ?? {}) as Record<string, unknown>

    const [inp, setInp] = useState<Inputs>({
        ...DEFAULTS,
        name: asset.name,
        city: String(sd.city ?? ''),
        regime: (sd.regime as 'owned' | 'leased') ?? 'owned',
        areaSqm: String(sd.area_sqm ?? DEFAULTS.areaSqm),
        ibiAnnual: String(sd.ibi_annual ?? DEFAULTS.ibiAnnual),
        insuranceAnnual: String(sd.insurance_annual ?? DEFAULTS.insuranceAnnual),
        communityAnnual: String(sd.community_annual ?? DEFAULTS.communityAnnual),
        mortgageOutstanding: String(sd.debt_outstanding ?? DEFAULTS.mortgageOutstanding),
        yearBuilt: String(sd.year_built ?? DEFAULTS.yearBuilt),
        pricePerSqm: String(sd.price_per_sqm ?? DEFAULTS.pricePerSqm),
        purchasePrice: String(sd.purchase_price ?? DEFAULTS.purchasePrice),
        purchaseYear: String(sd.purchase_year ?? DEFAULTS.purchaseYear),
        currentMarketValue: String(sd.current_market_value ?? DEFAULTS.currentMarketValue),
        capRate: String(Number(sd.cap_rate_pct ?? 5.5)),
        leaseRentPaid: String(sd.lease_rent_paid ?? ''),
        leaseExpiry: String(sd.lease_expiry ?? ''),
        // Load remaining fields from sector_data
        rentPerSqm: String(sd.rent_per_sqm ?? DEFAULTS.rentPerSqm),
        occupancyRate: String(sd.occupancy_pct ?? DEFAULTS.occupancyRate),
        otherIncomeAnnual: String(sd.other_income_annual ?? DEFAULTS.otherIncomeAnnual),
        managementFeePct: String(sd.management_fee_pct ?? DEFAULTS.managementFeePct),
        maintenancePct: String(sd.maintenance_pct ?? DEFAULTS.maintenancePct),
        rentalGrowth: String(sd.rental_growth ?? DEFAULTS.rentalGrowth),
        inflacion: String(sd.inflacion ?? DEFAULTS.inflacion),
        rehabilitationCapex: String(sd.rehabilitation_capex ?? DEFAULTS.rehabilitationCapex),
        structuralCapex: String(sd.structural_capex ?? DEFAULTS.structuralCapex),
        annualDebtService: String(sd.annual_debt_service ?? DEFAULTS.annualDebtService),
        cash: String(sd.cash ?? DEFAULTS.cash),
        rf: String(sd.rf ?? DEFAULTS.rf),
        erp: String(sd.erp ?? DEFAULTS.erp),
        beta: String(sd.beta ?? DEFAULTS.beta),
        crp: String(sd.crp ?? DEFAULTS.crp),
        sizePremium: String(sd.size_premium ?? DEFAULTS.sizePremium),
        debtCost: String(sd.debt_cost ?? DEFAULTS.debtCost),
        taxRate: String(sd.tax_rate ?? DEFAULTS.taxRate),
        equityWeight: String(sd.equity_weight ?? DEFAULTS.equityWeight),
        propertyAppreciation: String(sd.property_appreciation ?? DEFAULTS.propertyAppreciation),
        horizon: String(sd.horizon ?? DEFAULTS.horizon),
        terminalGrowth: String(sd.terminal_growth ?? DEFAULTS.terminalGrowth),
        exitMultiple: String(sd.exit_multiple ?? DEFAULTS.exitMultiple),
        tvMethod: (sd.tv_method as 'gordon' | 'caprate') ?? DEFAULTS.tvMethod,
        ownershipPct: String(sd.ownership_pct ?? DEFAULTS.ownershipPct),
        rentableAreaPct: String(sd.rentable_area_pct ?? DEFAULTS.rentableAreaPct),
        floors: String(sd.floors ?? DEFAULTS.floors),
        bedrooms: String(sd.bedrooms ?? DEFAULTS.bedrooms),
        assetType: String(sd.asset_type ?? DEFAULTS.assetType),
        leaseRenewable: String(sd.lease_renewable ?? DEFAULTS.leaseRenewable),
        // Spanish-specific fields
        basuraAnnual: String(sd.basura_annual ?? DEFAULTS.basuraAnnual),
        derramaAnnual: String(sd.derrama_annual ?? DEFAULTS.derramaAnnual),
        suministrosAnnual: String(sd.suministros_annual ?? DEFAULTS.suministrosAnnual),
        gastosNotaria: String(sd.gastos_notaria ?? DEFAULTS.gastosNotaria),
        itpAjd: String(sd.itp_ajd ?? DEFAULTS.itpAjd),
        plusvaliaMunicipal: String(sd.plusvalia_municipal ?? DEFAULTS.plusvaliaMunicipal),
        honorariosAgenciaPct: String(sd.honorarios_agencia_pct ?? DEFAULTS.honorariosAgenciaPct),
    })

    const set = (k: keyof Inputs) => (v: string) => setInp(p => ({ ...p, [k]: v }))
    const [tab, setTab] = useState<'supuestos' | 'proyecciones' | 'dcf' | 'sensibilidades' | 'escenarios'>('supuestos')
    const [saving, setSaving] = useState(false)

    // Auto-WACC: when asset type changes, auto-populate CAPM & sector defaults
    const handleAssetTypeChange = (newType: string) => {
        const d = getSpanishREDefaults(newType)
        setInp(p => ({
            ...p,
            assetType: newType,
            rf: String((d.rf * 100).toFixed(1)),
            erp: String((d.erp * 100).toFixed(1)),
            beta: String(d.beta.toFixed(2)),
            crp: String((d.crp * 100).toFixed(2)),
            sizePremium: String((d.sizePremium * 100).toFixed(1)),
            capRate: String((d.capRate * 100).toFixed(1)),
            debtCost: String((d.debtCost * 100).toFixed(1)),
            taxRate: String((d.taxRate * 100).toFixed(0)),
            rentalGrowth: String((d.rentalGrowth * 100).toFixed(1)),
            occupancyRate: String((d.occupancy * 100).toFixed(0)),
            maintenancePct: String((d.maintenancePct * 100).toFixed(0)),
            managementFeePct: String((d.managementFeePct * 100).toFixed(0)),
        }))
    }

    const reDefaults = getSpanishREDefaults(inp.assetType)

    const baseModel = useMemo(() => computeModel(inp, 'base'), [inp])

    // Sensitivity matrices
    const waccRange = range(0.04, 0.12, 9)
    const gRange = range(0.02, 0.06, 7)
    const occRange = range(0.70, 1.00, 7)

    const sensWACCxCapRate = sensitivityMatrix(waccRange, gRange, (w, cap) => {
        const m = computeModel({ ...inp, capRate: String(cap * 100) }, 'base')
        return Math.max(m.pvFCFs + m.pvExit / Math.pow(1 + w, parseInt(inp.horizon) || 10) - num(inp.mortgageOutstanding), 0)
    }).map(r => r.map(c => c?.value ?? 0))

    const sensWACCxOcc = sensitivityMatrix(waccRange, occRange, (w, occ) => {
        const m = computeModel({ ...inp, occupancyRate: String(occ * 100) }, 'base')
        const pvFCFs = discountCashFlows(m.years.map(y => y.fcf), w)
        return Math.max(pvFCFs + m.pvExit - num(inp.mortgageOutstanding), 0)
    }).map(r => r.map(c => c?.value ?? 0))

    const baseWACCIdx = Math.round(waccRange.length / 2) - 1
    const baseMidIdx = Math.round(gRange.length / 2) - 1
    const baseOccIdx = Math.round(occRange.length / 2) - 1

    const handleSave = async () => {
        if (!user) return
        setSaving(true)
        const m = baseModel
        await supabase.from('patrimonio_assets').update({
            sector_data: {
                ...sd,
                city: inp.city, regime: inp.regime, asset_type: inp.assetType,
                area_sqm: num(inp.areaSqm), rent_per_sqm: num(inp.rentPerSqm),
                occupancy_pct: num(inp.occupancyRate), ibi_annual: num(inp.ibiAnnual),
                insurance_annual: num(inp.insuranceAnnual), community_annual: num(inp.communityAnnual),
                management_fee_pct: num(inp.managementFeePct), maintenance_pct: num(inp.maintenancePct),
                cap_rate_pct: num(inp.capRate), debt_outstanding: num(inp.mortgageOutstanding),
                price_per_sqm: num(inp.pricePerSqm), year_built: inp.yearBuilt,
                purchase_price: num(inp.purchasePrice), purchase_year: inp.purchaseYear,
                current_market_value: num(inp.currentMarketValue),
                lease_expiry: inp.leaseExpiry, lease_rent_paid: num(inp.leaseRentPaid),
                rental_growth: num(inp.rentalGrowth), inflacion: num(inp.inflacion),
                rehabilitation_capex: num(inp.rehabilitationCapex), structural_capex: num(inp.structuralCapex),
                cash: num(inp.cash), property_appreciation: num(inp.propertyAppreciation),
                horizon: num(inp.horizon), terminal_growth: num(inp.terminalGrowth),
                exit_multiple: num(inp.exitMultiple), tv_method: inp.tvMethod,
                ownership_pct: num(inp.ownershipPct), other_income_annual: num(inp.otherIncomeAnnual),
                // Spanish-specific costs
                basura_annual: num(inp.basuraAnnual), derrama_annual: num(inp.derramaAnnual),
                suministros_annual: num(inp.suministrosAnnual),
                gastos_notaria: num(inp.gastosNotaria), itp_ajd: num(inp.itpAjd),
                plusvalia_municipal: num(inp.plusvaliaMunicipal),
                honorarios_agencia_pct: num(inp.honorariosAgenciaPct),
                // WACC/CAPM (persisted so they reload)
                rf: num(inp.rf), erp: num(inp.erp), beta: num(inp.beta),
                crp: num(inp.crp), size_premium: num(inp.sizePremium),
                debt_cost: num(inp.debtCost), tax_rate: num(inp.taxRate),
                equity_weight: num(inp.equityWeight),
                rentable_area_pct: num(inp.rentableAreaPct),
                floors: num(inp.floors), bedrooms: num(inp.bedrooms),
                annual_debt_service: num(inp.annualDebtService),
                lease_renewable: inp.leaseRenewable,
            }
        }).eq('id', asset.id)

        await supabase.from('patrimonio_valuation_snapshots').insert({
            user_id: user.id, asset_id: asset.id,
            snapshot_date: new Date().toISOString().split('T')[0],
            value_low: Math.round(computeModel(inp, 'pessimistic').equityValue),
            value_base: Math.round(m.equityValue),
            value_high: Math.round(computeModel(inp, 'optimistic').equityValue),
            method_used: 'dcf', confidence_score: 'high',
            drivers: [`NOI: ${fmtEur(m.noi0)}/año`, `Cap Rate: ${fmtPct(m.capRate)}`, `WACC: ${fmtPct(m.wacc)}`, `Rendimiento neto: ${m.netYield.toFixed(2)}%`],
            explanation: `Modelo NOI/DCF inmobiliario. Cap Rate ${fmtPct(m.capRate)}. NOI ${fmtEur(m.noi0)}/año.`,
            assumptions_metadata: { wacc: m.wacc, noi: m.noi0, capRate: m.capRate, byCapRate: m.byCapRateNow },
        })
        setSaving(false)
        navigate('/assets')
    }

    const TABS = [
        { key: 'supuestos', label: '📋 Supuestos' },
        { key: 'proyecciones', label: '📈 Proyecciones' },
        { key: 'dcf', label: '💰 DCF / NOI' },
        { key: 'sensibilidades', label: '🔥 Sensibilidades' },
        { key: 'escenarios', label: '📊 Escenarios' },
    ] as const

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: '4rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                    <button onClick={() => navigate('/assets')} className="btn btn-ghost btn-sm" style={{ marginBottom: 6 }}><ArrowLeft size={13} /> Volver</button>
                    <h2 style={{ marginBottom: 4 }}>{asset.name}</h2>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="badge badge-gold">Inmobiliario · Modelo DCF Pro</span>
                        <span className="badge badge-muted">{inp.regime === 'owned' ? 'Propiedad propia' : 'Arrendado'}</span>
                        <span style={{ fontSize: '0.72rem', color: BLUE_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(59,130,246,0.12)', borderRadius: 20 }}>🔵 Azul = Inputs</span>
                        <span style={{ fontSize: '0.72rem', color: GOLD_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(201,164,78,0.12)', borderRadius: 20 }}>🟡 Dorado = Fórmulas</span>
                        <span style={{ fontSize: '0.72rem', color: GREEN_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(34,197,94,0.12)', borderRadius: 20 }}>🟢 Verde = Outputs</span>
                    </div>
                </div>
                <button onClick={handleSave} className="btn btn-primary" disabled={saving}><Save size={14} /> {saving ? 'Guardando...' : 'Guardar + Snapshot'}</button>
            </div>

            {/* Quick KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <OutputCell label="Equity Value (base)" value={fmtEur(baseModel.equityValue)} large />
                <OutputCell label="Valor NOI / Cap Rate" value={fmtEur(baseModel.byCapRateNow)} />
                <FormulaCell label="NOI año 1" value={fmtEur(baseModel.noi0)} formula={`Renta efectiva − gastos operativos`} />
                <FormulaCell label="WACC" value={fmtPct(baseModel.wacc)} formula={baseModel.waccResult.details.waccFormula} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <FormulaCell label="Rendimiento bruto" value={`${baseModel.grossYield.toFixed(2)}%`} formula="Renta efectiva / Valor mercado" />
                <FormulaCell label="Rendimiento neto" value={`${baseModel.netYield.toFixed(2)}%`} formula="NOI / Valor mercado" />
                <FormulaCell label="Cash-on-Cash" value={`${baseModel.cashOnCash.toFixed(2)}%`} formula="(NOI − servicio deuda) / Precio compra" />
                <FormulaCell label="Price-to-Rent" value={`${baseModel.priceToRent.toFixed(1)}×`} formula="Valor mercado / Renta anual" />
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 3, marginBottom: '1.25rem', padding: 4, background: 'var(--black-800)', borderRadius: 10, border: '1px solid var(--border-muted)' }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{
                            flex: 1, padding: '0.55rem 0.5rem', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                            background: tab === t.key ? 'rgba(201,164,78,0.18)' : 'transparent', color: tab === t.key ? GOLD_CLR : 'var(--text-muted)', transition: 'all 0.15s'
                        }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── TAB 1: SUPUESTOS ── */}
            {tab === 'supuestos' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <SectionHeader title="Descripción del Inmueble" />
                    <InputCell label="Nombre" value={inp.name} onChange={set('name')} type="text" />
                    <InputCell label="Ciudad" value={inp.city} onChange={set('city')} type="text" />
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tipo de activo</span>
                        <select value={inp.assetType} onChange={e => handleAssetTypeChange(e.target.value)} className="form-select" style={{ marginTop: 6, background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.3)', color: BLUE_CLR }}>
                            <option value="local_comercial">Local comercial</option>
                            <option value="oficina">Oficina</option>
                            <option value="vivienda">Vivienda residencial</option>
                            <option value="piso">Piso / Apartamento</option>
                            <option value="nave">Nave industrial</option>
                            <option value="garaje">Garaje / Parking</option>
                            <option value="suelo">Suelo / Solar</option>
                        </select>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>⚡ Cambia el tipo para auto-rellenar WACC, Cap Rate y parámetros del sector</div>
                    </div>
                    <InputCell label="Superficie total" value={inp.areaSqm} onChange={set('areaSqm')} unit="m²" hint="Superficie útil certificada." />
                    <InputCell label="% Superficie alquilable" value={inp.rentableAreaPct} onChange={set('rentableAreaPct')} unit="%" hint="% del total que se puede alquilar (vs zonas comunes)." />
                    <InputCell label="Precio de mercado" value={inp.pricePerSqm} onChange={set('pricePerSqm')} unit="€/m²" hint="Comparables de mercado en la zona. Cruza con valoración." />
                    <InputCell label="Año de construcción" value={inp.yearBuilt} onChange={set('yearBuilt')} />
                    <InputCell label="Número de plantas" value={inp.floors} onChange={set('floors')} />
                    <InputCell label="Habitaciones (si residencial)" value={inp.bedrooms} onChange={set('bedrooms')} />

                    <SectionHeader title="💰 Precio de Compra y Valor de Mercado" color={BLUE_CLR} />
                    <InputCell label="Precio de compra total" value={inp.purchasePrice} onChange={set('purchasePrice')} unit="€" hint="Precio de adquisición original (escrituras). Se usa para calcular la plusvalía y el ROI." />
                    <InputCell label="Año de compra" value={inp.purchaseYear} onChange={set('purchaseYear')} hint="Año en que se adquirió la propiedad." />
                    <InputCell label="Valor actual de mercado" value={inp.currentMarketValue} onChange={set('currentMarketValue')} unit="€" hint="Tasación actual o estimación de mercado. Si está vacío, se usa Superficie × €/m²." />

                    {/* Capital gain summary */}
                    {num(inp.purchasePrice) > 0 && (() => {
                        const purchaseP = num(inp.purchasePrice)
                        const currentV = num(inp.currentMarketValue) > 0 ? num(inp.currentMarketValue) : num(inp.areaSqm) * num(inp.pricePerSqm)
                        const gain = currentV - purchaseP
                        const gainPct = purchaseP > 0 ? (gain / purchaseP) * 100 : 0
                        const yearsHeld = inp.purchaseYear ? new Date().getFullYear() - parseInt(inp.purchaseYear) : 0
                        const annualReturn = yearsHeld > 0 ? (Math.pow(currentV / purchaseP, 1 / yearsHeld) - 1) * 100 : 0
                        const noiAnnual = baseModel.noi0
                        const totalReturnPct = purchaseP > 0 ? ((gain + noiAnnual * yearsHeld) / purchaseP) * 100 : 0
                        return (
                            <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', padding: '1rem', background: gain >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${gain >= 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius: 10 }}>
                                <FormulaCell label="Precio de compra" value={fmtEur(purchaseP)} formula={inp.purchaseYear ? `Adquirido en ${inp.purchaseYear}` : 'Fecha desconocida'} />
                                <FormulaCell label="Valor actual mercado" value={fmtEur(currentV)} formula={num(inp.currentMarketValue) > 0 ? 'Tasación / estimación' : `${inp.areaSqm}m² × ${inp.pricePerSqm} €/m²`} />
                                <OutputCell label="Plusvalía latente" value={fmtEur(gain)} sub={`${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%`} />
                                <FormulaCell label="Retorno anualizado" value={`${annualReturn >= 0 ? '+' : ''}${annualReturn.toFixed(2)}%/año`} formula={yearsHeld > 0 ? `${yearsHeld} años de tenencia` : 'Sin año de compra'} />
                                <FormulaCell label="Yield sobre coste" value={`${purchaseP > 0 ? ((noiAnnual / purchaseP) * 100).toFixed(2) : '0.00'}%`} formula="NOI año 1 / Precio compra" />
                            </div>
                        )
                    })()}

                    <SectionHeader title="Régimen de Propiedad" />
                    <div style={{ gridColumn: 'span 3' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {(['owned', 'leased'] as const).map(r => (
                                <button key={r} onClick={() => setInp(p => ({ ...p, regime: r }))}
                                    style={{
                                        padding: '0.45rem 1rem', borderRadius: 6, border: `1px solid ${inp.regime === r ? 'rgba(59,130,246,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer',
                                        background: inp.regime === r ? 'rgba(59,130,246,0.12)' : 'transparent', color: inp.regime === r ? BLUE_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.8rem'
                                    }}>
                                    {r === 'owned' ? '🏠 Propiedad Propia' : '📋 Local Arrendado'}
                                </button>
                            ))}
                        </div>
                    </div>
                    {inp.regime === 'leased' && (
                        <>
                            <InputCell label="Renta mensual recibida" value={inp.leaseRentPaid} onChange={set('leaseRentPaid')} unit="€/mes" hint="Renta mensual que paga el inquilino." />
                            <InputCell label="Vencimiento contrato" value={inp.leaseExpiry} onChange={set('leaseExpiry')} type="date" />
                            <InputCell label="Renovable" value={inp.leaseRenewable} onChange={set('leaseRenewable')} type="text" placeholder="Sí / Tácita / No" />
                        </>
                    )}

                    <SectionHeader title="Drivers de Ingresos — m² × Renta × Ocupación" color={BLUE_CLR} />
                    <InputCell label="Renta por m² alquilable" value={inp.rentPerSqm} onChange={set('rentPerSqm')} unit="€/m²/mes" hint={`Renta mensual por m² alquilable. Ingresos = ${inp.areaSqm}m² × ${inp.rentPerSqm}€ × 12 meses × ${inp.occupancyRate}% occ`} />
                    <InputCell label="Tasa de ocupación" value={inp.occupancyRate} onChange={set('occupancyRate')} unit="%" hint="% del tiempo / espacio alquilado. Vacancy = 1 − ocupación." />
                    <InputCell label="Otros ingresos" value={inp.otherIncomeAnnual} onChange={set('otherIncomeAnnual')} unit="€/año" hint="Parking, trastero, antenas, etc." />
                    <InputCell label="Crecimiento anual renta" value={inp.rentalGrowth} onChange={set('rentalGrowth')} unit="%" hint="Ritmo de revisión del alquiler. Típico: CPI ~2–3%." />

                    {/* Live NOI preview */}
                    <div style={{ gridColumn: 'span 3', background: GOLD_BG, border: '1px solid rgba(201,164,78,0.25)', borderRadius: 8, padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                        {[
                            ['Renta bruta anual', fmtEur(baseModel.effectiveRentBase / (pct(inp.occupancyRate) || 1)), GOLD_CLR, `${inp.areaSqm}m² × ${inp.rentPerSqm}€ × 12`],
                            ['Renta efectiva (occ)', fmtEur(baseModel.effectiveRentBase), GOLD_CLR, `× ${inp.occupancyRate}% ocupación`],
                            ['NOI año 1', fmtEur(baseModel.noi0), GREEN_CLR, 'Renta efectiva − gastos'],
                            ['Valor por Cap Rate', fmtEur(baseModel.byCapRateNow), GREEN_CLR, `NOI / ${inp.capRate}%`],
                        ].map(([l, v, c, f]) => (
                            <div key={String(l)}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 2 }}>{l}</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: String(c) }}>{v}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{f}</div>
                            </div>
                        ))}
                    </div>

                    <SectionHeader title="Gastos Operativos (OpEx)" color={BLUE_CLR} />
                    <InputCell label="IBI anual" value={inp.ibiAnnual} onChange={set('ibiAnnual')} unit="€/año" hint="Impuesto sobre Bienes Inmuebles. Típico: 0.4–1.1% del valor catastral. Consulta tu recibo del Ayuntamiento." />
                    <InputCell label="Seguro de edificio" value={inp.insuranceAnnual} onChange={set('insuranceAnnual')} unit="€/año" hint="Multirriesgo hogar/edificio. ~0.1–0.3% del valor asegurado." />
                    <InputCell label="Comunidad de propietarios" value={inp.communityAnnual} onChange={set('communityAnnual')} unit="€/año" hint="Edificio antiguo sin ascensor: 30–60 €/mes. Moderno con piscina: 80–200 €/mes." />
                    <InputCell label="Gastos de gestión" value={inp.managementFeePct} onChange={set('managementFeePct')} unit="% renta" hint={`Comisión administrador / agencia. Típico sector: ${(reDefaults.managementFeePct * 100).toFixed(0)}%. Rango: 5–12%.`} />
                    <InputCell label="Mantenimiento y reparaciones" value={inp.maintenancePct} onChange={set('maintenancePct')} unit="% renta" hint={`Mantenimiento ordinario. Típico sector: ${(reDefaults.maintenancePct * 100).toFixed(0)}%. Rango: 3–8%.`} />
                    <InputCell label="IPC / inflación gastos" value={inp.inflacion} onChange={set('inflacion')} unit="%" hint="Tasa de crecimiento anual de los gastos operativos fijos. España 2024–2025: ~2–3%." />

                    <SectionHeader title="🇪🇸 Gastos Específicos España" color={BLUE_CLR} />
                    <InputCell label="Tasa de basura / residuos" value={inp.basuraAnnual} onChange={set('basuraAnnual')} unit="€/año" hint="Tasa municipal de recogida de residuos. Típico: 100–400 €/año según municipio." />
                    <InputCell label="Derramas previstas" value={inp.derramaAnnual} onChange={set('derramaAnnual')} unit="€/año" hint="Gastos extraordinarios aprobados por la comunidad (rehabilitación fachada, ascensor, etc.)." />
                    <InputCell label="Suministros a cargo propietario" value={inp.suministrosAnnual} onChange={set('suministrosAnnual')} unit="€/año" hint="Agua, electricidad de zonas comunes, etc. Solo si corren por cuenta del propietario." />

                    <SectionHeader title="📝 Costes de Adquisición (amortizables)" color={BLUE_CLR} />
                    <InputCell label="ITP / AJD pagado" value={inp.itpAjd} onChange={set('itpAjd')} unit="€" hint="Impuesto de Transmisiones Patrimoniales (6–10% según CCAA) o AJD en obra nueva (0.5–1.5%). Se amortiza durante el horizonte." />
                    <InputCell label="Gastos notaría y registro" value={inp.gastosNotaria} onChange={set('gastosNotaria')} unit="€" hint="Notaría + Registro de la Propiedad + Gestoría. Típico: 1.500–4.000 €. Se amortiza durante el horizonte." />

                    <SectionHeader title="💰 Costes de Salida (exit)" color={BLUE_CLR} />
                    <InputCell label="Plusvalía municipal estimada" value={inp.plusvaliaMunicipal} onChange={set('plusvaliaMunicipal')} unit="€" hint="Impuesto sobre el Incremento del Valor de los Terrenos. Depende del ayuntamiento, valor catastral del suelo y años de tenencia." />
                    <InputCell label="Honorarios agencia (exit)" value={inp.honorariosAgenciaPct} onChange={set('honorariosAgenciaPct')} unit="%" hint="Comisión de venta a la agencia inmobiliaria. Típico España: 3–5% del precio de venta." />

                    <SectionHeader title="CAPEX y Mejoras" color={BLUE_CLR} />
                    <InputCell label="CAPEX rehabilitación" value={inp.rehabilitationCapex} onChange={set('rehabilitationCapex')} unit="€ total" hint="Inversión puntual en rehabilitación. Se distribuye como D&A a 30 años." />
                    <InputCell label="CAPEX estructural/mantenimiento" value={inp.structuralCapex} onChange={set('structuralCapex')} unit="€ total" hint="Gran reparación estructural. D&A a 50 años." />

                    <SectionHeader title="Financiación" color={BLUE_CLR} />
                    <InputCell label="Hipoteca pendiente" value={inp.mortgageOutstanding} onChange={set('mortgageOutstanding')} unit="€" hint="Capital pendiente de amortización. Se resta del Enterprise Value. Si introduces hipoteca, el peso Equity/Deuda en WACC se calcula automáticamente." />
                    <InputCell label="Servicio deuda anual" value={inp.annualDebtService} onChange={set('annualDebtService')} unit="€/año" hint="Cuota anual de hipoteca (capital + intereses). Se usa para calcular Cash-on-Cash return." />
                    <InputCell label="Caja disponible" value={inp.cash} onChange={set('cash')} unit="€" hint="Tesorería vinculada al activo. Suma al Equity Value." />

                    <SectionHeader title="WACC / CAPM — Auto-calculado según tipo de activo" color={BLUE_CLR} />
                    <div style={{ gridColumn: 'span 3', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.75rem', color: BLUE_CLR }}>
                        ⚡ <strong>Auto-WACC:</strong> Los valores de abajo se auto-rellenan al cambiar el tipo de activo. Puedes ajustarlos manualmente si tienes datos más precisos.
                    </div>
                    <InputCell label="Rf — Bono soberano 10Y" value={inp.rf} onChange={set('rf')} unit="%" hint="Bono español 10Y. Marzo 2026: ~3.2%. Fuente: Banco de España / BCE." />
                    <InputCell label="ERP — Prima de mercado" value={inp.erp} onChange={set('erp')} unit="%" hint="Equity Risk Premium España (Damodaran 2025): ~5.8%." />
                    <InputCell label="Beta" value={inp.beta} onChange={set('beta')} hint={`Sector ${inp.assetType}: beta típico ${reDefaults.beta.toFixed(2)}. Residencial: 0.45–0.55. Comercial: 0.55–0.70. Industrial: 0.65–0.80.`} />
                    <InputCell label="CRP — Prima riesgo país" value={inp.crp} onChange={set('crp')} unit="%" hint="Spain CRP (CDS spread): ~0.72%. Fuente: Damodaran country risk premiums." />
                    <InputCell label="Prima tamaño (SME)" value={inp.sizePremium} onChange={set('sizePremium')} unit="%" hint="Prima por activo privado pequeño. Típico: 1.5–2.5%. Activos >5M€: 1.0–1.5%." />
                    <InputCell label="Coste deuda (pre-tax)" value={inp.debtCost} onChange={set('debtCost')} unit="%" hint={`Tipo hipotecario medio España. Típico sector: ${(reDefaults.debtCost * 100).toFixed(1)}%. Euríbor + diferencial.`} />
                    <InputCell label="Tipo impositivo" value={inp.taxRate} onChange={set('taxRate')} unit="%" hint={`IRPF rendimientos capital: 19–28%. IS (sociedad): 25%. Por defecto sector: ${(reDefaults.taxRate * 100).toFixed(0)}%.`} />
                    <InputCell label="% Equity sobre capital" value={inp.equityWeight} onChange={set('equityWeight')} unit="%" hint={`Si la hipoteca está rellenada, se calcula automáticamente. Actual: ${(baseModel.equityWeightActual * 100).toFixed(0)}% equity / ${((1 - baseModel.equityWeightActual) * 100).toFixed(0)}% deuda.`} />
                    <InputCell label="% Propiedad tuya" value={inp.ownershipPct} onChange={set('ownershipPct')} unit="%" />

                    <SectionHeader title="Valoración y Valor Terminal" color={BLUE_CLR} />
                    <InputCell label="Cap Rate de mercado" value={inp.capRate} onChange={set('capRate')} unit="%" hint={`${reDefaults.capRateHint}. Default sector: ${(reDefaults.capRate * 100).toFixed(1)}%.`} />
                    <InputCell label="Apreciación inmueble / año" value={inp.propertyAppreciation} onChange={set('propertyAppreciation')} unit="%" hint="Histórico España: +2–4%/año. Conservador: 2%." />
                    <InputCell label="Horizonte proyección" value={inp.horizon} onChange={set('horizon')} unit="años" />
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Método valor terminal</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            {(['caprate', 'gordon'] as const).map(m => (
                                <button key={m} onClick={() => setInp(p => ({ ...p, tvMethod: m }))}
                                    style={{
                                        flex: 1, padding: '0.45rem', borderRadius: 6, border: `1px solid ${inp.tvMethod === m ? 'rgba(59,130,246,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer',
                                        background: inp.tvMethod === m ? 'rgba(59,130,246,0.12)' : 'transparent', color: inp.tvMethod === m ? BLUE_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem'
                                    }}>
                                    {m === 'caprate' ? '% NOI / Cap Rate' : '∞ Apreciación valor'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 2: PROYECCIONES ── */}
            {tab === 'proyecciones' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ background: GOLD_BG, borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8125rem', color: GOLD_CLR, border: '1px solid rgba(201,164,78,0.25)' }}>
                        <strong>Revenue driver: </strong>
                        {fmtN(num(inp.areaSqm) * (pct(inp.rentableAreaPct) / 100), 0)} m² alquilables × {inp.rentPerSqm} €/m²/mes × 12 meses × {inp.occupancyRate}% ocupación = <strong>{fmtEur(baseModel.effectiveRentBase)}/año</strong>
                    </div>

                    <ProjTable
                        headers={['Línea / Año', ...baseModel.years.map(y => `Año ${y.year}`)]}
                        rows={[
                            { label: 'Renta bruta anual', values: baseModel.years.map(y => y.grossRent), bold: true },
                            { label: 'Renta efectiva (ocupación)', values: baseModel.years.map(y => y.effectiveRent), bold: true, isFormula: true },
                            { label: '(-) Gastos gestión', values: baseModel.years.map(y => -y.managementFee), indent: true, negative: true },
                            { label: '(-) Mantenimiento', values: baseModel.years.map(y => -y.maintenance), indent: true, negative: true },
                            { label: '(-) IBI + seguro + comunidad', values: baseModel.years.map(y => -(y.opex - y.managementFee - y.maintenance - y.spanishCosts)), indent: true, negative: true },
                            { label: '(-) Basura + derramas + ITP amort.', values: baseModel.years.map(y => -y.spanishCosts), indent: true, negative: true },
                            { label: 'NOI (Net Operating Income)', values: baseModel.years.map(y => y.noi), bold: true, isFormula: true },
                            { label: 'Yield NOI / Valor mercado', values: baseModel.years.map(y => fmtPct(y.noiYield)) },
                            { label: '(-) D&A', values: baseModel.years.map(y => -y.da), indent: true },
                            { label: 'EBIT', values: baseModel.years.map(y => y.ebit), isFormula: true },
                            { label: '(-) Impuestos', values: baseModel.years.map(y => -y.tax), indent: true, negative: true },
                            { label: 'NOPAT', values: baseModel.years.map(y => y.nopat), isFormula: true },
                            { label: '(-) CAPEX', values: baseModel.years.map(y => -y.capex), indent: true, negative: true },
                            { label: 'Free Cash Flow', values: baseModel.years.map(y => y.fcf), bold: true, isOutput: true },
                        ]}
                    />
                </div>
            )}

            {/* ── TAB 3: DCF / NOI ── */}
            {tab === 'dcf' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <h4 style={{ marginBottom: '0.75rem', color: GOLD_CLR }}>🔢 WACC / CAPM</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                            {baseModel.waccResult.details.breakdown.map((b, i) => <FormulaCell key={i} label={b.label} value={fmtPct(b.value)} />)}
                        </div>
                        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: GOLD_BG, borderRadius: 8, fontSize: '0.8rem', color: GOLD_CLR, border: '1px solid rgba(201,164,78,0.25)' }}>
                            <strong>CAPM: </strong>{baseModel.waccResult.details.capmFormula}<br />
                            <strong>WACC: </strong>{baseModel.waccResult.details.waccFormula}
                        </div>
                    </div>

                    <div>
                        <h4 style={{ marginBottom: '0.75rem', color: GOLD_CLR }}>💸 Flujos Descontados</h4>
                        <ProjTable
                            headers={['Componente / Año', ...baseModel.years.map(y => `Año ${y.year}`)]}
                            rows={[
                                { label: 'FCF', values: baseModel.years.map(y => y.fcf), bold: true },
                                { label: `PV (${fmtPct(baseModel.wacc)})`, values: baseModel.years.map((y, i) => y.fcf / Math.pow(1 + baseModel.wacc, i + 1)), isFormula: true },
                            ]}
                            footerRows={[{ label: '∑ PV FCFs', values: [baseModel.pvFCFs, ...Array(baseModel.years.length - 1).fill('')], isOutput: false }]}
                        />
                    </div>

                    <div>
                        <h4 style={{ marginBottom: '0.75rem', color: GREEN_CLR }}>🎯 Enterprise → Equity Value</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                            <FormulaCell label="∑ PV FCFs" value={fmtEur(baseModel.pvFCFs)} formula={`Flujos período explícito (${inp.horizon} años)`} />
                            <FormulaCell label="PV Valor de Salida" value={fmtEur(baseModel.pvExit)} formula={inp.tvMethod === 'caprate' ? `NOI exit / Cap Rate ${inp.capRate}%` : `Apreciación ${inp.propertyAppreciation}%/año`} />
                            <OutputCell label="Enterprise Value" value={fmtEur(baseModel.ev)} />
                            <OutputCell label="Equity Value" value={fmtEur(baseModel.equityValue)} sub={`EV − Hipoteca (${pct(inp.ownershipPct) / 100 * 100}%)`} large />
                        </div>
                        <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                            <FormulaCell label="NOI / Cap Rate ahora" value={fmtEur(baseModel.byCapRateNow)} formula={`${fmtEur(baseModel.noi0)} / ${inp.capRate}%`} />
                            <FormulaCell label="Rendimiento bruto" value={`${baseModel.grossYield.toFixed(2)}%`} formula="Renta efectiva / Valor inmueble" />
                            <FormulaCell label="Rendimiento neto" value={`${baseModel.netYield.toFixed(2)}%`} formula="NOI / Valor inmueble" />
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 4: SENSIBILIDADES ── */}
            {tab === 'sensibilidades' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div>
                        <h4 style={{ marginBottom: '0.5rem', color: GOLD_CLR }}>📊 Equity Value vs WACC × Cap Rate de Salida</h4>
                        <SensTable rowLabel="WACC" colLabel="Cap Rate" rowVals={waccRange} colVals={gRange} matrix={sensWACCxCapRate} baseRowIdx={baseWACCIdx} baseColIdx={baseMidIdx} />
                    </div>
                    <div>
                        <h4 style={{ marginBottom: '0.5rem', color: GOLD_CLR }}>📊 Equity Value vs WACC × Tasa de Ocupación</h4>
                        <SensTable rowLabel="WACC" colLabel="Ocupación" rowVals={waccRange} colVals={occRange} matrix={sensWACCxOcc} baseRowIdx={baseWACCIdx} baseColIdx={baseOccIdx} />
                    </div>
                </div>
            )}

            {/* ── TAB 5: ESCENARIOS ── */}
            {tab === 'escenarios' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        {(['pessimistic', 'base', 'optimistic'] as Scenario[]).map(s => {
                            const m = computeModel(inp, s)
                            const adj = SCEN_ADJ[s]
                            return (
                                <div key={s} style={{ border: `1px solid ${SCEN_COLORS[s]}40`, borderRadius: 10, padding: '1.25rem', background: `${SCEN_COLORS[s]}08` }}>
                                    <div style={{ fontWeight: 800, fontSize: '1rem', color: SCEN_COLORS[s], marginBottom: '0.75rem' }}>{SCEN_LABELS[s]}</div>
                                    <div style={{ fontSize: '0.72rem', color: SCEN_COLORS[s], marginBottom: '0.75rem', fontStyle: 'italic' }}>
                                        Renta ×{adj.rentAdj} · Ocupación ×{adj.occAdj} · WACC {adj.waccAdj >= 0 ? '+' : ''}{(adj.waccAdj * 100).toFixed(1)}p.p.
                                    </div>
                                    {[
                                        ['Renta efectiva año 1', fmtEur(m.effectiveRentBase)],
                                        ['NOI año 1', fmtEur(m.noi0)],
                                        ['NOI Yield', `${m.netYield.toFixed(2)}%`],
                                        ['WACC', fmtPct(m.wacc)],
                                        ['Enterprise Value', fmtEur(m.ev)],
                                        ['Equity Value', fmtEur(m.equityValue)],
                                    ].map(([l, v]) => (
                                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', borderBottom: `1px solid ${SCEN_COLORS[s]}20`, paddingBottom: 4, marginBottom: 4 }}>
                                            <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                                            <span style={{ fontWeight: 700, color: SCEN_COLORS[s] }}>{v}</span>
                                        </div>
                                    ))}
                                </div>
                            )
                        })}
                    </div>
                    <div>
                        {(['pessimistic', 'base', 'optimistic'] as Scenario[]).map(s => {
                            const m = computeModel(inp, s)
                            const max = computeModel(inp, 'optimistic').equityValue || 1
                            return (
                                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                                    <span style={{ width: 110, fontSize: '0.8rem', fontWeight: 700, color: SCEN_COLORS[s] }}>{SCEN_LABELS[s]}</span>
                                    <div style={{ flex: 1, background: 'var(--black-850)', borderRadius: 6, height: 28, overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.max((m.equityValue / max) * 100, 2)}%`, height: '100%', background: `linear-gradient(90deg, ${SCEN_COLORS[s]}80, ${SCEN_COLORS[s]})`, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 10, transition: 'width 0.4s' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{fmtEur(m.equityValue)}</span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
