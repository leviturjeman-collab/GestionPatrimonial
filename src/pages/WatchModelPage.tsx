import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Watch } from 'lucide-react'
import {
    InputCell, FormulaCell, OutputCell, SectionHeader,
    fmtEur, fmtPct, fmtN,
    GOLD_BG, GREEN_BG, BLUE_CLR, GOLD_CLR, GREEN_CLR, RED_CLR,
} from '../lib/valuation/modelUtils'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Asset } from '../types'

function num(s: string) { return parseFloat(s) || 0 }
function pct(s: string) { return (parseFloat(s) || 0) / 100 }

interface Inputs {
    // Identificación
    name: string; brand: string; model: string; reference: string; city: string
    serialNumber: string; year_purchased: string; openingYear: string
    // Físico
    caseMaterial: string; caseDiameterMm: string; dialColor: string; bracelet: string
    waterResistanceM: string; movement: string; serviceIntervalYears: string; lastServiceYear: string
    // Condición y documentación
    condition: string; boxPapers: string; storage: string
    // Financiero
    purchasePrice: string; currentMarketValue: string; insuranceAnnual: string
    // Apreciación / Depreciación
    appreciationPct: string; depreciationPct: string; isAppreciating: string
    // Holding costs
    maintenanceCostAnnual: string; storageCostAnnual: string
    // Proyección
    horizon: string; ownershipPct: string
    // Notas
    notes: string
}

const DEFAULTS: Inputs = {
    name: '', brand: 'Rolex', model: '', reference: '', city: 'Málaga',
    serialNumber: '', year_purchased: '2021', openingYear: '2021',
    caseMaterial: 'Oystersteel', caseDiameterMm: '40', dialColor: 'Negro', bracelet: 'Oyster',
    waterResistanceM: '100', movement: 'Automático', serviceIntervalYears: '10', lastServiceYear: '2021',
    condition: 'excelente', boxPapers: 'sí', storage: 'caja fuerte',
    purchasePrice: '15000', currentMarketValue: '18000', insuranceAnnual: '400',
    appreciationPct: '8', depreciationPct: '0', isAppreciating: 'sí',
    maintenanceCostAnnual: '0', storageCostAnnual: '0',
    horizon: '10', ownershipPct: '100',
    notes: '',
}

function computeWatchModel(inp: Inputs) {
    const H = Math.max(1, parseInt(inp.horizon) || 10)
    const purchasePrice = num(inp.purchasePrice)
    const currentValue = num(inp.currentMarketValue)
    const annualAppreciation = pct(inp.isAppreciating === 'sí' ? inp.appreciationPct : '0')
    const annualDepreciation = pct(inp.isAppreciating === 'no' ? inp.depreciationPct : '0')
    const netAnnualChange = annualAppreciation - annualDepreciation
    const insuranceAnnual = num(inp.insuranceAnnual)
    const maintenanceAnnual = num(inp.maintenanceCostAnnual)
    const storageAnnual = num(inp.storageCostAnnual)
    const totalHoldingCostAnnual = insuranceAnnual + maintenanceAnnual + storageAnnual
    const ownershipPct = pct(inp.ownershipPct) / 100

    const years: {
        year: number; marketValue: number; gain: number; holdingCost: number
        netReturn: number; totalReturn: number; roi: number
    }[] = []

    let prevValue = currentValue
    for (let y = 1; y <= H; y++) {
        const marketValue = prevValue * (1 + netAnnualChange)
        const gain = marketValue - purchasePrice
        const holdingCost = totalHoldingCostAnnual
        const netReturn = (marketValue - prevValue) - holdingCost
        const totalReturn = gain - (totalHoldingCostAnnual * y)
        const roi = purchasePrice > 0 ? totalReturn / purchasePrice : 0
        years.push({ year: y, marketValue, gain, holdingCost, netReturn, totalReturn, roi })
        prevValue = marketValue
    }

    const finalValue = years[years.length - 1]?.marketValue ?? currentValue
    const totalHoldingCosts = totalHoldingCostAnnual * H
    const absoluteGain = finalValue - purchasePrice
    const netGain = absoluteGain - totalHoldingCosts
    const annualizedReturn = purchasePrice > 0 ? Math.pow(finalValue / purchasePrice, 1 / H) - 1 : 0
    const unrealizedGain = currentValue - purchasePrice
    const unrealizedGainPct = purchasePrice > 0 ? unrealizedGain / purchasePrice : 0
    const serviceDeferred = num(inp.serviceIntervalYears) > 0
        ? Math.max(0, parseInt(inp.serviceIntervalYears) - (new Date().getFullYear() - parseInt(inp.lastServiceYear))) + ' años'
        : '—'

    return {
        years, finalValue, totalHoldingCosts, absoluteGain, netGain,
        annualizedReturn, unrealizedGain, unrealizedGainPct, serviceDeferred,
        ownershipValue: netGain * ownershipPct,
        currentOwnershipValue: currentValue * ownershipPct,
    }
}

export default function WatchModelPage({ asset }: { asset: Asset }) {
    const navigate = useNavigate()
    const { user } = useAuth()
    const sd = (asset.sector_data ?? {}) as Record<string, unknown>

    const [inp, setInp] = useState<Inputs>({
        ...DEFAULTS,
        name: asset.name,
        brand: String(sd.brand ?? DEFAULTS.brand),
        model: String(sd.model ?? DEFAULTS.model),
        reference: String(sd.reference ?? DEFAULTS.reference),
        city: String(sd.city ?? DEFAULTS.city),
        serialNumber: String(sd.serial_number ?? ''),
        year_purchased: String(sd.year_purchased ?? DEFAULTS.year_purchased),
        openingYear: String(sd.year_purchased ?? DEFAULTS.openingYear),
        caseMaterial: String(sd.case_material ?? DEFAULTS.caseMaterial),
        caseDiameterMm: String(sd.case_diameter_mm ?? DEFAULTS.caseDiameterMm),
        dialColor: String(sd.dial_color ?? DEFAULTS.dialColor),
        bracelet: String(sd.bracelet ?? DEFAULTS.bracelet),
        waterResistanceM: String(sd.water_resistance_m ?? DEFAULTS.waterResistanceM),
        movement: String(sd.movement ?? DEFAULTS.movement),
        serviceIntervalYears: String(sd.service_interval_years ?? DEFAULTS.serviceIntervalYears),
        lastServiceYear: String(sd.last_service_year ?? DEFAULTS.lastServiceYear),
        condition: String(sd.condition ?? DEFAULTS.condition),
        boxPapers: (sd.box_papers === true || sd.box_papers === 'sí') ? 'sí' : 'no',
        storage: String(sd.storage ?? DEFAULTS.storage),
        purchasePrice: String(sd.purchase_price ?? DEFAULTS.purchasePrice),
        currentMarketValue: String(sd.current_market_value ?? DEFAULTS.currentMarketValue),
        insuranceAnnual: String(sd.insurance_annual ?? DEFAULTS.insuranceAnnual),
        appreciationPct: String(sd.appreciation_pct ?? DEFAULTS.appreciationPct),
        depreciationPct: String(sd.depreciation_pct ?? DEFAULTS.depreciationPct),
        isAppreciating: num(String(sd.appreciation_pct ?? '8')) > 0 ? 'sí' : 'no',
        notes: String(sd.notes ?? ''),
    })

    const set = (k: keyof Inputs) => (v: string) => setInp(p => ({ ...p, [k]: v }))
    const [tab, setTab] = useState<'supuestos' | 'proyeccion' | 'analisis'>('supuestos')
    const [saving, setSaving] = useState(false)

    const model = useMemo(() => computeWatchModel(inp), [inp])
    const TABS = [
        { key: 'supuestos', label: '📋 Datos Reloj' },
        { key: 'proyeccion', label: '📈 Proyección de Valor' },
        { key: 'analisis', label: '🎯 Análisis & ROI' },
    ] as const

    const handleSave = async () => {
        if (!user) return
        setSaving(true)
        await supabase.from('patrimonio_assets').update({
            name: inp.name,
            sector_data: {
                ...sd,
                brand: inp.brand, model: inp.model, reference: inp.reference,
                city: inp.city, serial_number: inp.serialNumber,
                year_purchased: parseInt(inp.year_purchased),
                case_material: inp.caseMaterial, case_diameter_mm: num(inp.caseDiameterMm),
                dial_color: inp.dialColor, bracelet: inp.bracelet,
                water_resistance_m: num(inp.waterResistanceM), movement: inp.movement,
                service_interval_years: num(inp.serviceIntervalYears),
                last_service_year: parseInt(inp.lastServiceYear),
                condition: inp.condition, box_papers: inp.boxPapers === 'sí',
                storage: inp.storage, purchase_price: num(inp.purchasePrice),
                current_market_value: num(inp.currentMarketValue),
                insurance_annual: num(inp.insuranceAnnual),
                appreciation_pct: num(inp.appreciationPct),
                depreciation_pct: num(inp.depreciationPct),
                notes: inp.notes,
            }
        }).eq('id', asset.id)

        await supabase.from('patrimonio_valuation_snapshots').insert({
            user_id: user.id, asset_id: asset.id,
            snapshot_date: new Date().toISOString().split('T')[0],
            value_low: Math.round(num(inp.currentMarketValue) * 0.92),
            value_base: Math.round(num(inp.currentMarketValue)),
            value_high: Math.round(model.finalValue),
            method_used: 'market', confidence_score: inp.boxPapers === 'sí' ? 'high' : 'medium',
            explanation: `Reloj de lujo ${inp.brand} ${inp.model} Ref. ${inp.reference}. Apreciación anual: ${inp.appreciationPct}%.`,
            assumptions_metadata: {
                appreciation_pct: num(inp.appreciationPct),
                current_value: num(inp.currentMarketValue),
                projected_value_at_horizon: model.finalValue,
                unrealized_gain: model.unrealizedGain,
            },
        })
        setSaving(false)
        navigate('/assets')
    }

    const conditionColors: Record<string, string> = {
        'perfecto': GREEN_CLR, 'excelente': GREEN_CLR,
        'muy bueno': GOLD_CLR, 'bueno': GOLD_CLR, 'regular': RED_CLR,
    }
    const condColor = conditionColors[inp.condition.toLowerCase()] ?? GOLD_CLR

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: '4rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                    <button onClick={() => navigate('/assets')} className="btn btn-ghost btn-sm" style={{ marginBottom: 6 }}>
                        <ArrowLeft size={13} /> Volver
                    </button>
                    <h2 style={{ marginBottom: 4 }}>{inp.brand} {inp.model || asset.name}</h2>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="badge badge-gold">⌚ Joya / Reloj de Lujo</span>
                        {inp.reference && <span className="badge badge-muted">Ref. {inp.reference}</span>}
                        {inp.boxPapers === 'sí' && <span style={{ fontSize: '0.72rem', color: GREEN_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(34,197,94,0.12)', borderRadius: 20 }}>📦 Caja + papeles</span>}
                        <span style={{ fontSize: '0.72rem', color: condColor, fontWeight: 700, padding: '2px 8px', background: `${condColor}18`, borderRadius: 20 }}>
                            Condición: {inp.condition}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: BLUE_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(59,130,246,0.12)', borderRadius: 20 }}>🔵 Azul = Inputs</span>
                        <span style={{ fontSize: '0.72rem', color: GOLD_CLR, fontWeight: 700, padding: '2px 8px', background: 'rgba(201,164,78,0.12)', borderRadius: 20 }}>🟡 Dorado = Fórmulas</span>
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
                <FormulaCell label="Ganancia latente" value={fmtEur(model.unrealizedGain)} formula={`${fmtPct(model.unrealizedGainPct)} sobre precio compra`} />
                <FormulaCell label="Precio compra" value={fmtEur(num(inp.purchasePrice))} formula="Coste base de inversión" />
                <FormulaCell label="Holding cost / año" value={fmtEur(num(inp.insuranceAnnual) + num(inp.maintenanceCostAnnual) + num(inp.storageCostAnnual))} formula="Seguro + mantenimiento + almacén" />
                <OutputCell label={`Valor proyectado (${inp.horizon}a)`} value={fmtEur(model.finalValue)} sub={`+${fmtPct(model.annualizedReturn)}/año`} />
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

            {/* ──────── TAB 1: DATOS DEL RELOJ ──────── */}
            {tab === 'supuestos' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <SectionHeader title="Identificación del Reloj" />
                    <InputCell label="Nombre / denominación" value={inp.name} onChange={set('name')} type="text" placeholder="Rolex Submariner Date" />
                    <InputCell label="Marca" value={inp.brand} onChange={set('brand')} type="text" placeholder="Rolex, Patek Philippe, AP…" />
                    <InputCell label="Modelo" value={inp.model} onChange={set('model')} type="text" placeholder="Submariner Date, Daytona…" />
                    <InputCell label="Referencia" value={inp.reference} onChange={set('reference')} type="text" placeholder="126610LN" hint="Número de referencia oficial del fabricante. Clave para valoración." />
                    <InputCell label="Número de serie" value={inp.serialNumber} onChange={set('serialNumber')} type="text" placeholder="Ej. 7X123456" hint="Permite trazar autenticidad e historial. Está grabado en la caja." />
                    <InputCell label="Ciudad" value={inp.city} onChange={set('city')} type="text" placeholder="Málaga" />
                    <InputCell label="Año de compra" value={inp.year_purchased} onChange={set('year_purchased')} placeholder="2021" />

                    <SectionHeader title="Especificaciones Técnicas" color={BLUE_CLR} />
                    <InputCell label="Material de la caja" value={inp.caseMaterial} onChange={set('caseMaterial')} type="text" placeholder="Oystersteel, oro amarillo 18k, platino…" hint="Oystersteel = acero Rolex propietario. Influye en el valor." />
                    <InputCell label="Diámetro caja" value={inp.caseDiameterMm} onChange={set('caseDiameterMm')} unit="mm" hint="Tamaño del reloj. Rolex sport: 40–41mm." />
                    <InputCell label="Color esfera (dial)" value={inp.dialColor} onChange={set('dialColor')} type="text" placeholder="Negro, azul, panda, verde…" hint="Determinadas esferas son más cotizadas (ej. esfera verde GMT, panda Daytona)." />
                    <InputCell label="Tipo de brazalete" value={inp.bracelet} onChange={set('bracelet')} type="text" placeholder="Oyster, Jubilee, Presidente…" />
                    <InputCell label="Resistencia al agua" value={inp.waterResistanceM} onChange={set('waterResistanceM')} unit="metros" />
                    <InputCell label="Calibre / movimiento" value={inp.movement} onChange={set('movement')} type="text" placeholder="Automático Cal. 3235, Manual…" hint="El calibre identifica la revisión mecánica del movimiento interno." />
                    <InputCell label="Intervalo de servicio" value={inp.serviceIntervalYears} onChange={set('serviceIntervalYears')} unit="años" hint="Rolex recomienda servicio cada 10 años (Cal. 3235). Coste aprox. 700–1200€." />
                    <InputCell label="Último servicio" value={inp.lastServiceYear} onChange={set('lastServiceYear')} placeholder="2021" hint="Si hace más de X años del último servicio, puede requerirse pronto → coste a incluir." />

                    <SectionHeader title="Condición y Documentación" color={BLUE_CLR} />
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Condición</span>
                        <select value={inp.condition} onChange={e => setInp(p => ({ ...p, condition: e.target.value }))}
                            style={{ marginTop: 6, width: '100%', padding: '0.45rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 6, color: BLUE_CLR, fontWeight: 700, fontSize: '0.875rem' }}>
                            <option value="perfecto">Perfecto (sin uso aparente)</option>
                            <option value="excelente">Excelente (mínimas marcas)</option>
                            <option value="muy bueno">Muy bueno (marcas normales de uso)</option>
                            <option value="bueno">Bueno (marcas visibles)</option>
                            <option value="regular">Regular (necesita polish/revisión)</option>
                        </select>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Caja y papeles originales</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            {(['sí', 'solo caja', 'solo papeles', 'no'] as const).map(r => (
                                <button key={r} onClick={() => setInp(p => ({ ...p, boxPapers: r }))}
                                    style={{ flex: 1, padding: '0.4rem', borderRadius: 6, border: `1px solid ${inp.boxPapers === r ? 'rgba(59,130,246,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer', background: inp.boxPapers === r ? 'rgba(59,130,246,0.12)' : 'transparent', color: inp.boxPapers === r ? BLUE_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.72rem' }}>
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>
                    <InputCell label="Almacenamiento / custodia" value={inp.storage} onChange={set('storage')} type="text" placeholder="caja fuerte, Brink's, banco…" hint="Afecta al seguro y a la percepción de riesgo." />

                    <SectionHeader title="Valoración Financiera" color={BLUE_CLR} />
                    <InputCell label="Precio de compra" value={inp.purchasePrice} onChange={set('purchasePrice')} unit="€" hint="Precio pagado en distribuidora, subasta o mercado secundario." />
                    <InputCell label="Valor mercado actual" value={inp.currentMarketValue} onChange={set('currentMarketValue')} unit="€" hint="Precio en Chrono24, Watchfinder, o referencia de distribuidora oficial." />
                    <InputCell label="Seguro anual" value={inp.insuranceAnnual} onChange={set('insuranceAnnual')} unit="€/año" hint="Seguro específico de joyas. Suele ser 0.1–0.3% del valor asegurado." />
                    <InputCell label="Mantenimiento / servicio" value={inp.maintenanceCostAnnual} onChange={set('maintenanceCostAnnual')} unit="€/año" hint="Coste anualizado del servicio. Rolex servicio cada 10 años ~700–1200€ → ~100€/año." />
                    <InputCell label="Coste almacenamiento" value={inp.storageCostAnnual} onChange={set('storageCostAnnual')} unit="€/año" hint="Caja de seguridad bancaria, Brink's, etc. 0 si en caja personal." />

                    <SectionHeader title="Apreciación / Depreciación" color={BLUE_CLR} />
                    <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: BLUE_CLR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tipo de activo</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button onClick={() => setInp(p => ({ ...p, isAppreciating: 'sí' }))}
                                style={{ flex: 1, padding: '0.4rem', borderRadius: 6, border: `1px solid ${inp.isAppreciating === 'sí' ? 'rgba(34,197,94,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer', background: inp.isAppreciating === 'sí' ? 'rgba(34,197,94,0.12)' : 'transparent', color: inp.isAppreciating === 'sí' ? GREEN_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem' }}>
                                📈 Se Revaloriza
                            </button>
                            <button onClick={() => setInp(p => ({ ...p, isAppreciating: 'no' }))}
                                style={{ flex: 1, padding: '0.4rem', borderRadius: 6, border: `1px solid ${inp.isAppreciating === 'no' ? 'rgba(239,68,68,0.6)' : 'var(--border-muted)'}`, cursor: 'pointer', background: inp.isAppreciating === 'no' ? 'rgba(239,68,68,0.12)' : 'transparent', color: inp.isAppreciating === 'no' ? RED_CLR : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem' }}>
                                📉 Se Deprecia
                            </button>
                        </div>
                    </div>
                    {inp.isAppreciating === 'sí'
                        ? <InputCell label="Tasa de revalorización anual" value={inp.appreciationPct} onChange={set('appreciationPct')} unit="%" hint="Rolex Daytona: +10–15%/año. Submariner: +6–10%/año. GMT Pepsi: +8–12%/año. Basado en mercado secundario Chrono24." />
                        : <InputCell label="Tasa de depreciación anual" value={inp.depreciationPct} onChange={set('depreciationPct')} unit="%" hint="Relojes de gama media suelen perder 10–20% en cuanto salen de la tienda." />
                    }
                    <InputCell label="Horizonte de análisis" value={inp.horizon} onChange={set('horizon')} unit="años" hint="Número de años para proyectar el valor del activo." />
                    <InputCell label="% Propiedad" value={inp.ownershipPct} onChange={set('ownershipPct')} unit="%" hint="Tu participación en el activo (100% si es totalmente tuyo)." />

                    <SectionHeader title="Notas" color={BLUE_CLR} />
                    <div style={{ gridColumn: 'span 3' }}>
                        <textarea value={inp.notes} onChange={e => setInp(p => ({ ...p, notes: e.target.value }))}
                            placeholder="Historial del reloj, procedencia, observaciones del mercado, estado de las correas, etc."
                            style={{ width: '100%', minHeight: 80, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, padding: '0.6rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.875rem', resize: 'vertical' }} />
                    </div>
                </div>
            )}

            {/* ──────── TAB 2: PROYECCIÓN ──────── */}
            {tab === 'proyeccion' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                        <FormulaCell label="Valor compra" value={fmtEur(num(inp.purchasePrice))} formula="Coste de adquisición base" />
                        <FormulaCell label="Valor actual" value={fmtEur(num(inp.currentMarketValue))} formula={`Ganancia latente: ${fmtEur(model.unrealizedGain)} (${fmtPct(model.unrealizedGainPct)})`} />
                        <OutputCell label={`Valor proyectado a ${inp.horizon} años`} value={fmtEur(model.finalValue)} large />
                        <FormulaCell label="Holding cost total" value={fmtEur(model.totalHoldingCosts)} formula={`${fmtEur(num(inp.insuranceAnnual) + num(inp.maintenanceCostAnnual) + num(inp.storageCostAnnual))}/año × ${inp.horizon} años`} />
                        <FormulaCell label="Ganancia bruta" value={fmtEur(model.absoluteGain)} formula="Valor final − Precio compra" />
                        <OutputCell label="Ganancia neta (tras costes)" value={fmtEur(model.netGain)} sub={`ROI neto: ${fmtPct(model.netGain / num(inp.purchasePrice) || 0)}`} />
                        <FormulaCell label="Rentabilidad anualizada (TIR)" value={fmtPct(model.annualizedReturn)} formula={`Rentabilidad compuesta a ${inp.horizon} años`} />
                        <FormulaCell label="Próximo servicio en" value={model.serviceDeferred} formula="Años restantes hasta mantenimiento" />
                        <FormulaCell label="Equity value (tu parte)" value={fmtEur(model.currentOwnershipValue)} formula={`${inp.ownershipPct}% de ${fmtEur(num(inp.currentMarketValue))}`} />
                    </div>

                    {/* Tabla de proyección año a año */}
                    <div>
                        <h4 style={{ color: GOLD_CLR, marginBottom: '0.75rem' }}>📊 Evolución del valor año a año</h4>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--black-850)' }}>
                                        {['Año', 'Valor Mercado', 'Ganancia Acum.', 'Holding Cost / año', 'Retorno Neto Anual', 'ROI Acum.'].map(h => (
                                            <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', border: '1px solid var(--border-muted)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {model.years.map(y => (
                                        <tr key={y.year} style={{ borderBottom: '1px solid var(--border-muted)', background: y.year % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: GOLD_CLR }}>Año {y.year}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: GREEN_CLR }}>{fmtEur(y.marketValue)}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: y.gain >= 0 ? GREEN_CLR : RED_CLR }}>{fmtEur(y.gain)}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: RED_CLR }}>−{fmtEur(y.holdingCost)}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: y.netReturn >= 0 ? GREEN_CLR : RED_CLR }}>{fmtEur(y.netReturn)}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: y.roi >= 0 ? GREEN_CLR : RED_CLR }}>{fmtPct(y.roi)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ──────── TAB 3: ANÁLISIS ──────── */}
            {tab === 'analisis' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <h4 style={{ color: GOLD_CLR }}>📋 Ficha de Análisis</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                        <div style={{ background: 'var(--black-850)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1.25rem' }}>
                            <div style={{ fontWeight: 700, color: GREEN_CLR, marginBottom: '0.75rem' }}>✅ Factores que aumentan el valor</div>
                            {[
                                inp.boxPapers === 'sí' && '📦 Caja y papers originales → +10–15% premium',
                                inp.condition === 'perfecto' || inp.condition === 'excelente' ? '✨ Condición excelente → valor máximo de mercado' : null,
                                num(inp.appreciationPct) > 5 && `📈 Apreciación anual ${inp.appreciationPct}% → mercado fuerte`,
                                inp.brand === 'Rolex' && '🏆 Marca Rolex → alta liquidez en mercado secundario',
                                ['126500LN', '116500LN', '126710BLRO', '126610LN'].includes(inp.reference) && `⭐ Referencia ${inp.reference} → alta demanda`,
                            ].filter(Boolean).map((f, i) => (
                                <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>{f as string}</div>
                            ))}
                        </div>
                        <div style={{ background: 'var(--black-850)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1.25rem' }}>
                            <div style={{ fontWeight: 700, color: RED_CLR, marginBottom: '0.75rem' }}>⚠️ Factores de riesgo</div>
                            {[
                                inp.boxPapers !== 'sí' && '📦 Sin caja/papers → -10 a -15% en reventa',
                                parseInt(inp.lastServiceYear) < new Date().getFullYear() - 8 && '🔧 Servicio próximo requerido → coste 700–1200€',
                                inp.condition === 'regular' || inp.condition === 'bueno' ? '⚠️ Condición mejorable → descuento en precio' : null,
                                num(inp.insuranceAnnual) === 0 && '🛡️ Sin seguro → riesgo de pérdida total sin cobertura',
                            ].filter(Boolean).map((f, i) => (
                                <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>{f as string}</div>
                            ))}
                            {[inp.boxPapers !== 'sí', parseInt(inp.lastServiceYear) < new Date().getFullYear() - 8, num(inp.insuranceAnnual) === 0].filter(Boolean).length === 0 &&
                                <div style={{ fontSize: '0.8rem', color: GREEN_CLR }}>✅ Sin factores de riesgo identificados</div>}
                        </div>
                    </div>

                    {/* Comparativa de mercado */}
                    <div style={{ background: 'var(--black-850)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1.25rem' }}>
                        <div style={{ fontWeight: 700, color: GOLD_CLR, marginBottom: '0.75rem' }}>📊 Comparativa de referencias de mercado</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', fontSize: '0.8rem' }}>
                            {[
                                { ref: '126610LN', model: 'Submariner Date', market: '13.000–16.500 €', trend: '+6–10%/año' },
                                { ref: '116500LN', model: 'Daytona Panda', market: '22.000–30.000 €', trend: '+12–18%/año' },
                                { ref: '126710BLRO', model: 'GMT Pepsi', market: '17.000–22.000 €', trend: '+8–13%/año' },
                                { ref: '126710BLNR', model: 'GMT Batman', market: '14.000–19.000 €', trend: '+7–11%/año' },
                                { ref: '126660', model: 'Sea-Dweller', market: '12.000–15.000 €', trend: '+5–8%/año' },
                                { ref: '126334', model: 'Datejust 41', market: '9.000–12.000 €', trend: '+3–6%/año' },
                            ].map(r => (
                                <div key={r.ref} style={{ background: r.ref === inp.reference ? 'rgba(201,164,78,0.12)' : 'rgba(255,255,255,0.02)', border: `1px solid ${r.ref === inp.reference ? 'rgba(201,164,78,0.4)' : 'var(--border-muted)'}`, borderRadius: 8, padding: '0.75rem' }}>
                                    <div style={{ fontWeight: 700, color: r.ref === inp.reference ? GOLD_CLR : 'var(--text-primary)' }}>{r.ref} {r.ref === inp.reference ? '← Tu reloj' : ''}</div>
                                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{r.model}</div>
                                    <div style={{ color: GREEN_CLR, fontWeight: 700, marginTop: 4 }}>{r.market}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{r.trend}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            * Precios orientativos basados en Chrono24, Watchfinder y Christie's. Actualiza el valor de mercado actual en la pestaña Datos.
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
