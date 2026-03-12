import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, RefreshCw } from 'lucide-react'
import {
    InputCell, FormulaCell, OutputCell, SectionHeader,
    ProjTable, SensTable, SensTable as _ST,
    fmtEur, fmtPct, fmtN, num, pct,
    discountCashFlows, gordonTerminalValue, exitMultipleTerminalValue,
    GOLD_BG, GREEN_BG, BLUE_CLR, GOLD_CLR, GREEN_CLR, RED_CLR,
    SCEN_LABELS, SCEN_COLORS,
    type Scenario,
} from '../lib/valuation/modelUtils'
import { computeWACC, sensitivityMatrix, range } from '../lib/valuation/wacc'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Asset } from '../types'

// ── Default scenario multipliers ─────────────────────────────
const SCEN_ADJ: Record<Scenario, { rev: number; cogs: number; staff: number; g: number; waccAdj: number }> = {
    pessimistic: { rev: 0.85, cogs: 1.05, staff: 1.05, g: 0.5, waccAdj: 0.015 },
    base: { rev: 1.00, cogs: 1.00, staff: 1.00, g: 1.0, waccAdj: 0.000 },
    optimistic: { rev: 1.15, cogs: 0.96, staff: 0.97, g: 1.5, waccAdj: -0.010 },
}

interface Inputs {
    // ── Context
    name: string; city: string; regime: 'leased' | 'owned'; openingYear: string
    areaSqm: string; numTables: string; seatsPerTable: string; daysOpen: string
    numEmpleados: string; categoriaLocal: string
    // ── LEASED specific (arrendado)
    leaseStart: string; leaseExpiry: string; depositMonths: string
    leaseRenewable: string; rentReviewType: string; rentFreeMonths: string
    breakClause: string; leaseholdCapex: string; leaseholdAmortYears: string
    // ── OWNED specific (propio)
    purchasePrice: string; ibiAnnual: string; buildingInsurance: string
    communityFees: string; mortgagePrincipal: string; mortgageRate: string
    mortgageYears: string; propAppreciation: string; buildingDA: string
    // ── Revenue drivers — sala
    ticketMedio: string; rotacionTablas: string; otrosIngresos: string
    // ── Delivery platforms
    uberEatsActive: string; uberEatsOrdersMonth: string; uberEatsTicket: string; uberEatsCommission: string
    glovoActive: string; glovoOrdersMonth: string; glovoTicket: string; glovoCommission: string
    packagingCostPerOrder: string
    // ── Cost structure
    cogsRate: string; staffRate: string; annualRent: string
    rentEscalation: string; marketingRate: string; utilsFixed: string; otherFixed: string
    // ── CAPEX & WC
    maintenanceCapex: string; expansionCapex: string; daRate: string
    arDays: string; inventoryDays: string; apDays: string
    // ── Macro
    inflacion: string
    // ── WACC / CAPM
    rf: string; erp: string; beta: string; crp: string; sizePremium: string
    debtCost: string; taxRate: string; equityWeight: string
    debtOutstanding: string; cash: string
    // ── Terminal value
    terminalGrowth: string; ebitdaMultiple: string; tvMethod: 'gordon' | 'multiple'
    // ── Projection
    revGrowth: string; horizon: string; ownershipPct: string
}

const DEFAULTS: Inputs = {
    name: '', city: '', regime: 'leased', openingYear: '2018',
    areaSqm: '200', numTables: '20', seatsPerTable: '4', daysOpen: '340',
    ticketMedio: '18', rotacionTablas: '2.5', otrosIngresos: '0',
    // delivery platforms
    uberEatsActive: 'sí', uberEatsOrdersMonth: '300', uberEatsTicket: '22', uberEatsCommission: '30',
    glovoActive: 'sí', glovoOrdersMonth: '200', glovoTicket: '20', glovoCommission: '28',
    packagingCostPerOrder: '1.5',
    cogsRate: '28', staffRate: '32', annualRent: '36000',
    rentEscalation: '3', marketingRate: '2', utilsFixed: '18000', otherFixed: '12000',
    maintenanceCapex: '15000', expansionCapex: '0', daRate: '3',
    arDays: '5', inventoryDays: '7', apDays: '20',
    inflacion: '2.5',
    // leased defaults
    leaseStart: '', leaseExpiry: '', depositMonths: '2',
    leaseRenewable: 'sí', rentReviewType: 'IPC', rentFreeMonths: '0',
    breakClause: 'no', leaseholdCapex: '60000', leaseholdAmortYears: '10',
    // owned defaults
    purchasePrice: '350000', ibiAnnual: '1200', buildingInsurance: '800',
    communityFees: '0', mortgagePrincipal: '0', mortgageRate: '3.5',
    mortgageYears: '20', propAppreciation: '2.5', buildingDA: '3',
    numEmpleados: '8', categoriaLocal: 'fast_casual',
    rf: '3.4', erp: '5.5', beta: '0.95', crp: '0.8', sizePremium: '2.0',
    debtCost: '4.5', taxRate: '25', equityWeight: '100',
    debtOutstanding: '0', cash: '0',
    terminalGrowth: '2', ebitdaMultiple: '6', tvMethod: 'gordon',
    revGrowth: '5', horizon: '7', ownershipPct: '100',
}

// ── Core DCF computation ───────────────────────────────────
function computeModel(inp: Inputs, scen: Scenario = 'base') {
    const adj = SCEN_ADJ[scen]
    const H = Math.max(1, parseInt(inp.horizon) || 7)

    // Revenue build-up year 0 (current)
    const revSala = num(inp.numTables) * num(inp.seatsPerTable) * num(inp.rotacionTablas) * num(inp.ticketMedio) * num(inp.daysOpen)

    // ── Delivery platform revenue (gross) & commission cost
    const calcPlatform = (active: string, ordersMonth: string, ticket: string, commission: string) => {
        if (active !== 'sí') return { gross: 0, netRev: 0, commissionCost: 0, orders: 0 }
        const orders = num(ordersMonth) * 12
        const gross = orders * num(ticket)
        const commissionCost = gross * pct(commission)
        const packagingCost = orders * num(inp.packagingCostPerOrder)
        const netRev = gross - commissionCost - packagingCost
        return { gross, netRev, commissionCost: commissionCost + packagingCost, orders }
    }
    const ue = calcPlatform(inp.uberEatsActive, inp.uberEatsOrdersMonth, inp.uberEatsTicket, inp.uberEatsCommission)
    const gl = calcPlatform(inp.glovoActive, inp.glovoOrdersMonth, inp.glovoTicket, inp.glovoCommission)

    const revDeliveryGross = ue.gross + gl.gross
    const revDelivery = ue.netRev + gl.netRev
    const totalDeliveryCommissions = ue.commissionCost + gl.commissionCost
    const totalDeliveryOrders = ue.orders + gl.orders

    const revOtros = num(inp.otrosIngresos)
    const revBase = (revSala + revDelivery + revOtros) * adj.rev

    const revGrowth = pct(inp.revGrowth)
    const cogsR = pct(inp.cogsRate) * adj.cogs
    const staffR = pct(inp.staffRate) * adj.staff
    const mktR = pct(inp.marketingRate)
    const daR = pct(inp.daRate)
    const rentEsc = pct(inp.rentEscalation)
    const rentBase = num(inp.annualRent)
    const utils = num(inp.utilsFixed)
    const fixed = num(inp.otherFixed)
    const mCapex = num(inp.maintenanceCapex)
    const eCapex = num(inp.expansionCapex)
    // WC = AR + Inventory - AP (in days of revenue)
    const wcNetDays = num(inp.arDays) + num(inp.inventoryDays) - num(inp.apDays)
    const inflacion = pct(inp.inflacion)
    const taxR = pct(inp.taxRate)

    // WACC
    const eW = pct(inp.equityWeight) / 100
    const dW = 1 - eW
    const waccResult = computeWACC({
        riskFreeRate: pct(inp.rf), equityRiskPremium: pct(inp.erp), beta: num(inp.beta),
        countryRiskPremium: pct(inp.crp), sizePremium: pct(inp.sizePremium),
        costOfDebt: pct(inp.debtCost), taxRate: taxR,
        equityWeight: eW, debtWeight: dW,
    })
    const wacc = waccResult.wacc + adj.waccAdj

    const years: {
        year: number; rev: number; cogs: number; gp: number; staff: number
        rent: number; mkt: number; ebitda: number; da: number; ebit: number
        tax: number; nopat: number; capex: number; deltaWC: number; fcf: number; ebitdaMargin: number
    }[] = []

    let prevRev = revBase
    for (let y = 1; y <= H; y++) {
        const rev = prevRev * (1 + revGrowth)
        const cogs = rev * cogsR
        const gp = rev - cogs
        const staff = rev * staffR
        const rent = rentBase * Math.pow(1 + rentEsc, y)
        const mkt = rev * mktR
        const Utils = utils * Math.pow(1 + inflacion, y)
        const Fixed = fixed * Math.pow(1 + inflacion, y)
        const ebitda = gp - staff - rent - mkt - Utils - Fixed
        const da = rev * daR
        const ebit = ebitda - da
        const tax = Math.max(ebit * taxR, 0)
        const nopat = ebit - tax
        const capex = (mCapex + eCapex) * Math.pow(1 + revGrowth, y - 1)
        const deltaWC = (rev - prevRev) * (wcNetDays / 365)
        const fcf = nopat + da - capex - deltaWC
        years.push({ year: y, rev, cogs, gp, staff, rent, mkt, ebitda, da, ebit, tax, nopat, capex, deltaWC, fcf, ebitdaMargin: ebitda / rev })
        prevRev = rev
    }

    const pvFCFs = discountCashFlows(years.map(y => y.fcf), wacc)
    const lastFCF = years[years.length - 1].fcf
    const lastEBITDA = years[years.length - 1].ebitda
    const g = pct(inp.terminalGrowth) * adj.g

    const tvRaw = inp.tvMethod === 'gordon'
        ? gordonTerminalValue(lastFCF, g, wacc)
        : exitMultipleTerminalValue(lastEBITDA, num(inp.ebitdaMultiple))
    const pvTV = tvRaw / Math.pow(1 + wacc, H)

    const ev = pvFCFs + pvTV
    const equityValue = (ev - num(inp.debtOutstanding) + num(inp.cash)) * (pct(inp.ownershipPct) / 100)

    return { years, waccResult, wacc, pvFCFs, pvTV, tvRaw, ev, equityValue, revBase, revSala, revDelivery, revDeliveryGross, totalDeliveryCommissions, totalDeliveryOrders, ue, gl, g }
}

// ═══════════════════════════════════════════════════════════════
export default function RestaurantModelPage({ asset }: { asset: Asset }) {
    const navigate = useNavigate()
    const { user } = useAuth()

    // Load saved inputs from sector_data (pre-populated from PDF data for Madrid)
    const sd = (asset.sector_data ?? {}) as Record<string, unknown>
    const [inp, setInp] = useState<Inputs>({
        ...DEFAULTS,
        name: asset.name,
        city: String(sd.city ?? ''),
        regime: (sd.regime as 'leased' | 'owned') ?? 'leased',
        // ── Operational drivers
        numTables: String(sd.num_tables ?? DEFAULTS.numTables),
        seatsPerTable: String(sd.seats_per_table ?? DEFAULTS.seatsPerTable),
        daysOpen: String(sd.days_open ?? DEFAULTS.daysOpen),
        ticketMedio: String(sd.ticket_medium ?? DEFAULTS.ticketMedio),
        rotacionTablas: String(sd.table_rotation ?? DEFAULTS.rotacionTablas),
        areaSqm: String(sd.area_sqm ?? DEFAULTS.areaSqm),
        openingYear: String(sd.opening_year ?? DEFAULTS.openingYear),
        numEmpleados: String(sd.staff_count ?? DEFAULTS.numEmpleados),
        otrosIngresos: String(sd.otros_ingresos ?? DEFAULTS.otrosIngresos),
        // ── Delivery platforms
        uberEatsActive: String(sd.uber_eats_active ?? DEFAULTS.uberEatsActive),
        uberEatsOrdersMonth: String(sd.uber_eats_orders_month ?? DEFAULTS.uberEatsOrdersMonth),
        uberEatsTicket: String(sd.uber_eats_ticket ?? DEFAULTS.uberEatsTicket),
        uberEatsCommission: String(sd.uber_eats_commission ?? DEFAULTS.uberEatsCommission),
        glovoActive: String(sd.glovo_active ?? DEFAULTS.glovoActive),
        glovoOrdersMonth: String(sd.glovo_orders_month ?? DEFAULTS.glovoOrdersMonth),
        glovoTicket: String(sd.glovo_ticket ?? DEFAULTS.glovoTicket),
        glovoCommission: String(sd.glovo_commission ?? DEFAULTS.glovoCommission),
        packagingCostPerOrder: String(sd.packaging_cost_per_order ?? DEFAULTS.packagingCostPerOrder),
        // ── Cost structure (exact % from real P&L)
        cogsRate: String(sd.cogs_pct ?? DEFAULTS.cogsRate),
        staffRate: String(sd.staff_pct ?? DEFAULTS.staffRate),
        annualRent: String(sd.annual_rent ?? DEFAULTS.annualRent),
        rentEscalation: String(sd.rent_escalation ?? DEFAULTS.rentEscalation),
        marketingRate: String(sd.marketing_rate ?? DEFAULTS.marketingRate),
        utilsFixed: String(sd.utils_fixed ?? DEFAULTS.utilsFixed),
        otherFixed: String(sd.other_fixed ?? DEFAULTS.otherFixed),
        // ── CAPEX & D&A
        maintenanceCapex: String(sd.maintenance_capex ?? DEFAULTS.maintenanceCapex),
        expansionCapex: String(sd.expansion_capex ?? DEFAULTS.expansionCapex),
        daRate: String(sd.da_rate ?? DEFAULTS.daRate),
        // ── Working capital (from balance sheet)
        arDays: String(sd.ar_days ?? DEFAULTS.arDays),
        inventoryDays: String(sd.inventory_days ?? DEFAULTS.inventoryDays),
        apDays: String(sd.ap_days ?? DEFAULTS.apDays),
        // ── Macro
        inflacion: String(sd.inflacion ?? DEFAULTS.inflacion),
        // ── WACC / CAPM
        rf: String(sd.rf ?? DEFAULTS.rf),
        erp: String(sd.erp ?? DEFAULTS.erp),
        beta: String(sd.beta ?? DEFAULTS.beta),
        crp: String(sd.crp ?? DEFAULTS.crp),
        sizePremium: String(sd.size_premium ?? DEFAULTS.sizePremium),
        debtCost: String(sd.debt_cost ?? DEFAULTS.debtCost),
        taxRate: String(sd.tax_rate ?? DEFAULTS.taxRate),
        equityWeight: String(sd.equity_weight ?? DEFAULTS.equityWeight),
        // ── Balance sheet (cash & net debt)
        cash: String(sd.cash ?? DEFAULTS.cash),
        debtOutstanding: String(sd.debt_outstanding ?? DEFAULTS.debtOutstanding),
        // ── Leased inputs
        leaseStart: String(sd.lease_start ?? DEFAULTS.leaseStart),
        leaseExpiry: String(sd.lease_expiry ?? DEFAULTS.leaseExpiry),
        depositMonths: String(sd.deposit_months ?? DEFAULTS.depositMonths),
        leaseRenewable: String(sd.lease_renewable ?? DEFAULTS.leaseRenewable),
        rentReviewType: String(sd.rent_review_type ?? DEFAULTS.rentReviewType),
        rentFreeMonths: String(sd.rent_free_months ?? DEFAULTS.rentFreeMonths),
        breakClause: String(sd.break_clause ?? DEFAULTS.breakClause),
        leaseholdCapex: String(sd.leasehold_capex ?? DEFAULTS.leaseholdCapex),
        leaseholdAmortYears: String(sd.leasehold_amort_years ?? DEFAULTS.leaseholdAmortYears),
        // ── Terminal value
        terminalGrowth: String(sd.terminal_growth ?? DEFAULTS.terminalGrowth),
        ebitdaMultiple: String(sd.ebitda_multiple ?? DEFAULTS.ebitdaMultiple),
        tvMethod: (sd.tv_method as 'gordon' | 'multiple') ?? DEFAULTS.tvMethod,
        // ── Projection
        revGrowth: String(sd.revenue_growth_pct ?? DEFAULTS.revGrowth),
        horizon: String(sd.horizon ?? DEFAULTS.horizon),
        ownershipPct: String(sd.ownership_pct ?? DEFAULTS.ownershipPct),
    })

    const set = (k: keyof Inputs) => (v: string) => setInp(p => ({ ...p, [k]: v }))
    const [tab, setTab] = useState<'supuestos' | 'proyecciones' | 'dcf' | 'sensibilidades' | 'escenarios'>('supuestos')
    const [scenario, setScenario] = useState<Scenario>('base')
    const [saving, setSaving] = useState(false)



    const model = useMemo(() => computeModel(inp, scenario), [inp, scenario])
    const baseModel = useMemo(() => computeModel(inp, 'base'), [inp])

    // ── Sensitivity matrices

    const waccRange = range(0.06, 0.16, 9)
    const gRange = range(0.005, 0.04, 7)
    const ebitdaRange = range(0.10, 0.25, 8)

    const sensWACCxG = sensitivityMatrix(waccRange, gRange, (w, g) => {
        const m = computeModel({ ...inp, tvMethod: 'gordon', terminalGrowth: String(g * 100) }, 'base')
        const pvFCFs = discountCashFlows(m.years.map(y => y.fcf), w)
        const gCapped = Math.min(g, w - 0.005)
        const lastFCF = m.years[m.years.length - 1].fcf
        const tv = (lastFCF * (1 + gCapped)) / (w - gCapped)
        const pvTV = tv / Math.pow(1 + w, m.years.length)
        return Math.max(pvFCFs + pvTV - num(inp.debtOutstanding), 0)
    }).map(r => r.map(c => c?.value ?? 0))

    const sensWACCxEBITDA = sensitivityMatrix(waccRange, ebitdaRange, (w, ebt) => {
        const m = computeModel({ ...inp, staffRate: String(((pct(inp.cogsRate) + pct(inp.staffRate)) - (pct(inp.cogsRate) + 1 - ebt - pct(inp.cogsRate))) * 100) }, 'base')
        const rev0 = m.revBase * (1 + pct(inp.revGrowth))
        const ebitda0 = rev0 * ebt
        const fcfs = m.years.map(y => ({ ...y, ebitda: y.rev * ebt, fcf: y.rev * ebt - y.da - (y.capex ?? 0) - (y.deltaWC ?? 0) }))
        const pvFCFs = discountCashFlows(fcfs.map(y => y.fcf), w)
        const lastEBITDA = fcfs[fcfs.length - 1].ebitda
        const tv = lastEBITDA * num(inp.ebitdaMultiple)
        const pvTV = tv / Math.pow(1 + w, m.years.length)
        return Math.max(pvFCFs + pvTV - num(inp.debtOutstanding), 0)
    }).map(r => r.map(c => c?.value ?? 0))

    const baseWACCIdx = Math.round(waccRange.length / 2) - 1
    const baseGIdx = Math.round(gRange.length / 2) - 1
    const baseEIdx = Math.round(ebitdaRange.length / 2) - 1

    // ── Save handler ─────────────────────────────────────────
    const handleSave = async () => {
        if (!user) return
        setSaving(true)
        const m = baseModel
        await supabase.from('patrimonio_assets').update({
            sector_data: {
                ...sd,
                city: inp.city, regime: inp.regime,
                num_tables: num(inp.numTables), seats_per_table: num(inp.seatsPerTable),
                days_open: num(inp.daysOpen), ticket_medium: num(inp.ticketMedio),
                table_rotation: num(inp.rotacionTablas), annual_rent: num(inp.annualRent),
                cogs_pct: num(inp.cogsRate), staff_pct: num(inp.staffRate),
                area_sqm: num(inp.areaSqm), revenue_growth_pct: num(inp.revGrowth),
                discount_rate_pct: m.wacc * 100, debt_outstanding: num(inp.debtOutstanding),
                opening_year: inp.openingYear,
            }
        }).eq('id', asset.id)

        await supabase.from('patrimonio_valuation_snapshots').insert({
            user_id: user.id, asset_id: asset.id,
            snapshot_date: new Date().toISOString().split('T')[0],
            value_low: Math.round(computeModel(inp, 'pessimistic').equityValue),
            value_base: Math.round(m.equityValue),
            value_high: Math.round(computeModel(inp, 'optimistic').equityValue),
            method_used: 'dcf', confidence_score: 'high',
            drivers: m.waccResult.details.breakdown.map(b => `${b.label}: ${fmtPct(b.value)}`),
            explanation: `Modelo DCF completo. WACC ${fmtPct(m.wacc)}. EV ${fmtEur(m.ev)}.`,
            assumptions_metadata: { wacc: m.wacc, ev: m.ev, pvFCFs: m.pvFCFs, pvTV: m.pvTV },
        })
        setSaving(false)
        navigate('/assets')
    }

    const TABS = [
        { key: 'supuestos', label: '📋 Supuestos' },
        { key: 'proyecciones', label: '📈 Proyecciones' },
        { key: 'dcf', label: '💰 DCF' },
        { key: 'sensibilidades', label: '🔥 Sensibilidades' },
        { key: 'escenarios', label: '📊 Escenarios' },
    ] as const

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: '4rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                    <button onClick={() => navigate('/assets')} className="btn btn-ghost btn-sm" style={{ marginBottom: 6 }}>
                        <ArrowLeft size={13} /> Volver
                    </button>
                    <h2 style={{ marginBottom: 4 }}>{asset.name}</h2>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="badge badge-gold">Restauración · Modelo DCF Pro</span>
                        <span className="badge badge-muted">{inp.regime === 'leased' ? 'Local arrendado' : 'Local propio'}</span>
                        <span style={{ fontSize: '0.72rem', color: BLUE_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(59,130,246,0.12)', borderRadius: 20 }}>🔵 Azul = Inputs</span>
                        <span style={{ fontSize: '0.72rem', color: GOLD_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(201,164,78,0.12)', borderRadius: 20 }}>🟡 Dorado = Fórmulas</span>
                        <span style={{ fontSize: '0.72rem', color: GREEN_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(34,197,94,0.12)', borderRadius: 20 }}>🟢 Verde = Outputs</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
                        <Save size={14} /> {saving ? 'Guardando...' : 'Guardar + Snapshot'}
                    </button>
                </div>
            </div>

            {/* Quick KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <OutputCell label="Equity Value (base)" value={fmtEur(baseModel.equityValue)} large />
                <OutputCell label="Enterprise Value" value={fmtEur(baseModel.ev)} />
                <FormulaCell label="WACC" value={fmtPct(baseModel.wacc)} formula={baseModel.waccResult.details.waccFormula} />
                <FormulaCell label="Revenue año 1" value={fmtEur(baseModel.years[0]?.rev ?? 0)} formula={`${inp.numTables} mesas × ${inp.rotacionTablas} rot × ${inp.ticketMedio}€ × ${inp.daysOpen}d`} />
                <FormulaCell label="EBITDA año 1" value={fmtEur(baseModel.years[0]?.ebitda ?? 0)} formula={`Margen: ${fmtPct(baseModel.years[0]?.ebitdaMargin ?? 0)}`} />
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 3, marginBottom: '1.25rem', padding: 4, background: 'var(--black-800)', borderRadius: 10, border: '1px solid var(--border-muted)' }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{
                            flex: 1, padding: '0.55rem 0.5rem', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                            background: tab === t.key ? 'rgba(201,164,78,0.18)' : 'transparent',
                            color: tab === t.key ? GOLD_CLR : 'var(--text-muted)',
                            transition: 'all 0.15s',
                        }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ──────────────────── TAB 1: SUPUESTOS ──────────────────── */}
            {tab === 'supuestos' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>

                    <SectionHeader title="Identificación" />
                    <InputCell label="Nombre" value={inp.name} onChange={set('name')} type="text" placeholder="Mister Noodles — Puerto Banús" />
                    <InputCell label="Ciudad" value={inp.city} onChange={set('city')} type="text" placeholder="Fuengirola" />
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Régimen local</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            {(['leased', 'owned'] as const).map(r => (
                                <button key={r} onClick={() => setInp(p => ({ ...p, regime: r }))}
                                    style={{
                                        flex: 1, padding: '0.45rem', borderRadius: 6, border: `1px solid ${inp.regime === r ? 'rgba(59,130,246,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer',
                                        background: inp.regime === r ? 'rgba(59,130,246,0.12)' : 'transparent', color: inp.regime === r ? BLUE_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.8rem'
                                    }}>
                                    {r === 'leased' ? '📋 Arrendado' : '🏠 Propio'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <InputCell label="Año apertura" value={inp.openingYear} onChange={set('openingYear')} placeholder="2018" />
                    <InputCell label="Superficie" value={inp.areaSqm} onChange={set('areaSqm')} unit="m²" />
                    <InputCell label="Nº empleados" value={inp.numEmpleados} onChange={set('numEmpleados')} hint="Plantilla total (fijos + parciales). Dato clave para ratios de productividad." />

                    {/* ── LEASED: Contrato de arrendamiento ── */}
                    {inp.regime === 'leased' && (<>
                        <SectionHeader title="📋 Contrato de Arrendamiento — Local Arrendado" color={BLUE_CLR} />
                        <InputCell label="Fecha inicio contrato" value={inp.leaseStart} onChange={set('leaseStart')} type="date" hint="Fecha de inicio del contrato vigente." />
                        <InputCell label="Fecha vencimiento" value={inp.leaseExpiry} onChange={set('leaseExpiry')} type="date" hint="Fecha de fin del contrato. Clave para el horizonte de proyección." />
                        <InputCell label="Depósito / fianza" value={inp.depositMonths} onChange={set('depositMonths')} unit="meses de renta" hint="Número de meses de renta depositados. En España: 1–2 meses para usos distintos a vivienda." />
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tipo de revisión de renta</span>
                            <select value={inp.rentReviewType} onChange={e => setInp(p => ({ ...p, rentReviewType: e.target.value }))}
                                style={{ marginTop: 6, width: '100%', padding: '0.45rem 0.6rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 6, color: BLUE_CLR, fontWeight: 700, fontSize: '0.875rem' }}>
                                <option value="IPC">IPC (Índice de Precios al Consumo)</option>
                                <option value="fixed">% Fijo pactado</option>
                                <option value="market">Revisión a mercado</option>
                                <option value="none">Sin revisión</option>
                            </select>
                        </div>
                        <InputCell label="Período de carencia (rent-free)" value={inp.rentFreeMonths} onChange={set('rentFreeMonths')} unit="meses" hint="Meses iniciales sin renta, habitual en reformas o en negociaciones de largo plazo. Reduce renta media efectiva." />
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Renovable</span>
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                {(['sí', 'tácita', 'no'] as const).map(r => (
                                    <button key={r} onClick={() => setInp(p => ({ ...p, leaseRenewable: r }))}
                                        style={{ flex: 1, padding: '0.4rem', borderRadius: 6, border: `1px solid ${inp.leaseRenewable === r ? 'rgba(59,130,246,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer', background: inp.leaseRenewable === r ? 'rgba(59,130,246,0.12)' : 'transparent', color: inp.leaseRenewable === r ? BLUE_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem' }}>
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cláusula de rescisión anticipada</span>
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                {(['sí', 'no'] as const).map(r => (
                                    <button key={r} onClick={() => setInp(p => ({ ...p, breakClause: r }))}
                                        style={{ flex: 1, padding: '0.4rem', borderRadius: 6, border: `1px solid ${inp.breakClause === r ? 'rgba(59,130,246,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer', background: inp.breakClause === r ? 'rgba(59,130,246,0.12)' : 'transparent', color: inp.breakClause === r ? BLUE_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem' }}>
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <InputCell label="CAPEX adecuación / fit-out" value={inp.leaseholdCapex} onChange={set('leaseholdCapex')} unit="€ total" hint="Inversión en reforma y adecuación del local arrendado (cocina, barra, sala). Se amortiza durante el contrato." />
                        <InputCell label="Vida útil / amortización fit-out" value={inp.leaseholdAmortYears} onChange={set('leaseholdAmortYears')} unit="años" hint="Plazo de amortización de las mejoras. Normalmente = duración del contrato." />
                        <div style={{ gridColumn: 'span 3', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8rem', color: BLUE_CLR }}>
                            <strong>⚠️ Riesgo arrendatario:</strong> Si el contrato vence en {inp.leaseExpiry || '—'}, el valor del negocio depende críticamente de la renovación.
                            El fit-out ({inp.leaseholdCapex} €) se amortiza a {inp.leaseholdAmortYears} años → {num(inp.leaseholdCapex) > 0 && num(inp.leaseholdAmortYears) > 0 ? `${(num(inp.leaseholdCapex) / num(inp.leaseholdAmortYears)).toFixed(0)} €/año D&A adicional` : '—'}.
                            Depósito = {num(inp.depositMonths) > 0 ? `${(num(inp.depositMonths) * num(inp.annualRent) / 12).toFixed(0)} € (${inp.depositMonths} meses)` : '—'}.
                        </div>
                    </>)}

                    {/* ── OWNED: Inmueble propio ── */}
                    {inp.regime === 'owned' && (<>
                        <SectionHeader title="🏠 Inmueble Propio — Datos de Propiedad" color={BLUE_CLR} />
                        <InputCell label="Precio de adquisición" value={inp.purchasePrice} onChange={set('purchasePrice')} unit="€ total" hint="Precio total de compra incluyendo impuestos (IVA o ITP) y notaria." />
                        <InputCell label="IBI anual" value={inp.ibiAnnual} onChange={set('ibiAnnual')} unit="€/año" hint="Impuesto sobre Bienes Inmuebles. Consultar recibo catastral. Deducible como gasto del negocio." />
                        <InputCell label="Seguro del edificio" value={inp.buildingInsurance} onChange={set('buildingInsurance')} unit="€/año" hint="Seguro multirriesgo del inmueble. ~0.1–0.3% del valor asegurado. Cargo al propietario, no al inquilino." />
                        <InputCell label="Cuota comunidad propietarios" value={inp.communityFees} onChange={set('communityFees')} unit="€/año" hint="Si el local forma parte de un edificio con comunidad. 0 si edificio exclusivo." />
                        <InputCell label="Apreciación inmueble / año" value={inp.propAppreciation} onChange={set('propAppreciation')} unit="%" hint="Tasa de revalorización anual del inmueble. España costa histórico: +2–4%/año." />
                        <InputCell label="D&A edificio" value={inp.buildingDA} onChange={set('buildingDA')} unit="% valor compra" hint="Amortización anual del inmueble. Fiscal España: 3% del precio de construcción. Contable: vida útil 33–50 años." />

                        <SectionHeader title="💳 Financiación — Hipoteca / Préstamo" color={BLUE_CLR} />
                        <InputCell label="Capital hipoteca pendiente" value={inp.mortgagePrincipal} onChange={set('mortgagePrincipal')} unit="€" hint="Importe principal pendiente de amortizar. Se resta del EV para calcular Equity Value." />
                        <InputCell label="Tipo interés hipoteca" value={inp.mortgageRate} onChange={set('mortgageRate')} unit="%" hint="Tipo de interés anual del préstamo hipotecario. Fijo o Euribor + spread." />
                        <InputCell label="Años restantes hipoteca" value={inp.mortgageYears} onChange={set('mortgageYears')} unit="años" hint="Vida residual del préstamo. Se usa para calcular el servicio de deuda anual." />
                        <div style={{ gridColumn: 'span 3', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8rem', color: BLUE_CLR }}>
                            {(() => {
                                const P = num(inp.mortgagePrincipal), r = pct(inp.mortgageRate) / 12, n = num(inp.mortgageYears) * 12
                                const monthly = n > 0 && r > 0 ? P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : 0
                                const propVal = num(inp.purchasePrice) * Math.pow(1 + pct(inp.propAppreciation), parseInt(inp.horizon) || 7)
                                return <>
                                    <strong>Cuota hipoteca mensual:</strong> {monthly > 0 ? `${monthly.toFixed(0)} €/mes (${(monthly * 12).toFixed(0)} €/año)` : 'Sin financiación'}&nbsp;&nbsp;
                                    <strong>Valor estimado inmueble en {inp.horizon}a:</strong> {(num(inp.purchasePrice) * Math.pow(1 + pct(inp.propAppreciation), parseInt(inp.horizon) || 7)).toLocaleString('es-ES', { maximumFractionDigits: 0 })} € (+{fmtPct(Math.pow(1 + pct(inp.propAppreciation), parseInt(inp.horizon) || 7) - 1)})
                                </>
                            })()}
                        </div>
                    </>)}



                    <SectionHeader title="Drivers de Ingresos — Restaurante" color={BLUE_CLR} />
                    <InputCell label="Número de mesas" value={inp.numTables} onChange={set('numTables')} hint="Total de mesas disponibles en la sala." />

                    <InputCell label="Asientos por mesa" value={inp.seatsPerTable} onChange={set('seatsPerTable')} hint="Media de personas por mesa." />
                    <InputCell label="Rotación de mesas / día" value={inp.rotacionTablas} onChange={set('rotacionTablas')} unit="veces" hint="Cuántas veces se ocupa una mesa al día. Típico fast-casual: 2–4." />
                    <InputCell label="Ticket medio sala" value={inp.ticketMedio} onChange={set('ticketMedio')} unit="€/persona" hint="Precio medio por comensal en sala, neto de IVA." />
                    <InputCell label="Días abiertos / año" value={inp.daysOpen} onChange={set('daysOpen')} unit="días" hint="Días operativos. Típico: 300–350." />
                    <InputCell label="Otros ingresos" value={inp.otrosIngresos} onChange={set('otrosIngresos')} unit="€/año" hint="Catering, eventos, merchandising, etc." />

                    {/* ── DELIVERY PLATFORMS ── */}
                    <SectionHeader title="📱 Canales de Delivery — Plataformas & Propio" color={BLUE_CLR} />
                    <InputCell label="Coste packaging por pedido" value={inp.packagingCostPerOrder} onChange={set('packagingCostPerOrder')} unit="€/pedido" hint="Cajas, bolsas, cubiertos desechables. ~1–2€/pedido. Se aplica a todos los canales." />
                    <div style={{ gridColumn: 'span 2' }} />

                    {/* Uber Eats */}
                    {([
                        { key: 'uberEats', label: '🟠 Uber Eats', activeKey: 'uberEatsActive', ordersKey: 'uberEatsOrdersMonth', ticketKey: 'uberEatsTicket', commKey: 'uberEatsCommission', defaultComm: '30', hint: 'Comisión Uber Eats: 15–35% según contrato. Típico SME en España: ~28–30%.' },
                        { key: 'glovo', label: '🟡 Glovo', activeKey: 'glovoActive', ordersKey: 'glovoOrdersMonth', ticketKey: 'glovoTicket', commKey: 'glovoCommission', defaultComm: '28', hint: 'Comisión Glovo: ~25–30%. Factura por pedido + comisión variable.' },

                    ] as const).map(({ key, label, activeKey, ordersKey, ticketKey, commKey, hint }) => {
                        const isActive = (inp as unknown as Record<string, string>)[activeKey] === 'sí'
                        const orders = parseFloat((inp as unknown as Record<string, string>)[ordersKey]) || 0
                        const ticket = parseFloat((inp as unknown as Record<string, string>)[ticketKey]) || 0
                        const comm = parseFloat((inp as unknown as Record<string, string>)[commKey]) || 0
                        const grossMonthly = orders * ticket
                        const netMonthly = grossMonthly * (1 - comm / 100) - orders * (parseFloat(inp.packagingCostPerOrder) || 0)
                        return (
                            <div key={key} style={{ gridColumn: 'span 3', background: isActive ? 'rgba(59,130,246,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isActive ? 'rgba(59,130,246,0.25)' : 'var(--border-muted)'}`, borderRadius: 10, padding: '1rem 1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isActive ? 12 : 0 }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: isActive ? BLUE_CLR : 'var(--text-muted)', flex: 1 }}>{label}</span>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {(['sí', 'no'] as const).map(v => (
                                            <button key={v} onClick={() => setInp(p => ({ ...p, [activeKey]: v }))}
                                                style={{ padding: '0.3rem 0.75rem', borderRadius: 6, border: `1px solid ${(inp as unknown as Record<string, string>)[activeKey] === v ? 'rgba(59,130,246,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer', background: (inp as unknown as Record<string, string>)[activeKey] === v ? 'rgba(59,130,246,0.15)' : 'transparent', color: (inp as unknown as Record<string, string>)[activeKey] === v ? BLUE_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.75rem' }}>
                                                {v === 'sí' ? '✓ Activo' : '✗ Inactivo'}
                                            </button>
                                        ))}
                                    </div>
                                    {isActive && <div style={{ fontSize: '0.78rem', padding: '2px 10px', borderRadius: 20, background: netMonthly > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: netMonthly > 0 ? GREEN_CLR : RED_CLR, fontWeight: 700 }}>Neto: {(netMonthly).toFixed(0)} €/mes</div>}
                                </div>
                                {isActive && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                                        <InputCell label="Pedidos / mes" value={(inp as unknown as Record<string, string>)[ordersKey]} onChange={v => setInp(p => ({ ...p, [ordersKey]: v }))} hint="Número de pedidos recibidos en este canal por mes." />
                                        <InputCell label="Ticket medio" value={(inp as unknown as Record<string, string>)[ticketKey]} onChange={v => setInp(p => ({ ...p, [ticketKey]: v }))} unit="€/pedido" hint="Precio medio del pedido en esta plataforma (bruto)." />
                                        <InputCell label="Comisión plataforma" value={(inp as unknown as Record<string, string>)[commKey]} onChange={v => setInp(p => ({ ...p, [commKey]: v }))} unit="%" hint={hint} />
                                        <div style={{ gridColumn: 'span 3', fontSize: '0.78rem', color: BLUE_CLR, padding: '6px 10px', background: 'rgba(59,130,246,0.06)', borderRadius: 6 }}>
                                            💡 <strong>Bruto:</strong> {(grossMonthly).toFixed(0)} €/mes &nbsp;|&nbsp;
                                            <strong>Comisión:</strong> −{(grossMonthly * comm / 100).toFixed(0)} €/mes ({comm}%) &nbsp;|&nbsp;
                                            <strong>Packaging:</strong> −{(orders * (parseFloat(inp.packagingCostPerOrder) || 0)).toFixed(0)} €/mes &nbsp;|&nbsp;
                                            <strong>Neto anual:</strong> {(netMonthly * 12).toFixed(0)} € &nbsp;|&nbsp;
                                            <strong>Coste comisión anual:</strong> {(grossMonthly * comm / 100 * 12).toFixed(0)} €
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {/* Delivery summary */}
                    {(inp.uberEatsActive === 'sí' || inp.glovoActive === 'sí') && (() => {
                        const totalGross = [
                            inp.uberEatsActive === 'sí' ? (parseFloat(inp.uberEatsOrdersMonth) || 0) * (parseFloat(inp.uberEatsTicket) || 0) * 12 : 0,
                            inp.glovoActive === 'sí' ? (parseFloat(inp.glovoOrdersMonth) || 0) * (parseFloat(inp.glovoTicket) || 0) * 12 : 0,
                        ].reduce((a, b) => a + b, 0)
                        const totalComm = [
                            inp.uberEatsActive === 'sí' ? (parseFloat(inp.uberEatsOrdersMonth) || 0) * (parseFloat(inp.uberEatsTicket) || 0) * (parseFloat(inp.uberEatsCommission) || 0) / 100 * 12 : 0,
                            inp.glovoActive === 'sí' ? (parseFloat(inp.glovoOrdersMonth) || 0) * (parseFloat(inp.glovoTicket) || 0) * (parseFloat(inp.glovoCommission) || 0) / 100 * 12 : 0,
                        ].reduce((a, b) => a + b, 0)
                        return (
                            <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', padding: '1rem', background: 'rgba(201,164,78,0.06)', border: '1px solid rgba(201,164,78,0.25)', borderRadius: 10 }}>
                                <FormulaCell label="Ventas brutas delivery/año" value={fmtEur(totalGross)} formula="Suma todos los canales antes de comisiones" />
                                <FormulaCell label="Comisiones totales/año" value={fmtEur(totalComm)} formula="Coste real que debes afrontar a las plataformas" />
                                <FormulaCell label="% Comisión efectiva" value={fmtPct(totalGross > 0 ? totalComm / totalGross : 0)} formula="Porcentaje de margen drenado por plataformas" />
                                <OutputCell label="Ventas netas delivery/año" value={fmtEur(totalGross - totalComm)} sub="Ingreso real que entra en tu P&L" />
                            </div>
                        )
                    })()}



                    <SectionHeader title="Estructura de Costes" color={BLUE_CLR} />
                    <InputCell label="COGS / Food cost" value={inp.cogsRate} onChange={set('cogsRate')} unit="% ventas" hint="Coste de materias primas como % de ventas. Típico hostelería: 25–35%." />
                    <InputCell label="Coste personal" value={inp.staffRate} onChange={set('staffRate')} unit="% ventas" hint="Salarios, SS, formación, ETTs. Típico: 28–38% ventas." />
                    <InputCell label="Alquiler anual" value={inp.annualRent} onChange={set('annualRent')} unit="€/año" hint={inp.regime === 'leased' ? 'Renta contractual. 0 si local propio.' : 'Local propio. Introduce 0 o coste de oportunidad.'} />
                    <InputCell label="Escalada alquiler (IPC)" value={inp.rentEscalation} onChange={set('rentEscalation')} unit="%" hint="Subida anual contractual del alquiler. Típico: CPI ~2-3%." />
                    <InputCell label="Marketing y publicidad" value={inp.marketingRate} onChange={set('marketingRate')} unit="% ventas" hint="Redes sociales, plataformas delivery, Google Ads." />
                    <InputCell label="Suministros y utilities" value={inp.utilsFixed} onChange={set('utilsFixed')} unit="€/año" hint="Luz, agua, gas, Internet, limpieza." />
                    <InputCell label="Otros gastos fijos" value={inp.otherFixed} onChange={set('otherFixed')} unit="€/año" hint="Seguros, gestoría, licencias, software TPV, etc." />

                    <SectionHeader title="CAPEX, D&A y Capital Circulante (WC)" color={BLUE_CLR} />
                    <InputCell label="CAPEX mantenimiento" value={inp.maintenanceCapex} onChange={set('maintenanceCapex')} unit="€/año" hint="Reposición equipos cocina, pequeñas reformas, mobiliario." />
                    <InputCell label="CAPEX expansión" value={inp.expansionCapex} onChange={set('expansionCapex')} unit="€/año" hint="Nuevas instalaciones, reformas grandes, nuevas aperturas. 0 si no planeas expandir." />
                    <InputCell label="D&A (depreciación)" value={inp.daRate} onChange={set('daRate')} unit="% ventas" hint="Depreciación de inmovilizado. Estándar: 3% ventas." />
                    <InputCell label="Días cobro (AR)" value={inp.arDays} onChange={set('arDays')} unit="días" hint="Plazo medio de cobro a clientes. Restaurantes efectivo: ~3–7 días." />
                    <InputCell label="Días inventario" value={inp.inventoryDays} onChange={set('inventoryDays')} unit="días" hint="Stock medio en bodega/almacén. Restaurantes: ~5–10 días." />
                    <InputCell label="Días pago (AP)" value={inp.apDays} onChange={set('apDays')} unit="días" hint="Plazo medio de pago a proveedores. Típico: 15–30 días." />
                    <div style={{ gridColumn: 'span 3', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8rem', color: BLUE_CLR }}>
                        <strong>WC neto = AR ({inp.arDays}d) + Inventario ({inp.inventoryDays}d) − AP ({inp.apDays}d) = {num(inp.arDays) + num(inp.inventoryDays) - num(inp.apDays)} días de ventas</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>→ Δ WC afecta al FCF anualmente según crecimiento de ventas</span>
                    </div>

                    <SectionHeader title="Variables Macro" color={BLUE_CLR} />
                    <InputCell label="Inflación esperada" value={inp.inflacion} onChange={set('inflacion')} unit="%" hint="Tasa de inflación anual esperada. Se aplica a costes fijos (suministros, gestoría, etc.). Eurozona 2024: ~2–3%." />

                    <SectionHeader title="Estructura Capital y WACC / CAPM" color={BLUE_CLR} />
                    <InputCell label="Rf — Tipo libre riesgo" value={inp.rf} onChange={set('rf')} unit="%" hint="Bono soberano 10Y del país de operación. España 2024: ~3.4%." />
                    <InputCell label="ERP — Prima riesgo mercado" value={inp.erp} onChange={set('erp')} unit="%" hint="Equity Risk Premium. Damodaran España 2024: ~5.5%." />
                    <InputCell label="Beta (apalancada)" value={inp.beta} onChange={set('beta')} hint="Sensibilidad al mercado. Restauración fast-casual: 0.85–1.1." />
                    <InputCell label="CRP — Prima riesgo país" value={inp.crp} onChange={set('crp')} unit="%" hint="Country Risk Premium extra. España: ~0.5–1.0%." />
                    <InputCell label="Prima tamaño (SME)" value={inp.sizePremium} onChange={set('sizePremium')} unit="%" hint="Ajuste por tamaño empresa. Microempresas: 1.5–3%." />
                    <InputCell label="Coste deuda (pre-tax)" value={inp.debtCost} onChange={set('debtCost')} unit="%" hint="Tipo de interés préstamos bancarios. Typical PYME hostelería: 4–6%." />
                    <InputCell label="Tipo impositivo (IS)" value={inp.taxRate} onChange={set('taxRate')} unit="%" hint="Tipo efectivo. General España: 25%. PYME: 23%." />
                    <InputCell label="% Equity sobre capital" value={inp.equityWeight} onChange={set('equityWeight')} unit="%" hint="E/V = equity / (equity + deuda). 100% si sin deuda financiera." />
                    <InputCell label="Deuda financiera neta" value={inp.debtOutstanding} onChange={set('debtOutstanding')} unit="€" hint="Préstamos bancarios, leasing. Se resta del Enterprise Value → Equity Value." />
                    <InputCell label="Caja y equivalentes" value={inp.cash} onChange={set('cash')} unit="€" hint="Tesorería disponible. Se suma al Equity Value." />

                    <SectionHeader title="Proyección y Valor Terminal" color={BLUE_CLR} />
                    <InputCell label="Crecimiento ventas" value={inp.revGrowth} onChange={set('revGrowth')} unit="% anual" hint="Tasa de crecimiento anual esperada durante el horizonte explícito." />
                    <InputCell label="Horizonte proyección" value={inp.horizon} onChange={set('horizon')} unit="años" hint="Número de años de proyección explícita. Estándar: 5–10." />
                    <InputCell label="% Propiedad" value={inp.ownershipPct} onChange={set('ownershipPct')} unit="%" hint="Tu participación en el negocio." />
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Método valor terminal</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            {(['gordon', 'multiple'] as const).map(m => (
                                <button key={m} onClick={() => setInp(p => ({ ...p, tvMethod: m }))}
                                    style={{
                                        flex: 1, padding: '0.45rem', borderRadius: 6, border: `1px solid ${inp.tvMethod === m ? 'rgba(59,130,246,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer',
                                        background: inp.tvMethod === m ? 'rgba(59,130,246,0.12)' : 'transparent', color: inp.tvMethod === m ? BLUE_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem'
                                    }}>
                                    {m === 'gordon' ? '∞ Gordon Growth' : '× Múltiplo EBITDA'}
                                </button>
                            ))}
                        </div>
                    </div>
                    {inp.tvMethod === 'gordon'
                        ? <InputCell label="Crecimiento perpetuo (g)" value={inp.terminalGrowth} onChange={set('terminalGrowth')} unit="%" hint="Tasa de crecimiento perpetuo. No superar PIB nominal. Típico: 1.5–2.5%." />
                        : <InputCell label="Múltiplo de salida (EV/EBITDA)" value={inp.ebitdaMultiple} onChange={set('ebitdaMultiple')} unit="×" hint="Múltiplo de salida del sector. Hostelería casual: 4–8×. Referencia sector." />
                    }
                </div>
            )}

            {/* ──────────────────── TAB 2: PROYECCIONES ──────────────── */}
            {tab === 'proyecciones' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Escenario:</span>
                        {(['pessimistic', 'base', 'optimistic'] as Scenario[]).map(s => (
                            <button key={s} onClick={() => setScenario(s)} style={{
                                padding: '0.35rem 0.75rem', borderRadius: 20, border: `1px solid ${scenario === s ? SCEN_COLORS[s] : 'var(--border-muted)'}`,
                                background: scenario === s ? `${SCEN_COLORS[s]}18` : 'transparent', color: scenario === s ? SCEN_COLORS[s] : 'var(--text-muted)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                            }}>{SCEN_LABELS[s]}</button>
                        ))}
                    </div>

                    {/* Revenue build-up */}
                    <div>
                        <h4 style={{ marginBottom: '0.75rem', color: BLUE_CLR }}>📊 Revenue Build-up</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                            <FormulaCell label="Ingresos sala" value={fmtEur(model.revSala * SCEN_ADJ[scenario].rev)} formula={`${inp.numTables} mesas × ${inp.rotacionTablas} rot × ${inp.ticketMedio}€ × ${inp.daysOpen}d × ${fmtPct(SCEN_ADJ[scenario].rev - 1 + 1, 0)}`} />
                            <FormulaCell label="Ingresos delivery" value={fmtEur(model.revDelivery * SCEN_ADJ[scenario].rev)} formula={`Uber Eats + Glovo · Neto: ${fmtEur(model.revDelivery)}`} />
                            <FormulaCell label="Total ventas año 0" value={fmtEur(model.revBase)} formula={`Sala + Delivery + Otros × ${fmtPct(SCEN_ADJ[scenario].rev)}`} />
                        </div>
                    </div>

                    {/* P&L Projection table */}
                    <ProjTable
                        headers={['Línea / Año', ...model.years.map(y => `Año ${y.year}`)]}
                        rows={[
                            { label: 'Ventas netas', values: model.years.map(y => y.rev), bold: true, isOutput: false },
                            { label: '(-) COGS / Food cost', values: model.years.map(y => -y.cogs), indent: true, negative: true },
                            { label: 'Margen Bruto', values: model.years.map(y => y.gp), bold: true, isFormula: true },
                            { label: '(-) Personal', values: model.years.map(y => -y.staff), indent: true, negative: true },
                            { label: '(-) Alquiler', values: model.years.map(y => -y.rent), indent: true, negative: true },
                            { label: '(-) Marketing', values: model.years.map(y => -y.mkt), indent: true, negative: true },
                            { label: '(-) Utilities + otros fijos', values: model.years.map(y => -(model.years[0].ebitda - model.years[0].gp + model.years[0].staff + model.years[0].rent + model.years[0].mkt)), indent: true, negative: true },
                            { label: 'EBITDA', values: model.years.map(y => y.ebitda), bold: true, isFormula: true },
                            { label: 'Margen EBITDA %', values: model.years.map(y => fmtPct(y.ebitdaMargin)), isFormula: true },
                            { label: '(-) D&A', values: model.years.map(y => -y.da), indent: true },
                            { label: 'EBIT', values: model.years.map(y => y.ebit), bold: true, isFormula: true },
                            { label: '(-) Impuestos', values: model.years.map(y => -y.tax), indent: true, negative: true },
                            { label: 'NOPAT', values: model.years.map(y => y.nopat), bold: true, isFormula: true },
                            { label: '(+) D&A', values: model.years.map(y => y.da), indent: true },
                            { label: '(-) CAPEX', values: model.years.map(y => -y.capex), indent: true, negative: true },
                            { label: '(-) Δ Working Capital', values: model.years.map(y => -y.deltaWC), indent: true, negative: true },
                            { label: 'Free Cash Flow (FCF)', values: model.years.map(y => y.fcf), bold: true, isOutput: true },
                        ]}
                    />
                </div>
            )}

            {/* ──────────────────── TAB 3: DCF ─────────────────────── */}
            {tab === 'dcf' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* WACC breakdown */}
                    <div>
                        <h4 style={{ marginBottom: '0.75rem', color: GOLD_CLR }}>🔢 WACC / CAPM</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                            {baseModel.waccResult.details.breakdown.map((b, i) => (
                                <FormulaCell key={i} label={b.label} value={fmtPct(b.value)} />
                            ))}
                        </div>
                        <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: GOLD_BG, border: '1px solid rgba(201,164,78,0.3)', borderRadius: 8, fontSize: '0.8125rem', color: GOLD_CLR }}>
                            <strong>CAPM: </strong>{baseModel.waccResult.details.capmFormula}<br />
                            <strong>WACC: </strong>{baseModel.waccResult.details.waccFormula}
                        </div>
                    </div>

                    {/* DCF structure */}
                    <div>
                        <h4 style={{ marginBottom: '0.75rem', color: GOLD_CLR }}>💸 Flujos Descontados</h4>
                        <ProjTable
                            headers={['Componente / Año', ...baseModel.years.map(y => `Año ${y.year}`)]}
                            rows={[
                                { label: 'FCF', values: baseModel.years.map(y => y.fcf), bold: true },
                                { label: `Factor descuento (${fmtPct(baseModel.wacc)})`, values: baseModel.years.map((_, i) => 1 / Math.pow(1 + baseModel.wacc, i + 1)), isFormula: true },
                                { label: 'PV de cada FCF', values: baseModel.years.map((y, i) => y.fcf / Math.pow(1 + baseModel.wacc, i + 1)), isFormula: true },
                            ]}
                            footerRows={[
                                { label: '∑ PV FCFs (período explícito)', values: [baseModel.pvFCFs, ...Array(baseModel.years.length - 1).fill('')], isOutput: false },
                            ]}
                        />
                    </div>

                    {/* Enterprise + Equity Value */}
                    <div>
                        <h4 style={{ marginBottom: '0.75rem', color: GREEN_CLR }}>🎯 Enterprise Value → Equity Value</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                            <FormulaCell label="∑ PV FCFs" value={fmtEur(baseModel.pvFCFs)} formula={`Período explícito (${inp.horizon} años)`} />
                            <FormulaCell label="PV Valor Terminal" value={fmtEur(baseModel.pvTV)} formula={inp.tvMethod === 'gordon' ? `Gordon: FCFₙ×(1+g)/(WACC-g)` : `EV/EBITDA × ${inp.ebitdaMultiple}×`} />
                            <OutputCell label="Enterprise Value" value={fmtEur(baseModel.ev)} sub={`TV = ${fmtPct(baseModel.pvTV / baseModel.ev)} del EV`} />
                            <OutputCell label="Equity Value" value={fmtEur(baseModel.equityValue)} sub={`EV − Deuda + Caja (${pct(inp.ownershipPct) / 100 * 100}%)`} large />
                        </div>
                        <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                            <FormulaCell label="EV/EBITDA implícito" value={`${(baseModel.ev / (baseModel.years[0]?.ebitda ?? 1)).toFixed(1)}×`} formula="Múltiplo de valoración resultante" />
                            <FormulaCell label="TV / EV" value={fmtPct(baseModel.pvTV / baseModel.ev)} formula="% del valor atribuido al TV" />
                            <FormulaCell label="Payback estimado" value={`~${Math.ceil(baseModel.equityValue / (baseModel.years[0]?.fcf ?? 1))} años`} formula="Equity / FCF año 1" />
                        </div>
                    </div>
                </div>
            )}

            {/* ──────────────────── TAB 4: SENSIBILIDADES ─────────────── */}
            {tab === 'sensibilidades' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div>
                        <h4 style={{ marginBottom: '0.5rem', color: GOLD_CLR }}>📊 Equity Value vs WACC × Crecimiento Terminal (g)</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>La celda dorada señala el caso base. Verde = mayor valor, Rojo = menor valor.</p>
                        <SensTable rowLabel="WACC" colLabel="g" rowVals={waccRange} colVals={gRange} matrix={sensWACCxG} baseRowIdx={baseWACCIdx} baseColIdx={baseGIdx} />
                    </div>
                    <div>
                        <h4 style={{ marginBottom: '0.5rem', color: GOLD_CLR }}>📊 Equity Value vs WACC × Margen EBITDA</h4>
                        <SensTable rowLabel="WACC" colLabel="EBITDA Margin" rowVals={waccRange} colVals={ebitdaRange} matrix={sensWACCxEBITDA} baseRowIdx={baseWACCIdx} baseColIdx={baseEIdx} />
                    </div>
                </div>
            )}

            {/* ──────────────────── TAB 5: ESCENARIOS ─────────────────── */}
            {tab === 'escenarios' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Los escenarios aplican ajustes automáticos sobre los supuestos base. Puedes ajustar los multiplicadores en el código.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        {(['pessimistic', 'base', 'optimistic'] as Scenario[]).map(s => {
                            const m = computeModel(inp, s)
                            return (
                                <div key={s} style={{ border: `1px solid ${SCEN_COLORS[s]}40`, borderRadius: 10, padding: '1.25rem', background: `${SCEN_COLORS[s]}08` }}>
                                    <div style={{ fontWeight: 800, fontSize: '1rem', color: SCEN_COLORS[s], marginBottom: '0.75rem' }}>{SCEN_LABELS[s]}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {[
                                            ['Revenue año 1', fmtEur(m.years[0]?.rev ?? 0)],
                                            ['EBITDA año 1', fmtEur(m.years[0]?.ebitda ?? 0)],
                                            [`Margen EBITDA`, fmtPct(m.years[0]?.ebitdaMargin ?? 0)],
                                            ['WACC', fmtPct(m.wacc)],
                                            ['Enterprise Value', fmtEur(m.ev)],
                                            ['Equity Value', fmtEur(m.equityValue)],
                                        ].map(([l, v]) => (
                                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', borderBottom: `1px solid ${SCEN_COLORS[s]}20`, paddingBottom: 4 }}>
                                                <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                                                <span style={{ fontWeight: 700, color: SCEN_COLORS[s] }}>{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Scenario comparison chart bars */}
                    <div style={{ marginTop: '0.5rem' }}>
                        <h4 style={{ marginBottom: '0.75rem', color: GOLD_CLR }}>📊 Equity Value — Comparativa de Escenarios</h4>
                        {(['pessimistic', 'base', 'optimistic'] as Scenario[]).map(s => {
                            const m = computeModel(inp, s)
                            const max = computeModel(inp, 'optimistic').equityValue || 1
                            const pctWidth = Math.max((m.equityValue / max) * 100, 2)
                            return (
                                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                                    <span style={{ width: 110, fontSize: '0.8rem', fontWeight: 700, color: SCEN_COLORS[s] }}>{SCEN_LABELS[s]}</span>
                                    <div style={{ flex: 1, background: 'var(--black-850)', borderRadius: 6, height: 28, overflow: 'hidden' }}>
                                        <div style={{ width: `${pctWidth}%`, height: '100%', background: `linear-gradient(90deg, ${SCEN_COLORS[s]}80, ${SCEN_COLORS[s]})`, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 10, transition: 'width 0.4s' }}>
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

