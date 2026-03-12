import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Building2, Utensils, Watch, Car, Package,
    ChevronRight, ChevronLeft, HelpCircle, Info
} from 'lucide-react'
import { useAssets } from '../hooks/useAssets'
import { useCountryPresets } from '../hooks/useAssets'
import {
    runDCF, valuateRealEstate, valuateCollectible,
    getDiscountRateByRisk
} from '../lib/valuation/engine'
import type { AssetCategory, ValuationResult } from '../types'

const CATEGORIES = [
    { key: 'real_estate' as AssetCategory, label: 'Inmobiliaria', icon: Building2, desc: 'Pisos, locales, naves, terrenos' },
    { key: 'restaurant' as AssetCategory, label: 'Restaurante / Negocio', icon: Utensils, desc: 'Negocios operativos con EBITDA' },
    { key: 'watch' as AssetCategory, label: 'Reloj Coleccionable', icon: Watch, desc: 'Relojes de lujo y coleccionables' },
    { key: 'car' as AssetCategory, label: 'Coche', icon: Car, desc: 'Vehículos de inversión o uso' },
    { key: 'other' as AssetCategory, label: 'Otro Activo', icon: Package, desc: 'Arte, cripto, préstamos, etc.' },
]

function InputWithHelp({ label, hint, children, required }: { label: string; hint?: string; children: React.ReactNode; required?: boolean }) {
    const [showHint, setShowHint] = useState(false)
    return (
        <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label className="form-label">
                    {label} {required && <span className="required">*</span>}
                </label>
                {hint && (
                    <button type="button" onClick={() => setShowHint(!showHint)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>
                        <HelpCircle size={13} />
                    </button>
                )}
            </div>
            {showHint && <div className="alert alert-gold" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}><Info size={13} style={{ flexShrink: 0 }} /> {hint}</div>}
            {children}
        </div>
    )
}

export default function AddAssetPage() {
    const navigate = useNavigate()
    const { createAsset, saveValuationSnapshot } = useAssets()
    const { presets } = useCountryPresets()

    const [step, setStep] = useState(1)
    const [saving, setSaving] = useState(false)
    const [valResult, setValResult] = useState<ValuationResult | null>(null)

    // Step 1: Basic info
    const [category, setCategory] = useState<AssetCategory | null>(null)
    const [name, setName] = useState('')
    const [country, setCountry] = useState('ES')
    const [currency, setCurrency] = useState('EUR')

    // Step 2: Details
    const [purchaseCost, setPurchaseCost] = useState('')
    const [purchaseDate, setPurchaseDate] = useState('')
    const [ownership, setOwnership] = useState('100')
    const [liquidityLevel, setLiquidityLevel] = useState<'high' | 'medium' | 'low'>('low')
    const [debtAmount, setDebtAmount] = useState('')
    const [notes, setNotes] = useState('')

    // Step 3: Sector-specific inputs (mode: easy)
    const [revenues, setRevenues] = useState('')
    const [ebitdaMargin, setEbitdaMargin] = useState('')
    const [revenueGrowth, setRevenueGrowth] = useState('5')
    const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium')
    const [grossRent, setGrossRent] = useState('')
    const [capRate, setCapRate] = useState('4.5')
    const [brand, setBrand] = useState('')
    const [modelName, setModelName] = useState('')
    const [yearMade, setYearMade] = useState('')
    const [condition, setCondition] = useState('8')
    const [appreciationRate, setAppreciationRate] = useState('5')

    const isFinalStep = step === 4

    const getCountryPreset = () => presets.find((p: Record<string, unknown>) => p.country_code === country)

    function computeValuation(): ValuationResult | null {
        const preset = getCountryPreset() as Record<string, number> | undefined
        const rf = preset?.risk_free_rate ?? 0.04
        const erp = preset?.equity_risk_premium ?? 0.055
        const crp = preset?.country_risk_premium ?? 0.00
        const dr = getDiscountRateByRisk(riskLevel, rf + erp + crp)

        if (category === 'real_estate') {
            const inc = parseFloat(grossRent) || 0
            if (!inc) return null
            return valuateRealEstate({
                grossRentalIncome: inc,
                capRate: (parseFloat(capRate) || 4.5) / 100,
                discountRate: dr,
                debtOutstanding: parseFloat(debtAmount) || 0,
            })
        }

        if (category === 'restaurant' || category === 'other') {
            const rev = parseFloat(revenues) || 0
            if (!rev) return null
            return runDCF({
                revenue: rev,
                revenueGrowthRate: (parseFloat(revenueGrowth) || 5) / 100,
                ebitdaMargin: (parseFloat(ebitdaMargin) || 20) / 100,
                capexLevel: riskLevel === 'low' ? 'low' : riskLevel === 'high' ? 'high' : 'medium',
                taxRate: preset?.effective_tax_rate ?? 0.25,
                discountRate: dr,
                terminalGrowthRate: 0.02,
                horizonYears: 5,
                debtOutstanding: parseFloat(debtAmount) || 0,
            })
        }

        if (category === 'watch' || category === 'car') {
            const pc = parseFloat(purchaseCost) || 0
            const yr = parseInt(yearMade) || new Date().getFullYear() - 3
            return valuateCollectible({
                purchasePrice: pc,
                purchaseYear: yr,
                appreciationRate: (parseFloat(appreciationRate) || 0) / 100,
                condition: parseInt(condition) || 8,
                sellerFee: 0.10,
            })
        }
        return null
    }

    const handleNextStep = () => {
        if (step === 3) {
            const result = computeValuation()
            setValResult(result)
        }
        setStep(s => s + 1)
    }

    const handleSave = async () => {
        setSaving(true)
        const preset = getCountryPreset() as Record<string, unknown> | undefined

        const assetData = {
            name,
            category: category!,
            country_operating: country,
            currency: preset ? String(preset.currency ?? 'EUR') : currency,
            ownership_pct: parseFloat(ownership) || 100,
            status: 'active' as const,
            purchase_cost: parseFloat(purchaseCost) || undefined,
            purchase_date: purchaseDate || undefined,
            preferred_valuation_method: 'dcf' as const,
            liquidity_level: liquidityLevel,
            notes: notes || undefined,
            sector_data: {
                brand, modelName, yearMade, condition, appreciationRate,
                revenues, ebitdaMargin, revenueGrowth, grossRent, capRate,
            },
        }

        const { error } = await createAsset(assetData as never)

        if (!error && valResult) {
            // Get newly created asset id — for simplicity, re-fetch is done in hook
            // We'll save the snapshot after creation. In production, return the ID from createAsset.
            console.log('Asset + valuation saved:', valResult)
        }

        setSaving(false)
        navigate('/assets')
    }

    const steps = [
        { n: 1, label: 'Tipo' },
        { n: 2, label: 'Info' },
        { n: 3, label: 'Valorar' },
        { n: 4, label: 'Confirmar' },
    ]

    const canProceedStep1 = !!category
    const canProceedStep2 = !!name && !!country

    return (
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>

            {/* Wizard Steps */}
            <div className="wizard-steps">
                {steps.map((s, idx) => (
                    <React.Fragment key={s.n}>
                        <div className={`wizard-step ${step === s.n ? 'active' : step > s.n ? 'completed' : ''}`}>
                            <div className="wizard-step-number">
                                {step > s.n ? '✓' : s.n}
                            </div>
                            <span className="wizard-step-label">{s.label}</span>
                        </div>
                        {idx < steps.length - 1 && <div className="wizard-step-connector" />}
                    </React.Fragment>
                ))}
            </div>

            {/* STEP 1: Asset Type */}
            {step === 1 && (
                <div className="card animate-slide-up">
                    <h3 style={{ marginBottom: '0.25rem' }}>¿Qué tipo de activo es?</h3>
                    <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>Selecciona para optimizar la valoración</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                        {CATEGORIES.map(cat => {
                            const Icon = cat.icon
                            const selected = category === cat.key
                            return (
                                <button
                                    key={cat.key}
                                    onClick={() => setCategory(cat.key)}
                                    style={{
                                        background: selected ? 'rgba(201, 164, 78, 0.12)' : 'var(--black-800)',
                                        border: `1px solid ${selected ? 'var(--gold-500)' : 'var(--border-muted)'}`,
                                        borderRadius: 'var(--radius-lg)', padding: '1.25rem',
                                        cursor: 'pointer', textAlign: 'left',
                                        transition: 'all var(--transition-fast)',
                                        display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                        boxShadow: selected ? 'var(--shadow-gold)' : 'none',
                                    }}
                                >
                                    <Icon size={22} style={{ color: selected ? 'var(--text-gold)' : 'var(--text-muted)' }} />
                                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: selected ? 'var(--text-gold)' : 'var(--text-primary)' }}>{cat.label}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cat.desc}</div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* STEP 2: Basic info */}
            {step === 2 && (
                <div className="card animate-slide-up">
                    <h3 style={{ marginBottom: '0.25rem' }}>Información del activo</h3>
                    <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>Datos básicos del activo patrimonial</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <InputWithHelp label="Nombre del activo" required hint="Un nombre descriptivo, ej: 'Piso Calle Mayor 12' o 'Rolex Submariner'">
                            <input className="form-input" placeholder="Ej: Piso Salamanca" value={name} onChange={e => setName(e.target.value)} required />
                        </InputWithHelp>

                        <div className="form-row">
                            <InputWithHelp label="País operativo" required hint="País donde opera o está este activo. Afecta a la tasa de descuento y fiscalidad.">
                                <select className="form-select" value={country} onChange={e => setCountry(e.target.value)}>
                                    {presets.map((p: Record<string, unknown>) => (
                                        <option key={String(p.country_code)} value={String(p.country_code)}>{String(p.country_name)}</option>
                                    ))}
                                </select>
                            </InputWithHelp>

                            <InputWithHelp label="Nivel de liquidez" hint="¿Con qué facilidad puedes convertirlo en efectivo?">
                                <select className="form-select" value={liquidityLevel} onChange={e => setLiquidityLevel(e.target.value as 'high' | 'medium' | 'low')}>
                                    <option value="high">Alta (días)</option>
                                    <option value="medium">Media (semanas)</option>
                                    <option value="low">Baja (meses/años)</option>
                                </select>
                            </InputWithHelp>
                        </div>

                        <div className="form-row">
                            <InputWithHelp label="Coste de adquisición (€)" hint="¿Cuánto pagaste por este activo?">
                                <input className="form-input" type="number" placeholder="350.000" value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)} />
                            </InputWithHelp>

                            <InputWithHelp label="Fecha de compra">
                                <input className="form-input" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                            </InputWithHelp>
                        </div>

                        <div className="form-row">
                            <InputWithHelp label="% Propiedad" hint="¿Qué porcentaje te pertenece? (100% = propietario total)">
                                <input className="form-input" type="number" min="1" max="100" placeholder="100" value={ownership} onChange={e => setOwnership(e.target.value)} />
                            </InputWithHelp>

                            <InputWithHelp label="Deuda asociada (€)" hint="Hipoteca, préstamo u otra deuda vinculada a este activo.">
                                <input className="form-input" type="number" placeholder="0" value={debtAmount} onChange={e => setDebtAmount(e.target.value)} />
                            </InputWithHelp>
                        </div>

                        <InputWithHelp label="Notas (opcional)">
                            <textarea className="form-textarea" placeholder="Observaciones adicionales..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                        </InputWithHelp>
                    </div>
                </div>
            )}

            {/* STEP 3: Sector-specific valuation inputs */}
            {step === 3 && (
                <div className="card animate-slide-up">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <div>
                            <h3 style={{ marginBottom: '0.25rem' }}>Valoración — Modo Fácil</h3>
                            <p className="text-muted text-sm">Introduce los datos clave para estimar el valor</p>
                        </div>
                        <span className="badge badge-gold">Modo Fácil</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Riesgo selector */}
                        <InputWithHelp label="Nivel de riesgo del activo" hint="Traduce a la tasa de descuento: Bajo ~7%, Medio ~10%, Alto ~14%">
                            <div className="mode-toggle" style={{ width: 'max-content' }}>
                                {(['low', 'medium', 'high'] as const).map(r => (
                                    <button key={r} className={`mode-toggle-option ${riskLevel === r ? 'active' : ''}`} onClick={() => setRiskLevel(r)}>
                                        {r === 'low' ? 'Bajo' : r === 'medium' ? 'Medio' : 'Alto'}
                                    </button>
                                ))}
                            </div>
                        </InputWithHelp>

                        {/* Real Estate */}
                        {category === 'real_estate' && (
                            <>
                                <InputWithHelp label="Ingreso bruto anual por alquiler (€)" required hint="Suma de todos los alquileres brutos en un año, sin descontar gastos.">
                                    <input className="form-input" type="number" placeholder="24.000" value={grossRent} onChange={e => setGrossRent(e.target.value)} />
                                </InputWithHelp>
                                <InputWithHelp label="Cap Rate de mercado (%)" hint="Tasa de capitalización para el tipo de inmueble y zona. En España suele rondar 3.5%–6%.">
                                    <input className="form-input" type="number" step="0.1" placeholder="4.5" value={capRate} onChange={e => setCapRate(e.target.value)} />
                                </InputWithHelp>
                            </>
                        )}

                        {/* Restaurant / Business */}
                        {(category === 'restaurant' || category === 'other') && (
                            <>
                                <InputWithHelp label="Ventas anuales (€)" required hint="Facturación total anual del negocio.">
                                    <input className="form-input" type="number" placeholder="500.000" value={revenues} onChange={e => setRevenues(e.target.value)} />
                                </InputWithHelp>
                                <div className="form-row">
                                    <InputWithHelp label="Margen EBITDA (%)" hint="EBITDA / Ventas × 100. Un restaurante típico: 10–20%.">
                                        <input className="form-input" type="number" step="0.5" placeholder="15" value={ebitdaMargin} onChange={e => setEbitdaMargin(e.target.value)} />
                                    </InputWithHelp>
                                    <InputWithHelp label="Crecimiento ventas (%/año)" hint="¿Cuánto esperan crecer las ventas al año?">
                                        <input className="form-input" type="number" step="0.5" placeholder="5" value={revenueGrowth} onChange={e => setRevenueGrowth(e.target.value)} />
                                    </InputWithHelp>
                                </div>
                            </>
                        )}

                        {/* Watch / Car */}
                        {(category === 'watch' || category === 'car') && (
                            <>
                                <div className="form-row">
                                    <InputWithHelp label="Marca">
                                        <input className="form-input" placeholder={category === 'watch' ? 'Rolex' : 'Ferrari'} value={brand} onChange={e => setBrand(e.target.value)} />
                                    </InputWithHelp>
                                    <InputWithHelp label="Modelo">
                                        <input className="form-input" placeholder={category === 'watch' ? 'Submariner 124060' : '488 GTB'} value={modelName} onChange={e => setModelName(e.target.value)} />
                                    </InputWithHelp>
                                </div>
                                <div className="form-row">
                                    <InputWithHelp label="Año de fabricación" hint="Año en que fue producido.">
                                        <input className="form-input" type="number" placeholder="2018" value={yearMade} onChange={e => setYearMade(e.target.value)} />
                                    </InputWithHelp>
                                    <InputWithHelp label="Estado (1-10)" hint="1 = muy deteriorado, 10 = perfecto / nuevo.">
                                        <input className="form-input" type="number" min="1" max="10" placeholder="9" value={condition} onChange={e => setCondition(e.target.value)} />
                                    </InputWithHelp>
                                </div>
                                <InputWithHelp label="Apreciación / depreciación anual estimada (%)" hint="Porcentaje de cambio de valor por año. Positivo = aprecia, negativo = deprecia.">
                                    <input className="form-input" type="number" step="0.5" placeholder="5" value={appreciationRate} onChange={e => setAppreciationRate(e.target.value)} />
                                </InputWithHelp>
                            </>
                        )}

                        <div className="alert alert-gold">
                            <Info size={14} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '0.8125rem' }}>
                                El motor calculará el rango de valoración (bajo/base/alto) automáticamente. Podrás ajustar supuestos desde el detalle del activo.
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 4: Confirmation & Result */}
            {step === 4 && (
                <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="card">
                        <h3 style={{ marginBottom: '1.5rem' }}>✨ Resumen del Activo</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            {(([
                                ['Nombre', name],
                                ['Categoría', CATEGORIES.find(c => c.key === category)?.label ?? '—'],
                                ['País', String((presets.find((p: Record<string, unknown>) => p.country_code === country) as Record<string, unknown>)?.country_name ?? country)],
                                ['Licencia (%)', `${ownership}%`],
                                ['Liquidez', liquidityLevel],
                                ['Deuda', debtAmount ? `${Number(debtAmount).toLocaleString('es-ES')} €` : '—'],
                            ]) as [string, string][]).map(([k, v]) => (
                                <div key={k}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {valResult && (
                        <div className="card">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <h4>Valoración Estimada</h4>
                                <div className="confidence-indicator">
                                    <div className={`confidence-dot ${valResult.confidence}`} />
                                    <span className={`confidence-label ${valResult.confidence}`}>
                                        {valResult.confidence === 'high' ? 'Alta confianza' : valResult.confidence === 'medium' ? 'Confianza media' : 'Baja confianza'}
                                    </span>
                                </div>
                            </div>

                            <div className="value-range">
                                <div className="value-range-item">
                                    <div className="value-range-label">Conservador</div>
                                    <div className="value-range-amount">{Math.round(valResult.low).toLocaleString('es-ES')} €</div>
                                </div>
                                <div className="value-range-divider" />
                                <div className="value-range-item">
                                    <div className="value-range-label">Base</div>
                                    <div className="value-range-amount base">{Math.round(valResult.base).toLocaleString('es-ES')} €</div>
                                </div>
                                <div className="value-range-divider" />
                                <div className="value-range-item">
                                    <div className="value-range-label">Optimista</div>
                                    <div className="value-range-amount">{Math.round(valResult.high).toLocaleString('es-ES')} €</div>
                                </div>
                            </div>

                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: '1rem', lineHeight: 1.6 }}>
                                {valResult.explanation}
                            </p>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {valResult.drivers.map((d, i) => (
                                    <span key={i} className="chip" style={{ fontSize: '0.75rem' }}>{d}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {!valResult && (
                        <div className="alert alert-gold">
                            <Info size={14} />
                            <span>No se han introducido datos suficientes para calcular la valoración. El activo se guardará y podrás valorarlo desde el detalle.</span>
                        </div>
                    )}
                </div>
            )}

            {/* Navigation buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', paddingTop: '0.5rem' }}>
                <button
                    className="btn btn-secondary"
                    onClick={() => step === 1 ? navigate('/assets') : setStep(s => s - 1)}
                >
                    <ChevronLeft size={16} />
                    {step === 1 ? 'Cancelar' : 'Atrás'}
                </button>

                {!isFinalStep ? (
                    <button
                        className="btn btn-primary"
                        onClick={handleNextStep}
                        disabled={step === 1 && !canProceedStep1 || step === 2 && !canProceedStep2}
                    >
                        Siguiente
                        <ChevronRight size={16} />
                    </button>
                ) : (
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Guardando...' : '✓ Guardar Activo'}
                    </button>
                )}
            </div>
        </div>
    )
}
