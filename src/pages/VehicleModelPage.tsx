import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import {
    InputCell, FormulaCell, OutputCell, SectionHeader,
    fmtEur, fmtPct, fmtN,
    GOLD_BG, BLUE_CLR, GOLD_CLR, GREEN_CLR, RED_CLR,
} from '../lib/valuation/modelUtils'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Asset } from '../types'

function num(s: string) { return parseFloat(s) || 0 }
function pct(s: string) { return (parseFloat(s) || 0) / 100 }

interface Inputs {
    // Identificación
    name: string; make: string; model: string; variant: string; year: string
    plate: string; vin: string; color: string; city: string
    // Técnico
    fuelType: string; transmission: string; mileageKm: string; engineCc: string
    powerCv: string; doors: string; seats: string; bodyType: string
    // Estado
    condition: string; itvExpiry: string; isClassic: string
    // Financiero
    purchasePrice: string; currentMarketValue: string
    // Seguros y costes
    insuranceType: string; insuranceAnnual: string
    maintenanceAnnual: string; roadTaxAnnual: string; parkingAnnual: string; fuelMontly: string
    // Financiación
    loanPrincipal: string; loanRate: string; loanYears: string
    // Apreciación / Depreciación
    depreciationPct: string; appreciationPct: string
    // Proyección
    horizon: string; ownershipPct: string; notes: string
}

const DEFAULTS: Inputs = {
    name: '', make: '', model: '', variant: '', year: String(new Date().getFullYear()),
    plate: '', vin: '', color: '', city: 'Málaga',
    fuelType: 'gasolina', transmission: 'automático', mileageKm: '0', engineCc: '2000',
    powerCv: '150', doors: '4', seats: '5', bodyType: 'sedán',
    condition: 'excelente', itvExpiry: '', isClassic: 'no',
    purchasePrice: '50000', currentMarketValue: '45000',
    insuranceType: 'todo riesgo', insuranceAnnual: '1200',
    maintenanceAnnual: '800', roadTaxAnnual: '200', parkingAnnual: '0', fuelMontly: '200',
    loanPrincipal: '0', loanRate: '5', loanYears: '5',
    depreciationPct: '15', appreciationPct: '0',
    horizon: '7', ownershipPct: '100', notes: '',
}

interface YearData { year: number; marketValue: number; depreciation: number; holdingCost: number; loanPayment: number; netCost: number; cumulativeCost: number; roi: number }

function computeVehicleModel(inp: Inputs): {
    years: YearData[]; finalValue: number; totalHoldingCosts: number; absoluteGain: number
    netGain: number; unrealizedGain: number; unrealizedGainPct: number
    annualizedReturn: number; monthlyLoanPayment: number; totalLoanCost: number
} {
    const H = Math.max(1, parseInt(inp.horizon) || 7)
    const purchasePrice = num(inp.purchasePrice)
    const currentValue = num(inp.currentMarketValue)
    const isClassic = inp.isClassic === 'sí'
    const netAnnualChange = isClassic
        ? pct(inp.appreciationPct)
        : -pct(inp.depreciationPct)

    const insuranceAnnual = num(inp.insuranceAnnual)
    const maintenanceAnnual = num(inp.maintenanceAnnual)
    const roadTaxAnnual = num(inp.roadTaxAnnual)
    const parkingAnnual = num(inp.parkingAnnual)
    const fuelAnnual = num(inp.fuelMontly) * 12
    const totalHoldingCostAnnual = insuranceAnnual + maintenanceAnnual + roadTaxAnnual + parkingAnnual + fuelAnnual

    // Loan calculation
    const P = num(inp.loanPrincipal)
    const r = pct(inp.loanRate) / 12
    const n = num(inp.loanYears) * 12
    const monthlyLoanPayment = n > 0 && r > 0 ? P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : 0
    const totalLoanCost = monthlyLoanPayment * n - P

    const years: YearData[] = []
    let prevValue = currentValue
    let cumulativeCost = 0
    for (let y = 1; y <= H; y++) {
        const marketValue = prevValue * (1 + netAnnualChange)
        const depreciation = prevValue - marketValue
        const holdingCost = totalHoldingCostAnnual
        const loanPayment = y <= num(inp.loanYears) ? monthlyLoanPayment * 12 : 0
        const netCost = holdingCost + Math.max(depreciation, 0) + loanPayment
        cumulativeCost += netCost
        const roi = purchasePrice > 0 ? (marketValue - purchasePrice - cumulativeCost) / purchasePrice : 0
        years.push({ year: y, marketValue, depreciation, holdingCost, loanPayment, netCost, cumulativeCost, roi })
        prevValue = marketValue
    }

    const finalValue = years[years.length - 1]?.marketValue ?? currentValue
    const totalHoldingCosts = totalHoldingCostAnnual * H
    const absoluteGain = finalValue - purchasePrice
    const netGain = absoluteGain - totalHoldingCosts
    const annualizedReturn = purchasePrice > 0 ? Math.pow(finalValue / purchasePrice, 1 / H) - 1 : 0
    const unrealizedGain = currentValue - purchasePrice
    const unrealizedGainPct = purchasePrice > 0 ? unrealizedGain / purchasePrice : 0

    return { years, finalValue, totalHoldingCosts, absoluteGain, netGain, unrealizedGain, unrealizedGainPct, annualizedReturn, monthlyLoanPayment, totalLoanCost }
}

export default function VehicleModelPage({ asset }: { asset: Asset }) {
    const navigate = useNavigate()
    const { user } = useAuth()
    const sd = (asset.sector_data ?? {}) as Record<string, unknown>

    const [inp, setInp] = useState<Inputs>({
        ...DEFAULTS,
        name: asset.name,
        make: String(sd.make ?? ''),
        model: String(sd.model ?? ''),
        variant: String(sd.variant ?? ''),
        year: String(sd.year ?? DEFAULTS.year),
        plate: String(sd.plate ?? ''),
        vin: String(sd.vin ?? ''),
        color: String(sd.color ?? ''),
        city: String(sd.city ?? DEFAULTS.city),
        fuelType: String(sd.fuel_type ?? DEFAULTS.fuelType),
        transmission: String(sd.transmission ?? DEFAULTS.transmission),
        mileageKm: String(sd.mileage_km ?? DEFAULTS.mileageKm),
        condition: String(sd.condition ?? DEFAULTS.condition),
        itvExpiry: String(sd.itv_expiry ?? ''),
        isClassic: (sd.is_classic === true || sd.is_classic === 'sí') ? 'sí' : 'no',
        purchasePrice: String(sd.purchase_price ?? DEFAULTS.purchasePrice),
        currentMarketValue: String(sd.current_market_value ?? DEFAULTS.currentMarketValue),
        insuranceType: String(sd.insurance_type ?? DEFAULTS.insuranceType),
        insuranceAnnual: String(sd.insurance_annual ?? DEFAULTS.insuranceAnnual),
        maintenanceAnnual: String(sd.maintenance_annual ?? DEFAULTS.maintenanceAnnual),
        roadTaxAnnual: String(sd.road_tax_annual ?? DEFAULTS.roadTaxAnnual),
        depreciationPct: String(sd.depreciation_pct ?? DEFAULTS.depreciationPct),
        appreciationPct: String(sd.appreciation_pct ?? DEFAULTS.appreciationPct),
        notes: String(sd.notes ?? ''),
    })

    const set = (k: keyof Inputs) => (v: string) => setInp(p => ({ ...p, [k]: v }))
    const [tab, setTab] = useState<'datos' | 'proyeccion' | 'costes'>('datos')
    const [saving, setSaving] = useState(false)
    const model = useMemo(() => computeVehicleModel(inp), [inp])

    const TABS = [
        { key: 'datos', label: '🚗 Datos Vehículo' },
        { key: 'proyeccion', label: '📈 Depreciación / Revalorización' },
        { key: 'costes', label: '💰 Coste Total de Propiedad' },
    ] as const

    const handleSave = async () => {
        if (!user) return
        setSaving(true)
        await supabase.from('patrimonio_assets').update({
            name: inp.name,
            sector_data: {
                ...sd,
                make: inp.make, model: inp.model, variant: inp.variant,
                year: parseInt(inp.year), plate: inp.plate, vin: inp.vin, color: inp.color,
                city: inp.city, fuel_type: inp.fuelType, transmission: inp.transmission,
                mileage_km: num(inp.mileageKm), engine_cc: num(inp.engineCc),
                power_cv: num(inp.powerCv), doors: num(inp.doors), seats: num(inp.seats),
                body_type: inp.bodyType, condition: inp.condition, itv_expiry: inp.itvExpiry,
                is_classic: inp.isClassic === 'sí',
                purchase_price: num(inp.purchasePrice), current_market_value: num(inp.currentMarketValue),
                insurance_type: inp.insuranceType, insurance_annual: num(inp.insuranceAnnual),
                maintenance_annual: num(inp.maintenanceAnnual), road_tax_annual: num(inp.roadTaxAnnual),
                parking_annual: num(inp.parkingAnnual), fuel_monthly: num(inp.fuelMontly),
                loan_principal: num(inp.loanPrincipal), loan_rate: num(inp.loanRate),
                loan_years: num(inp.loanYears), depreciation_pct: num(inp.depreciationPct),
                appreciation_pct: num(inp.appreciationPct), notes: inp.notes,
            }
        }).eq('id', asset.id)

        await supabase.from('patrimonio_valuation_snapshots').insert({
            user_id: user.id, asset_id: asset.id,
            snapshot_date: new Date().toISOString().split('T')[0],
            value_low: Math.round(num(inp.currentMarketValue) * (1 - pct(inp.depreciationPct))),
            value_base: Math.round(num(inp.currentMarketValue)),
            value_high: Math.round(model.finalValue),
            method_used: 'market', confidence_score: 'medium',
            explanation: `Vehículo ${inp.make} ${inp.model} ${inp.year}. ${inp.isClassic === 'sí' ? 'Clásico revalorizable' : `Depreciación ${inp.depreciationPct}%/año`}.`,
            assumptions_metadata: {
                depreciation_pct: num(inp.depreciationPct),
                appreciation_pct: num(inp.appreciationPct),
                current_value: num(inp.currentMarketValue),
                projected_value: model.finalValue,
            },
        })
        setSaving(false)
        navigate('/assets')
    }

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: '4rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                    <button onClick={() => navigate('/assets')} className="btn btn-ghost btn-sm" style={{ marginBottom: 6 }}>
                        <ArrowLeft size={13} /> Volver
                    </button>
                    <h2 style={{ marginBottom: 4 }}>{inp.make ? `${inp.make} ${inp.model}` : asset.name} {inp.year ? `(${inp.year})` : ''}</h2>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="badge badge-gold">{inp.isClassic === 'sí' ? '🏎 Vehículo Clásico' : '🚗 Vehículo'}</span>
                        {inp.plate && <span className="badge badge-muted">🔢 {inp.plate}</span>}
                        {inp.isClassic === 'sí'
                            ? <span style={{ fontSize: '0.72rem', color: GREEN_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(34,197,94,0.12)', borderRadius: 20 }}>📈 Se Revaloriza</span>
                            : <span style={{ fontSize: '0.72rem', color: RED_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(239,68,68,0.12)', borderRadius: 20 }}>📉 Se Deprecia {inp.depreciationPct}%/año</span>}
                        <span style={{ fontSize: '0.72rem', color: BLUE_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(59,130,246,0.12)', borderRadius: 20 }}>🔵 Azul = Inputs</span>
                        <span style={{ fontSize: '0.72rem', color: GREEN_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(34,197,94,0.12)', borderRadius: 20 }}>🟢 Verde = Outputs</span>
                    </div>
                </div>
                <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
                    <Save size={14} /> {saving ? 'Guardando...' : 'Guardar + Snapshot'}
                </button>
            </div>

            {/* Quick KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <OutputCell label="Valor mercado actual" value={fmtEur(num(inp.currentMarketValue))} large />
                <FormulaCell label="Ganancia / pérdida latente" value={fmtEur(model.unrealizedGain)} formula={`${fmtPct(model.unrealizedGainPct)} respecto a compra`} />
                <FormulaCell label="Coste total anual" value={fmtEur(num(inp.insuranceAnnual) + num(inp.maintenanceAnnual) + num(inp.roadTaxAnnual) + num(inp.parkingAnnual) + num(inp.fuelMontly) * 12)} formula="Seguro + mant + impuesto + parking + combustible" />
                {num(inp.loanPrincipal) > 0
                    ? <FormulaCell label="Cuota financiación" value={fmtEur(model.monthlyLoanPayment)} formula="€/mes · cuota préstamo / leasing" />
                    : <FormulaCell label="Financiación" value="Sin deuda" formula="Vehículo pagado al contado" />}
                <OutputCell label={`Valor proyectado (${inp.horizon}a)`} value={fmtEur(model.finalValue)} sub={inp.isClassic === 'sí' ? `+${fmtPct(pct(inp.appreciationPct))}/año` : `-${fmtPct(pct(inp.depreciationPct))}/año`} />
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 3, marginBottom: '1.25rem', padding: 4, background: 'var(--black-800)', borderRadius: 10, border: '1px solid var(--border-muted)' }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{ flex: 1, padding: '0.55rem 0.5rem', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: tab === t.key ? 'rgba(201,164,78,0.18)' : 'transparent', color: tab === t.key ? GOLD_CLR : 'var(--text-muted)', transition: 'all 0.15s' }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── TAB 1: DATOS ── */}
            {tab === 'datos' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <SectionHeader title="Identificación del Vehículo" />
                    <InputCell label="Nombre / denominación" value={inp.name} onChange={set('name')} type="text" placeholder="Mi coche principal" />
                    <InputCell label="Marca" value={inp.make} onChange={set('make')} type="text" placeholder="BMW, Mercedes, Porsche…" />
                    <InputCell label="Modelo" value={inp.model} onChange={set('model')} type="text" placeholder="Serie 3, Clase E, 911…" />
                    <InputCell label="Variante / versión" value={inp.variant} onChange={set('variant')} type="text" placeholder="320i M Sport, S63 AMG…" hint="Versión específica. Importante para la valoración en mercado." />
                    <InputCell label="Año de matriculación" value={inp.year} onChange={set('year')} placeholder="2020" />
                    <InputCell label="Matrícula" value={inp.plate} onChange={set('plate')} type="text" placeholder="1234 ABC" />
                    <InputCell label="VIN / Bastidor" value={inp.vin} onChange={set('vin')} type="text" placeholder="WBA3A5C5XDF000000" hint="Número de identificación del vehículo. 17 caracteres." />
                    <InputCell label="Color" value={inp.color} onChange={set('color')} type="text" placeholder="Blanco Alpino, Negro Metal…" />
                    <InputCell label="Ciudad" value={inp.city} onChange={set('city')} type="text" placeholder="Málaga" />

                    <SectionHeader title="Especificaciones Técnicas" color={BLUE_CLR} />
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Combustible</span>
                        <select value={inp.fuelType} onChange={e => setInp(p => ({ ...p, fuelType: e.target.value }))}
                            style={{ marginTop: 6, width: '100%', padding: '0.45rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 6, color: BLUE_CLR, fontWeight: 700, fontSize: '0.875rem' }}>
                            <option value="gasolina">Gasolina</option>
                            <option value="diesel">Diésel</option>
                            <option value="híbrido">Híbrido</option>
                            <option value="eléctrico">Eléctrico</option>
                            <option value="hidrógeno">Hidrógeno</option>
                        </select>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Transmisión</span>
                        <select value={inp.transmission} onChange={e => setInp(p => ({ ...p, transmission: e.target.value }))}
                            style={{ marginTop: 6, width: '100%', padding: '0.45rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 6, color: BLUE_CLR, fontWeight: 700, fontSize: '0.875rem' }}>
                            <option value="automático">Automático</option>
                            <option value="manual">Manual</option>
                            <option value="CVT">CVT</option>
                            <option value="PDK">PDK / DSG</option>
                        </select>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Carrocería</span>
                        <select value={inp.bodyType} onChange={e => setInp(p => ({ ...p, bodyType: e.target.value }))}
                            style={{ marginTop: 6, width: '100%', padding: '0.45rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 6, color: BLUE_CLR, fontWeight: 700, fontSize: '0.875rem' }}>
                            <option value="sedán">Sedán</option>
                            <option value="familiar">Familiar / Touring</option>
                            <option value="SUV">SUV / 4x4</option>
                            <option value="coupé">Coupé</option>
                            <option value="cabrio">Cabrio / Descapotable</option>
                            <option value="monovolumen">Monovolumen</option>
                            <option value="pick-up">Pick-up</option>
                            <option value="moto">Motocicleta</option>
                            <option value="furgoneta">Furgoneta / Comercial</option>
                        </select>
                    </div>
                    <InputCell label="Cilindrada" value={inp.engineCc} onChange={set('engineCc')} unit="cc" hint="Volumen del motor. Influye en impuesto de circulación." />
                    <InputCell label="Potencia" value={inp.powerCv} onChange={set('powerCv')} unit="CV" hint="Caballos de vapor. Usado para calcular penalización fiscal." />
                    <InputCell label="Puertas" value={inp.doors} onChange={set('doors')} />
                    <InputCell label="Plazas" value={inp.seats} onChange={set('seats')} />
                    <InputCell label="Kilómetros actuales" value={inp.mileageKm} onChange={set('mileageKm')} unit="km" hint="Kilometraje actual. Afecta directamente al valor de reventa." />
                    <InputCell label="Vencimiento ITV" value={inp.itvExpiry} onChange={set('itvExpiry')} type="date" hint="Fecha de la próxima Inspección Técnica de Vehículos." />

                    <SectionHeader title="Condición y Tipo de Activo" color={BLUE_CLR} />
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Condición</span>
                        <select value={inp.condition} onChange={e => setInp(p => ({ ...p, condition: e.target.value }))}
                            style={{ marginTop: 6, width: '100%', padding: '0.45rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 6, color: BLUE_CLR, fontWeight: 700, fontSize: '0.875rem' }}>
                            <option value="perfecto">Perfecto / como nuevo</option>
                            <option value="excelente">Excelente</option>
                            <option value="muy bueno">Muy bueno</option>
                            <option value="bueno">Bueno</option>
                            <option value="aceptable">Aceptable / necesita atención</option>
                            <option value="restauración">En restauración</option>
                        </select>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tipo de vehículo</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button onClick={() => setInp(p => ({ ...p, isClassic: 'no' }))}
                                style={{ flex: 1, padding: '0.4rem', borderRadius: 6, border: `1px solid ${inp.isClassic === 'no' ? 'rgba(239,68,68,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer', background: inp.isClassic === 'no' ? 'rgba(239,68,68,0.12)' : 'transparent', color: inp.isClassic === 'no' ? RED_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem' }}>
                                📉 Moderno (deprecia)
                            </button>
                            <button onClick={() => setInp(p => ({ ...p, isClassic: 'sí' }))}
                                style={{ flex: 1, padding: '0.4rem', borderRadius: 6, border: `1px solid ${inp.isClassic === 'sí' ? 'rgba(34,197,94,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer', background: inp.isClassic === 'sí' ? 'rgba(34,197,94,0.12)' : 'transparent', color: inp.isClassic === 'sí' ? GREEN_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem' }}>
                                📈 Clásico (revaloriza)
                            </button>
                        </div>
                    </div>
                    {inp.isClassic === 'sí'
                        ? <InputCell label="Tasa revalorización anual" value={inp.appreciationPct} onChange={set('appreciationPct')} unit="%" hint="Vehículos clásicos de colección pueden revalorizarse +5–20%/año según rareza y estado." />
                        : <InputCell label="Tasa depreciación anual" value={inp.depreciationPct} onChange={set('depreciationPct')} unit="%" hint="Coches nuevos pierden hasta 20-30% el primer año. Después: 10-15%/año. Eléctricos: hasta 20%/año por tecnología." />}

                    <SectionHeader title="Valoración Financiera" color={BLUE_CLR} />
                    <InputCell label="Precio de compra" value={inp.purchasePrice} onChange={set('purchasePrice')} unit="€" hint="Precio total pagado (incluye impuestos, garantía, matriculación, accesorios)." />
                    <InputCell label="Valor mercado actual" value={inp.currentMarketValue} onChange={set('currentMarketValue')} unit="€" hint="Precio en Wallapop, Autoscout24, Coches.net, concesionario de segunda mano." />
                    <InputCell label="Horizonte de análisis" value={inp.horizon} onChange={set('horizon')} unit="años" />
                    <InputCell label="% Propiedad" value={inp.ownershipPct} onChange={set('ownershipPct')} unit="%" />

                    <SectionHeader title="Seguros y Costes Anuales" color={BLUE_CLR} />
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tipo de seguro</span>
                        <select value={inp.insuranceType} onChange={e => setInp(p => ({ ...p, insuranceType: e.target.value }))}
                            style={{ marginTop: 6, width: '100%', padding: '0.45rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 6, color: BLUE_CLR, fontWeight: 700, fontSize: '0.875rem' }}>
                            <option value="todo riesgo">Todo riesgo sin franquicia</option>
                            <option value="todo riesgo franquicia">Todo riesgo con franquicia</option>
                            <option value="terceros ampliado">Terceros ampliado</option>
                            <option value="terceros básico">Terceros básico</option>
                        </select>
                    </div>
                    <InputCell label="Prima seguro anual" value={inp.insuranceAnnual} onChange={set('insuranceAnnual')} unit="€/año" hint="Coste anual total del seguro. Lujo/deportivo: 1.500–4.000€/año." />
                    <InputCell label="Mantenimiento / reparaciones" value={inp.maintenanceAnnual} onChange={set('maintenanceAnnual')} unit="€/año" hint="Revisiones,neumáticos, frenos, filtros, reparaciones. Lujo: 1.000–3.000€/año." />
                    <InputCell label="Impuesto de circulación (IVTM)" value={inp.roadTaxAnnual} onChange={set('roadTaxAnnual')} unit="€/año" hint="Impuesto Municipal sobre Vehículos de Tracción Mecánica. Varía por municipio y potencia fiscal." />
                    <InputCell label="Parking / garaje" value={inp.parkingAnnual} onChange={set('parkingAnnual')} unit="€/año" hint="Coste de plaza de garaje o parking mensual × 12." />
                    <InputCell label="Combustible / carga eléctrica" value={inp.fuelMontly} onChange={set('fuelMontly')} unit="€/mes" hint="Estimación de gasto mensual en combustible o electricidad." />

                    <SectionHeader title="Financiación (si aplica)" color={BLUE_CLR} />
                    <InputCell label="Capital financiado" value={inp.loanPrincipal} onChange={set('loanPrincipal')} unit="€" hint="Importe del préstamo / leasing / renting. 0 si se compró al contado." />
                    <InputCell label="Tipo de interés" value={inp.loanRate} onChange={set('loanRate')} unit="%" hint="TAE del préstamo. Coches premium: 4–7% aprox." />
                    <InputCell label="Plazo financiación" value={inp.loanYears} onChange={set('loanYears')} unit="años" />
                    {num(inp.loanPrincipal) > 0 && (
                        <div style={{ gridColumn: 'span 3', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8rem', color: BLUE_CLR }}>
                            <strong>Cuota mensual estimada: {fmtEur(model.monthlyLoanPayment)}/mes</strong> &nbsp;
                            Coste financiero total: {fmtEur(model.totalLoanCost)} &nbsp;
                            Coste total del préstamo: {fmtEur(num(inp.loanPrincipal) + model.totalLoanCost)}
                        </div>
                    )}

                    <SectionHeader title="Notas" color={BLUE_CLR} />
                    <div style={{ gridColumn: 'span 3' }}>
                        <textarea value={inp.notes} onChange={e => setInp(p => ({ ...p, notes: e.target.value }))}
                            placeholder="Historial de revisiones, modificaciones, accidentes, observaciones…"
                            style={{ width: '100%', minHeight: 80, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, padding: '0.6rem', color: 'var(--text-primary)', fontSize: '0.875rem', resize: 'vertical' }} />
                    </div>
                </div>
            )}

            {/* ── TAB 2: PROYECCIÓN ── */}
            {tab === 'proyeccion' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                        <FormulaCell label="Valor compra" value={fmtEur(num(inp.purchasePrice))} formula="Coste base" />
                        <FormulaCell label="Valor actual" value={fmtEur(num(inp.currentMarketValue))} formula={fmtEur(model.unrealizedGain)} />
                        <FormulaCell label={`Valor en ${inp.horizon} años`} value={fmtEur(model.finalValue)} formula={`Tasa: ${inp.isClassic === 'sí' ? '+' + inp.appreciationPct : '-' + inp.depreciationPct}%/año`} />
                        <OutputCell label="Rentabilidad anualizada" value={fmtPct(model.annualizedReturn)} sub={inp.isClassic === 'sí' ? 'activo revalorizable' : 'activo con depreciación'} />
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--black-850)' }}>
                                    {['Año', 'Valor Mercado', inp.isClassic === 'sí' ? 'Revalorización' : 'Depreciación Anual', 'Km estimados', 'ROI acumulado'].map(h => (
                                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', border: '1px solid var(--border-muted)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {model.years.map(y => (
                                    <tr key={y.year} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: GOLD_CLR }}>Año {y.year}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: inp.isClassic === 'sí' ? GREEN_CLR : 'var(--text-primary)' }}>{fmtEur(y.marketValue)}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: inp.isClassic === 'sí' ? GREEN_CLR : RED_CLR }}>{inp.isClassic === 'sí' ? '+' : '-'}{fmtEur(Math.abs(y.depreciation))}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>{Math.round(num(inp.mileageKm) + y.year * 15000).toLocaleString('es-ES')} km</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: y.roi >= 0 ? GREEN_CLR : RED_CLR }}>{fmtPct(y.roi)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── TAB 3: COSTE TOTAL ── */}
            {tab === 'costes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                        <FormulaCell label="Seguro anual" value={fmtEur(num(inp.insuranceAnnual))} formula={inp.insuranceType} />
                        <FormulaCell label="Mantenimiento anual" value={fmtEur(num(inp.maintenanceAnnual))} formula="Revisiones, reparaciones, neumáticos" />
                        <FormulaCell label="Impuesto circulación" value={fmtEur(num(inp.roadTaxAnnual))} formula="IVTM municipal" />
                        <FormulaCell label="Parking / garaje" value={fmtEur(num(inp.parkingAnnual))} formula="Coste anual almacenamiento" />
                        <FormulaCell label="Combustible anual" value={fmtEur(num(inp.fuelMontly) * 12)} formula={`${fmtEur(num(inp.fuelMontly))}/mes × 12`} />
                        {num(inp.loanPrincipal) > 0 && <FormulaCell label="Cuota préstamo anual" value={fmtEur(model.monthlyLoanPayment * 12)} formula={`${fmtEur(model.monthlyLoanPayment)}/mes`} />}
                        <OutputCell label="Coste total de propiedad / año" value={fmtEur(num(inp.insuranceAnnual) + num(inp.maintenanceAnnual) + num(inp.roadTaxAnnual) + num(inp.parkingAnnual) + num(inp.fuelMontly) * 12 + (num(inp.loanPrincipal) > 0 ? model.monthlyLoanPayment * 12 : 0))} large />
                        <OutputCell label={`Coste total ${inp.horizon} años`} value={fmtEur(model.years[model.years.length - 1]?.cumulativeCost ?? 0)} sub="Incluye depreciación + todos los gastos" />
                        <FormulaCell label="Coste por km estimado" value={`${((num(inp.insuranceAnnual) + num(inp.maintenanceAnnual)) / 15000).toFixed(2)} €/km`} formula="Seguro + mant. / 15.000 km/año" />

                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <h4 style={{ color: GOLD_CLR, marginBottom: '0.75rem' }}>📊 Coste Total de Propiedad (TCO) año a año</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--black-850)' }}>
                                    {['Año', 'Depreciación', 'Holding Costs', 'Préstamo', 'Coste Total', 'Coste Acumulado'].map(h => (
                                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', border: '1px solid var(--border-muted)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {model.years.map(y => (
                                    <tr key={y.year} style={{ borderBottom: '1px solid var(--border-muted)', background: y.year % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: GOLD_CLR }}>Año {y.year}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: inp.isClassic === 'sí' ? GREEN_CLR : RED_CLR }}>{inp.isClassic === 'sí' ? '+' : '-'}{fmtEur(Math.abs(y.depreciation))}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: RED_CLR }}>−{fmtEur(y.holdingCost)}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: y.loanPayment > 0 ? RED_CLR : 'var(--text-muted)' }}>{y.loanPayment > 0 ? `−${fmtEur(y.loanPayment)}` : '—'}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: RED_CLR, fontWeight: 600 }}>−{fmtEur(y.netCost)}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: RED_CLR }}>−{fmtEur(y.cumulativeCost)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
