import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    Save, ArrowLeft, TrendingUp, Building2, Utensils, Info,
    RefreshCw, ChevronDown, ChevronRight, Calculator
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAssets } from '../hooks/useAssets'
import { useCountryPresets } from '../hooks/useAssets'
import { useAuth } from '../contexts/AuthContext'
import {
    runRestaurantDCF, valuateRealEstate,
    type RestaurantDCFInputs, type RealEstateInputs, type PlYear
} from '../lib/valuation/engine'
import type { Asset, ValuationResult } from '../types'

// ─── helpers ───────────────────────────────────────────────
const fmt = (n: number, d = 0) => n?.toLocaleString('es-ES', { maximumFractionDigits: d }) ?? '0'
const fmtEur = (n: number) => `${fmt(Math.round(n))} €`
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const n = (v: string) => parseFloat(v.replace(',', '.')) || 0
const p = (v: string) => n(v) / 100  // percent input → decimal

function Field({
    label, hint, unit, children, half
}: {
    label: string; hint?: string; unit?: string; children: React.ReactNode; half?: boolean
}) {
    const [sh, setSh] = useState(false)
    return (
        <div style={{ gridColumn: half ? 'span 1' : 'span 2' }} className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>{label}</label>
                {unit && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{unit}</span>}
                {hint && (
                    <button type="button" onClick={() => setSh(!sh)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1, marginLeft: 2 }}>
                        <Info size={13} />
                    </button>
                )}
            </div>
            {sh && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(201,164,78,0.06)', border: '1px solid var(--border-gold)', borderRadius: 6, padding: '0.5rem 0.75rem', marginBottom: 6, lineHeight: 1.5 }}>{hint}</div>}
            <div style={{ display: 'flex', alignItems: 'center' }}>
                {children}
            </div>
        </div>
    )
}

function Input({ value, onChange, type = 'number', placeholder = '0', ...rest }: {
    value: string; onChange: (v: string) => void; type?: string; placeholder?: string;[k: string]: unknown
}) {
    return (
        <input
            className="form-input"
            type={type}
            placeholder={placeholder}
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{ flex: 1 }}
            {...rest}
        />
    )
}

function Section({ title, icon: Icon, open: defaultOpen = true, children }: {
    title: string; icon?: React.ElementType; open?: boolean; children: React.ReactNode
}) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: '1rem' }}>
            <button onClick={() => setOpen(!open)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.875rem 1.25rem', background: 'var(--black-850)', border: 'none', cursor: 'pointer',
            }}>
                {Icon && <Icon size={16} style={{ color: 'var(--text-gold)', flexShrink: 0 }} />}
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)', flex: 1, textAlign: 'left' }}>{title}</span>
                {open ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
            </button>
            {open && (
                <div style={{ padding: '1.25rem', background: 'var(--black-900)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {children}
                </div>
            )}
        </div>
    )
}

// ─── Valuation result card ───────────────────────────────
function ValuationCard({ result, plTable }: { result: ValuationResult; plTable?: PlYear[] }) {
    const [showPL, setShowPL] = useState(false)
    const confidence = result.confidence
    const dot = confidence === 'high' ? '#22c55e' : confidence === 'medium' ? '#f59e0b' : '#ef4444'
    const dotLabel = confidence === 'high' ? 'Alta' : confidence === 'medium' ? 'Media' : 'Baja'

    return (
        <div style={{ border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-lg)', background: 'rgba(201,164,78,0.06)', padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calculator size={18} style={{ color: 'var(--text-gold)' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Resultado DCF</span>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 700, color: dot }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, boxShadow: `0 0 6px ${dot}` }} />
                    Confianza {dotLabel}
                </span>
            </div>

            {/* Range */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                {[['Conservador', result.low, 'var(--text-muted)'], ['Base (DCF)', result.base, 'var(--text-gold)'], ['Optimista', result.high, '#4ade80']].map(([label, val, color]) => (
                    <div key={String(label)} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{String(label)}</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.125rem', color: String(color) }}>{fmtEur(Number(val))}</div>
                    </div>
                ))}
            </div>

            {/* Explanation */}
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '0.75rem' }}>{result.explanation}</p>

            {/* Drivers */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.drivers.map((d, i) => (
                    <span key={i} className="chip" style={{ fontSize: '0.75rem' }}>{d}</span>
                ))}
            </div>

            {/* P&L table toggle */}
            {plTable && plTable.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <button onClick={() => setShowPL(!showPL)} className="btn btn-ghost btn-sm">
                        {showPL ? 'Ocultar' : '📊 Ver'} tabla P&L proyectada
                    </button>
                    {showPL && (
                        <div className="table-container" style={{ marginTop: '0.75rem' }}>
                            <table className="table" style={{ fontSize: '0.75rem' }}>
                                <thead>
                                    <tr>
                                        {['Año', 'Ventas', 'COGS', 'Margen Bruto', 'Staff', 'Alquiler', 'Otros', 'EBITDA', 'D&A', 'EBIT', 'NOPAT', 'CAPEX', 'FCF'].map(h => <th key={h}>{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {plTable.map(row => (
                                        <tr key={row.year}>
                                            <td style={{ fontWeight: 700, color: 'var(--text-gold)' }}>Año {row.year}</td>
                                            <td>{fmt(row.revenue)}</td>
                                            <td style={{ color: '#f87171' }}>{fmt(row.cogs)}</td>
                                            <td style={{ color: '#4ade80' }}>{fmt(row.grossProfit)}</td>
                                            <td style={{ color: '#f87171' }}>{fmt(row.staff)}</td>
                                            <td style={{ color: '#f87171' }}>{fmt(row.rent)}</td>
                                            <td style={{ color: '#f87171' }}>{fmt(row.utils)}</td>
                                            <td style={{ fontWeight: 700, color: 'var(--text-gold)' }}>{fmt(row.ebitda)}</td>
                                            <td>{fmt(row.da)}</td>
                                            <td>{fmt(row.ebit)}</td>
                                            <td>{fmt(row.nopat)}</td>
                                            <td>{fmt(row.capex)}</td>
                                            <td style={{ fontWeight: 700, color: row.fcf >= 0 ? '#4ade80' : '#f87171' }}>{fmt(row.fcf)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── RESTAURANT FORM DATA ─────────────────────────────────
interface RestaurantForm {
    regime: 'owned' | 'leased'
    revenue: string; cogsRate: string; staffCostRate: string
    annualRent: string; utilsRate: string
    depreciationAnnual: string; maintenanceCapex: string; workingCapitalDays: string
    revenueGrowth: string; discountRate: string; terminalGrowth: string; horizonYears: string
    taxRate: string; debtOutstanding: string; ownershipPct: string
    // Context
    openingYear: string; areaSqm: string; staffCount: string; ticketMedium: string; coversDay: string
}

// ─── REAL ESTATE FORM DATA ───────────────────────────────
interface RealEstateForm {
    regime: 'owned' | 'leased'
    grossRent: string; occupancyRate: string
    maintenancePct: string; managementFeePct: string
    ibiAnnual: string; insuranceAnnual: string; communityAnnual: string; otherOpex: string
    capRate: string; rentalGrowth: string; propertyAppreciation: string
    discountRate: string; horizonYears: string; debtOutstanding: string
    sqm: string; pricePerSqm: string; floors: string; bedrooms: string; yearBuilt: string
    // Lease info (if leased)
    leaseRentPaid: string; leaseExpiry: string; leaseRenewable: string
}

// ─── BASIC INFO ───────────────────────────────────────────
interface BasicForm {
    name: string; city: string; address: string; country: string
    areaSqm: string; ownershipPct: string; purchaseCost: string; purchaseDate: string
    liquidityLevel: 'high' | 'medium' | 'low'; notes: string
}

// ═══════════════════════════════════════════════════════════
// ASSET DETAIL PAGE
// ═══════════════════════════════════════════════════════════
export default function AssetDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { updateAsset, saveValuationSnapshot, fetchAssets } = useAssets()
    const { presets } = useCountryPresets()
    const { user } = useAuth()

    const [asset, setAsset] = useState<Asset | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState<'basic' | 'financial' | 'valuation'>('basic')
    const [valResult, setValResult] = useState<(ValuationResult & { plTable?: PlYear[] }) | null>(null)

    // ── Forms ────────────────────────────────────────────────
    const [basic, setBasic] = useState<BasicForm>({
        name: '', city: '', address: '', country: 'ES', areaSqm: '', ownershipPct: '100',
        purchaseCost: '', purchaseDate: '', liquidityLevel: 'low', notes: '',
    })

    const [restaurant, setRestaurant] = useState<RestaurantForm>({
        regime: 'leased', revenue: '', cogsRate: '28', staffCostRate: '32',
        annualRent: '', utilsRate: '10', depreciationAnnual: '', maintenanceCapex: '',
        workingCapitalDays: '15', revenueGrowth: '5', discountRate: '10',
        terminalGrowth: '2', horizonYears: '7', taxRate: '25', debtOutstanding: '0',
        ownershipPct: '100', openingYear: '', areaSqm: '', staffCount: '',
        ticketMedium: '', coversDay: '',
    })

    const [realEstate, setRealEstate] = useState<RealEstateForm>({
        regime: 'owned', grossRent: '', occupancyRate: '95', maintenancePct: '5',
        managementFeePct: '8', ibiAnnual: '', insuranceAnnual: '', communityAnnual: '',
        otherOpex: '', capRate: '4.5', rentalGrowth: '3', propertyAppreciation: '3',
        discountRate: '7', horizonYears: '10', debtOutstanding: '0',
        sqm: '', pricePerSqm: '', floors: '', bedrooms: '', yearBuilt: '',
        leaseRentPaid: '', leaseExpiry: '', leaseRenewable: 'si',
    })

    // ── Load asset ────────────────────────────────────────────
    useEffect(() => {
        if (!id) return
        supabase.from('patrimonio_assets').select('*').eq('id', id).single().then(({ data }) => {
            if (!data) { navigate('/assets'); return }
            const a = data as Asset
            setAsset(a)
            const sd = (a.sector_data ?? {}) as Record<string, unknown>

            setBasic({
                name: a.name, city: String(sd.city ?? ''), address: String(sd.address ?? ''),
                country: a.country_operating, areaSqm: String(sd.area_sqm ?? ''),
                ownershipPct: String(a.ownership_pct ?? 100), purchaseCost: String(a.purchase_cost ?? ''),
                purchaseDate: a.purchase_date ?? '', liquidityLevel: a.liquidity_level as 'high' | 'medium' | 'low' ?? 'low',
                notes: a.notes ?? '',
            })

            if (a.category === 'restaurant') {
                setRestaurant(prev => ({
                    ...prev,
                    regime: String(sd.regime ?? 'leased') as 'owned' | 'leased',
                    revenue: String(sd.annual_revenue ?? ''),
                    cogsRate: String(sd.cogs_pct ?? '28'),
                    staffCostRate: String(sd.staff_pct ?? '32'),
                    annualRent: String(sd.annual_rent ?? ''),
                    utilsRate: String(sd.utils_pct ?? '10'),
                    depreciationAnnual: String(sd.depreciation_annual ?? ''),
                    maintenanceCapex: String(sd.maintenance_capex ?? ''),
                    workingCapitalDays: String(sd.wc_days ?? '15'),
                    revenueGrowth: String(sd.revenue_growth_pct ?? '5'),
                    discountRate: String(sd.discount_rate_pct ?? '10'),
                    terminalGrowth: String(sd.terminal_growth_pct ?? '2'),
                    horizonYears: String(sd.horizon_years ?? '7'),
                    taxRate: String(sd.tax_rate_pct ?? '25'),
                    debtOutstanding: String(sd.debt_outstanding ?? '0'),
                    ownershipPct: String(a.ownership_pct ?? 100),
                    openingYear: String(sd.opening_year ?? ''),
                    areaSqm: String(sd.area_sqm ?? ''),
                    staffCount: String(sd.staff_count ?? ''),
                    ticketMedium: String(sd.ticket_medium ?? ''),
                    coversDay: String(sd.covers_day ?? ''),
                }))
            }

            if (a.category === 'real_estate') {
                setRealEstate(prev => ({
                    ...prev,
                    regime: String(sd.regime ?? 'owned') as 'owned' | 'leased',
                    grossRent: String(sd.annual_rent_income ?? ''),
                    occupancyRate: String(sd.occupancy_pct ?? '95'),
                    maintenancePct: String(sd.maintenance_pct ?? '5'),
                    managementFeePct: String(sd.management_fee_pct ?? '8'),
                    ibiAnnual: String(sd.ibi_annual ?? ''),
                    insuranceAnnual: String(sd.insurance_annual ?? ''),
                    communityAnnual: String(sd.community_annual ?? ''),
                    otherOpex: String(sd.other_opex ?? ''),
                    capRate: String(Number(sd.cap_rate_pct ?? 4.5)),
                    rentalGrowth: String(sd.rental_growth_pct ?? '3'),
                    propertyAppreciation: String(sd.property_appreciation_pct ?? '3'),
                    discountRate: String(sd.discount_rate_pct ?? '7'),
                    horizonYears: String(sd.horizon_years ?? '10'),
                    debtOutstanding: String(sd.debt_outstanding ?? '0'),
                    sqm: String(sd.area_sqm ?? ''),
                    pricePerSqm: String(sd.price_per_sqm ?? ''),
                    floors: String(sd.floors ?? ''), bedrooms: String(sd.bedrooms ?? ''),
                    yearBuilt: String(sd.year_built ?? ''),
                    leaseRentPaid: String(sd.lease_rent_paid ?? ''),
                    leaseExpiry: String(sd.lease_expiry ?? ''),
                    leaseRenewable: String(sd.lease_renewable ?? 'si'),
                }))
            }
            setLoading(false)
        })
    }, [id, navigate])

    // ── Load latest valuation ────────────────────────────────
    useEffect(() => {
        if (!id) return
        supabase.from('patrimonio_valuation_snapshots').select('*').eq('asset_id', id).order('snapshot_date', { ascending: false }).limit(1).single().then(({ data }) => {
            if (data) setValResult({ low: data.value_low, base: data.value_base, high: data.value_high, confidence: data.confidence_score, method: 'dcf', drivers: data.drivers ?? [], explanation: data.explanation ?? '', assumptions: data.assumptions_metadata ?? {} })
        })
    }, [id])

    // ── Compute DCF ──────────────────────────────────────────
    const computeValuation = useCallback(() => {
        if (!asset) return

        if (asset.category === 'restaurant') {
            const r = restaurant
            const inputs: RestaurantDCFInputs = {
                revenue: n(r.revenue), cogsRate: p(r.cogsRate), staffCostRate: p(r.staffCostRate),
                rentAnnual: n(r.annualRent), utilsAndOtherRate: p(r.utilsRate),
                depreciationAnnual: n(r.depreciationAnnual) || undefined,
                maintenanceCapexAnnual: n(r.maintenanceCapex) || undefined,
                workingCapitalDays: n(r.workingCapitalDays),
                revenueGrowthRate: p(r.revenueGrowth), taxRate: p(r.taxRate),
                discountRate: p(r.discountRate), terminalGrowthRate: p(r.terminalGrowth),
                horizonYears: parseInt(r.horizonYears) || 7,
                debtOutstanding: n(r.debtOutstanding), ownershipPct: p(r.ownershipPct),
                regime: r.regime,
            }
            if (!inputs.revenue) return
            const result = runRestaurantDCF(inputs)
            setValResult(result)
        }

        if (asset.category === 'real_estate') {
            const r = realEstate
            const inputs: RealEstateInputs = {
                grossRentalIncome: n(r.grossRent), occupancyRate: p(r.occupancyRate),
                maintenancePct: p(r.maintenancePct), managementFeePct: p(r.managementFeePct),
                ibiAnnual: n(r.ibiAnnual), insuranceAnnual: n(r.insuranceAnnual),
                communityAnnual: n(r.communityAnnual), otherOpexAnnual: n(r.otherOpex),
                capRate: p(r.capRate), rentalGrowthRate: p(r.rentalGrowth),
                propertyAppreciationRate: p(r.propertyAppreciation),
                discountRate: p(r.discountRate), horizonYears: parseInt(r.horizonYears),
                debtOutstanding: n(r.debtOutstanding),
                sqm: n(r.sqm) || undefined, pricePerSqm: n(r.pricePerSqm) || undefined,
                regime: r.regime,
            }
            if (!inputs.grossRentalIncome) return
            setValResult(valuateRealEstate(inputs))
        }
    }, [asset, restaurant, realEstate])

    // ── Save ────────────────────────────────────────────────
    const handleSave = async () => {
        if (!asset || !id) return
        setSaving(true)

        // Build sector_data
        let sectorData: Record<string, unknown> = {}
        if (asset.category === 'restaurant') {
            const r = restaurant
            sectorData = {
                establishment: 'Mister Noodles', city: basic.city, address: basic.address,
                area_sqm: n(basic.areaSqm), regime: r.regime,
                annual_revenue: n(r.revenue), cogs_pct: n(r.cogsRate), staff_pct: n(r.staffCostRate),
                annual_rent: n(r.annualRent), utils_pct: n(r.utilsRate),
                depreciation_annual: n(r.depreciationAnnual), maintenance_capex: n(r.maintenanceCapex),
                wc_days: n(r.workingCapitalDays), revenue_growth_pct: n(r.revenueGrowth),
                discount_rate_pct: n(r.discountRate), terminal_growth_pct: n(r.terminalGrowth),
                horizon_years: parseInt(r.horizonYears), tax_rate_pct: n(r.taxRate),
                debt_outstanding: n(r.debtOutstanding), opening_year: r.openingYear,
                staff_count: n(r.staffCount), ticket_medium: n(r.ticketMedium),
                covers_day: n(r.coversDay),
            }
        }
        if (asset.category === 'real_estate') {
            const r = realEstate
            sectorData = {
                city: basic.city, address: basic.address, regime: r.regime,
                area_sqm: n(basic.areaSqm), annual_rent_income: n(r.grossRent),
                occupancy_pct: n(r.occupancyRate), maintenance_pct: n(r.maintenancePct),
                management_fee_pct: n(r.managementFeePct), ibi_annual: n(r.ibiAnnual),
                insurance_annual: n(r.insuranceAnnual), community_annual: n(r.communityAnnual),
                other_opex: n(r.otherOpex), cap_rate_pct: n(r.capRate),
                rental_growth_pct: n(r.rentalGrowth), property_appreciation_pct: n(r.propertyAppreciation),
                discount_rate_pct: n(r.discountRate), horizon_years: parseInt(r.horizonYears),
                debt_outstanding: n(r.debtOutstanding), price_per_sqm: n(r.pricePerSqm),
                floors: n(r.floors), bedrooms: n(r.bedrooms), year_built: n(r.yearBuilt),
                lease_rent_paid: n(r.leaseRentPaid), lease_expiry: r.leaseExpiry,
                lease_renewable: r.leaseRenewable,
            }
        }

        await updateAsset(id, {
            name: basic.name, country_operating: basic.country,
            ownership_pct: n(basic.ownershipPct),
            purchase_cost: n(basic.purchaseCost) || undefined,
            purchase_date: basic.purchaseDate || undefined,
            liquidity_level: basic.liquidityLevel,
            notes: basic.notes,
            sector_data: sectorData,
        })

        // Save valuation snapshot if result available
        if (valResult && user) {
            await supabase.from('patrimonio_valuation_snapshots').insert({
                user_id: user.id, asset_id: id,
                snapshot_date: new Date().toISOString().split('T')[0],
                value_low: Math.round(valResult.low), value_base: Math.round(valResult.base),
                value_high: Math.round(valResult.high),
                method_used: valResult.method,
                confidence_score: valResult.confidence,
                drivers: valResult.drivers,
                explanation: valResult.explanation,
                assumptions_metadata: valResult.assumptions ?? {},
            })
        }

        await fetchAssets()
        setSaving(false)
        navigate('/assets')
    }

    // ─────────────────────────────────────────────────────────
    if (loading) return <div className="loader"><div className="spinner" /></div>
    if (!asset) return <div>Activo no encontrado</div>

    const isRestaurant = asset.category === 'restaurant'
    const isRealEstate = asset.category === 'real_estate'

    const tabs = [
        { key: 'basic', label: '📋 Información General' },
        { key: 'financial', label: `${isRestaurant ? '🍜' : '🏢'} Datos Financieros` },
        { key: 'valuation', label: '📊 Valoración DCF' },
    ] as const

    const setR = (k: keyof RestaurantForm) => (v: string) => setRestaurant(prev => ({ ...prev, [k]: v }))
    const setRE = (k: keyof RealEstateForm) => (v: string) => setRealEstate(prev => ({ ...prev, [k]: v }))
    const setB = (k: keyof BasicForm) => (v: string) => setBasic(prev => ({ ...prev, [k]: v }))

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: '3rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <button onClick={() => navigate('/assets')} className="btn btn-ghost btn-sm" style={{ marginBottom: '0.5rem' }}>
                        <ArrowLeft size={14} /> Volver
                    </button>
                    <h2 style={{ marginBottom: 4 }}>{asset.name}</h2>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className={`badge badge-${asset.category === 'restaurant' ? 'gold' : 'muted'}`}>
                            {asset.category === 'restaurant' ? 'Restauración' : 'Inmobiliario'}
                        </span>
                        <span className="badge badge-muted">{asset.country_operating}</span>
                        {valResult && (
                            <span className="badge badge-gold">
                                DCF Base: {fmtEur(valResult.base)}
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={computeValuation} className="btn btn-ghost">
                        <RefreshCw size={15} /> Recalcular DCF
                    </button>
                    <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
                        <Save size={15} /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', padding: '0.25rem', background: 'var(--black-800)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-muted)' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            flex: 1, padding: '0.625rem 0.75rem', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                            background: activeTab === tab.key ? 'rgba(201,164,78,0.15)' : 'transparent',
                            color: activeTab === tab.key ? 'var(--text-gold)' : 'var(--text-muted)',
                            fontWeight: 600, fontSize: '0.8125rem',
                            boxShadow: activeTab === tab.key ? 'var(--shadow-gold)' : 'none',
                            transition: 'all var(--transition-fast)',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── TAB: BASIC ─────────────────────────────────────────── */}
            {activeTab === 'basic' && (
                <div>
                    <Section title="Identificación del Activo" icon={isRestaurant ? Utensils : Building2}>
                        <Field label="Nombre del activo" half>
                            <Input value={basic.name} onChange={setB('name')} type="text" placeholder="Nombre descriptivo" />
                        </Field>
                        <Field label="Ciudad / Localidad" half>
                            <Input value={basic.city} onChange={setB('city')} type="text" placeholder="Ej: Fuengirola" />
                        </Field>
                        <Field label="Dirección exacta" hint="Calle, número, planta. Útil para valoración por comparables.">
                            <Input value={basic.address} onChange={setB('address')} type="text" placeholder="Calle Mayor 15, 1ºA" />
                        </Field>
                        <Field label="País" half>
                            <select className="form-select" value={basic.country} onChange={e => setBasic(p => ({ ...p, country: e.target.value }))}>
                                {presets.map((p: Record<string, unknown>) => <option key={String(p.country_code)} value={String(p.country_code)}>{String(p.country_name)}</option>)}
                            </select>
                        </Field>
                        <Field label="Superficie" unit="m²" half hint="Superficie útil del local o vivienda.">
                            <Input value={basic.areaSqm} onChange={setB('areaSqm')} placeholder="120" />
                        </Field>
                    </Section>

                    <Section title="Propiedad y Adquisición" open>
                        <Field label="% Propiedad" unit="%" half hint="% que te pertenece del activo. 100% = propietario único.">
                            <Input value={basic.ownershipPct} onChange={setB('ownershipPct')} placeholder="100" min={1} max={100} />
                        </Field>
                        <Field label="Liquidez" half>
                            <select className="form-select" value={basic.liquidityLevel} onChange={e => setBasic(p => ({ ...p, liquidityLevel: e.target.value as 'high' | 'medium' | 'low' }))}>
                                <option value="high">Alta (días)</option>
                                <option value="medium">Media (semanas)</option>
                                <option value="low">Baja (meses/años)</option>
                            </select>
                        </Field>
                        <Field label="Precio de adquisición" unit="€" half hint="Coste real de compra, incluyendo impuestos y gastos de escritura.">
                            <Input value={basic.purchaseCost} onChange={setB('purchaseCost')} placeholder="450.000" />
                        </Field>
                        <Field label="Fecha de adquisición / apertura" half>
                            <Input value={basic.purchaseDate} onChange={setB('purchaseDate')} type="date" placeholder="" />
                        </Field>
                        <Field label="Notas adicionales">
                            <textarea className="form-textarea" rows={3} value={basic.notes} onChange={e => setBasic(p => ({ ...p, notes: e.target.value }))} placeholder="Observaciones, historia del activo, estado de contratos..." />
                        </Field>
                    </Section>
                </div>
            )}

            {/* ── TAB: FINANCIAL ──────────────────────────────────────── */}
            {activeTab === 'financial' && (
                <div>

                    {/* ── RESTAURANT ── */}
                    {isRestaurant && (
                        <>
                            <Section title="Régimen del Local" icon={Utensils}>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <p className="text-muted text-sm" style={{ marginBottom: '0.75rem' }}>
                                        Indica si el local donde opera el restaurante es propio o arrendado. Esto afecta directamente al EBITDA y a la valoración DCF.
                                    </p>
                                    <div className="mode-toggle" style={{ width: 'max-content' }}>
                                        {(['leased', 'owned'] as const).map(r => (
                                            <button key={r} className={`mode-toggle-option ${restaurant.regime === r ? 'active' : ''}`}
                                                onClick={() => setRestaurant(p => ({ ...p, regime: r }))}>
                                                {r === 'leased' ? '📋 Local Arrendado' : '🏠 Local Propio'}
                                            </button>
                                        ))}
                                    </div>
                                    {restaurant.regime === 'leased' && (
                                        <div className="alert alert-gold" style={{ marginTop: '0.75rem' }}>
                                            <Info size={14} />
                                            <span style={{ fontSize: '0.8125rem' }}>El local es arrendado. El alquiler se incluye como coste operativo. La valoración DCF refleja el valor del <strong>negocio</strong> (fondo de comercio + know-how), no el local.</span>
                                        </div>
                                    )}
                                </div>
                            </Section>

                            <Section title="Contexto Operativo" icon={Utensils} open={false}>
                                <Field label="Año de apertura" half><Input value={restaurant.openingYear} onChange={setR('openingYear')} placeholder="2015" /></Field>
                                <Field label="Superficie local" unit="m²" half><Input value={restaurant.areaSqm} onChange={setR('areaSqm')} placeholder="180" /></Field>
                                <Field label="Nº empleados" half><Input value={restaurant.staffCount} onChange={setR('staffCount')} placeholder="12" /></Field>
                                <Field label="Ticket medio" unit="€/persona" half hint="Precio medio por comensal."><Input value={restaurant.ticketMedium} onChange={setR('ticketMedium')} placeholder="18" /></Field>
                                <Field label="Cubiertos / día estimados" half><Input value={restaurant.coversDay} onChange={setR('coversDay')} placeholder="150" /></Field>
                            </Section>

                            <Section title="Cuenta de Resultados (año actual)" icon={TrendingUp}>
                                <Field label="Ventas anuales totales" unit="€/año" hint="Facturación bruta total del establecimiento, sin deducir ningún coste.">
                                    <Input value={restaurant.revenue} onChange={setR('revenue')} placeholder="520.000" />
                                </Field>
                                <Field label="COGS — Coste F&B" unit="%" half hint="Food & beverage cost como % de ventas. Típico hostelería: 25–35%.">
                                    <Input value={restaurant.cogsRate} onChange={setR('cogsRate')} placeholder="28" min={0} max={60} />
                                </Field>
                                <Field label="Coste de personal" unit="%" half hint="Salarios, SS, formación como % de ventas. Típico: 28–38%.">
                                    <Input value={restaurant.staffCostRate} onChange={setR('staffCostRate')} placeholder="32" min={0} max={60} />
                                </Field>
                                <Field label="Alquiler anual" unit="€/año" hint={restaurant.regime === 'leased' ? 'Renta contractual anual + IVA excluido. Incluye cuotas extras si las hay.' : 'Local propio: introduce 0 o coste de oportunidad.'}>
                                    <Input value={restaurant.annualRent} onChange={setR('annualRent')} placeholder="36.000" />
                                </Field>
                                <Field label="Utilities y otros gastos" unit="%" half hint="Suministros, seguros, marketing, limpieza, consumibles, gestoría, etc. como % de ventas. Típico: 8–15%.">
                                    <Input value={restaurant.utilsRate} onChange={setR('utilsRate')} placeholder="10" />
                                </Field>
                                <div style={{ gridColumn: 'span 2', background: 'rgba(201,164,78,0.06)', border: '1px solid var(--border-gold)', borderRadius: 8, padding: '1rem' }}>
                                    {restaurant.revenue && (
                                        (() => {
                                            const rev = n(restaurant.revenue)
                                            const cogs = rev * p(restaurant.cogsRate)
                                            const gp = rev - cogs
                                            const staff = rev * p(restaurant.staffCostRate)
                                            const rent = n(restaurant.annualRent)
                                            const utils = rev * p(restaurant.utilsRate)
                                            const ebitda = gp - staff - rent - utils
                                            const ebitdaMargin = (ebitda / rev * 100).toFixed(1)
                                            return (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                                                    {[
                                                        ['Ventas', fmtEur(rev), '#fff'],
                                                        ['Margen Bruto', `${fmtEur(gp)} (${(gp / rev * 100).toFixed(0)}%)`, '#4ade80'],
                                                        ['EBITDA', fmtEur(ebitda), ebitda > 0 ? 'var(--text-gold)' : '#f87171'],
                                                        ['EBITDA %', `${ebitdaMargin}%`, ebitda > 0 ? 'var(--text-gold)' : '#f87171'],
                                                    ].map(([label, value, color]) => (
                                                        <div key={String(label)} style={{ textAlign: 'center' }}>
                                                            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                                                            <div style={{ fontWeight: 700, color: String(color), fontSize: '0.9375rem' }}>{value}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        })()
                                    )}
                                    {!restaurant.revenue && <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Introduce las ventas para ver el P&L en tiempo real</span>}
                                </div>
                            </Section>

                            <Section title="Capex, Depreciación y Deuda" open={false}>
                                <Field label="D&A anual" unit="€/año" half hint="Depreciación de mobiliario, equipos de cocina, reformas. Si no lo tienes, déjalo en blanco (se estima automáticamente como 3% ventas).">
                                    <Input value={restaurant.depreciationAnnual} onChange={setR('depreciationAnnual')} placeholder="Automático (3% ventas)" />
                                </Field>
                                <Field label="CAPEX mantenimiento" unit="€/año" half hint="Inversión recurrente para mantener el negocio (reposición equipos, reformas menores). Típico: 2–5% ventas.">
                                    <Input value={restaurant.maintenanceCapex} onChange={setR('maintenanceCapex')} placeholder="Automático (2% ventas)" />
                                </Field>
                                <Field label="Días de capital circulante" unit="días" half hint="Plazo medio de pago de proveedores vs cobro de clientes. Restaurantes: 10–20 días.">
                                    <Input value={restaurant.workingCapitalDays} onChange={setR('workingCapitalDays')} placeholder="15" />
                                </Field>
                                <Field label="Deuda neta" unit="€" half hint="Deuda financiera total asociada al negocio (préstamos, leasing). Se resta del Enterprise Value.">
                                    <Input value={restaurant.debtOutstanding} onChange={setR('debtOutstanding')} placeholder="0" />
                                </Field>
                            </Section>
                        </>
                    )}

                    {/* ── REAL ESTATE ── */}
                    {isRealEstate && (
                        <>
                            <Section title="Régimen de Propiedad" icon={Building2}>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <p className="text-muted text-sm" style={{ marginBottom: '0.75rem' }}>
                                        ¿Es un activo propio o arrendado a un tercero que tú alquilas?
                                    </p>
                                    <div className="mode-toggle" style={{ width: 'max-content' }}>
                                        {(['owned', 'leased'] as const).map(r => (
                                            <button key={r} className={`mode-toggle-option ${realEstate.regime === r ? 'active' : ''}`}
                                                onClick={() => setRealEstate(p => ({ ...p, regime: r }))}>
                                                {r === 'owned' ? '🏠 Propiedad Propia' : '📋 Local Arrendado a Tercero'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </Section>

                            {realEstate.regime === 'leased' && (
                                <Section title="Condiciones del Arrendamiento" open>
                                    <Field label="Renta mensual pagada por inquilino" unit="€/mes" half>
                                        <Input value={realEstate.leaseRentPaid} onChange={setRE('leaseRentPaid')} placeholder="3.000" />
                                    </Field>
                                    <Field label="Vencimiento del contrato" half>
                                        <Input value={realEstate.leaseExpiry} onChange={setRE('leaseExpiry')} type="date" placeholder="" />
                                    </Field>
                                    <Field label="¿Renovable?" half>
                                        <select className="form-select" value={realEstate.leaseRenewable} onChange={e => setRealEstate(p => ({ ...p, leaseRenewable: e.target.value }))}>
                                            <option value="si">Sí, con preaviso</option>
                                            <option value="no">No renovable</option>
                                            <option value="tacita">Tácita reconducción</option>
                                        </select>
                                    </Field>
                                </Section>
                            )}

                            <Section title="Descripción del Inmueble" open={false}>
                                <Field label="Superficie útil" unit="m²" half hint="m² útiles certificados."><Input value={realEstate.sqm} onChange={setRE('sqm')} placeholder="95" /></Field>
                                <Field label="Número de plantas" half><Input value={realEstate.floors} onChange={setRE('floors')} placeholder="1" /></Field>
                                <Field label="Habitaciones" half><Input value={realEstate.bedrooms} onChange={setRE('bedrooms')} placeholder="0" /></Field>
                                <Field label="Año de construcción" half><Input value={realEstate.yearBuilt} onChange={setRE('yearBuilt')} placeholder="2000" /></Field>
                                <Field label="Precio comparables" unit="€/m²" half hint="Precio por m² de inmuebles comparables en la zona. Ayuda a cross-check la valoración."><Input value={realEstate.pricePerSqm} onChange={setRE('pricePerSqm')} placeholder="3.500" /></Field>
                            </Section>

                            <Section title="Ingresos por Alquiler" icon={TrendingUp}>
                                <Field label="Renta bruta anual" unit="€/año" hint="Suma de todas las rentas brutas cobradas al año (o esperadas si vacío).">
                                    <Input value={realEstate.grossRent} onChange={setRE('grossRent')} placeholder="24.000" />
                                </Field>
                                <Field label="Tasa de ocupación" unit="%" half hint="% de tiempo que el inmueble genera rentas. Vacíos = 0%, plena ocupación = 100%.">
                                    <Input value={realEstate.occupancyRate} onChange={setRE('occupancyRate')} placeholder="95" min={0} max={100} />
                                </Field>
                                <Field label="Crecimiento anual de renta" unit="%" half hint="Tasa esperada de crecimiento del alquiler anual. Ligado a IPC típicamente (1–3%).">
                                    <Input value={realEstate.rentalGrowth} onChange={setRE('rentalGrowth')} placeholder="3" />
                                </Field>
                            </Section>

                            <Section title="Gastos Operativos del Inmueble" open>
                                <Field label="IBI — Impuesto sobre Bienes Inmuebles" unit="€/año" half hint="Recibo anual del IBI. Consulta el recibo en el ayuntamiento.">
                                    <Input value={realEstate.ibiAnnual} onChange={setRE('ibiAnnual')} placeholder="1.200" />
                                </Field>
                                <Field label="Seguro de edificio" unit="€/año" half hint="Seguro multirriesgo del inmueble.">
                                    <Input value={realEstate.insuranceAnnual} onChange={setRE('insuranceAnnual')} placeholder="600" />
                                </Field>
                                <Field label="Comunidad de propietarios" unit="€/año" half hint="Gastos de comunidad anuales (si aplica).">
                                    <Input value={realEstate.communityAnnual} onChange={setRE('communityAnnual')} placeholder="900" />
                                </Field>
                                <Field label="Gastos de gestión / agencia" unit="%" half hint="Comisión de agencia inmobiliaria o gestora por administración. Típico: 6–10% de la renta bruta.">
                                    <Input value={realEstate.managementFeePct} onChange={setRE('managementFeePct')} placeholder="8" />
                                </Field>
                                <Field label="Mantenimiento y reparaciones" unit="%" half hint="Presupuesto anual de mantenimiento ordinario como % de la renta bruta. Típico: 3–8%.">
                                    <Input value={realEstate.maintenancePct} onChange={setRE('maintenancePct')} placeholder="5" />
                                </Field>
                                <Field label="Otros gastos anuales" unit="€/año" half hint="Cualquier gasto recurrente no incluido arriba (alarma, limpieza, licencias...).">
                                    <Input value={realEstate.otherOpex} onChange={setRE('otherOpex')} placeholder="0" />
                                </Field>
                                {/* Live NOI preview */}
                                {realEstate.grossRent && (
                                    <div style={{ gridColumn: 'span 2', background: 'rgba(201,164,78,0.06)', border: '1px solid var(--border-gold)', borderRadius: 8, padding: '1rem' }}>
                                        {(() => {
                                            const gr = n(realEstate.grossRent)
                                            const occ = p(realEstate.occupancyRate)
                                            const effectiveRent = gr * occ
                                            const mgmt = effectiveRent * p(realEstate.managementFeePct)
                                            const maint = effectiveRent * p(realEstate.maintenancePct)
                                            const ibi = n(realEstate.ibiAnnual)
                                            const ins = n(realEstate.insuranceAnnual)
                                            const com = n(realEstate.communityAnnual)
                                            const oth = n(realEstate.otherOpex)
                                            const totalOpex = mgmt + maint + ibi + ins + com + oth
                                            const noi = effectiveRent - totalOpex
                                            const capR = p(realEstate.capRate)
                                            const byCapRate = noi / capR
                                            const yieldNet = noi / byCapRate * 100
                                            return (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                                                    {[
                                                        ['Renta efectiva', fmtEur(effectiveRent), '#fff'],
                                                        ['Gastos totales', fmtEur(totalOpex), '#f87171'],
                                                        ['NOI', fmtEur(noi), 'var(--text-gold)'],
                                                        ['Valor Cap Rate', fmtEur(byCapRate), '#4ade80'],
                                                    ].map(([l, v, c]) => (
                                                        <div key={String(l)} style={{ textAlign: 'center' }}>
                                                            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>{l}</div>
                                                            <div style={{ fontWeight: 700, color: String(c), fontSize: '0.9375rem' }}>{v}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )}
                            </Section>
                        </>
                    )}
                </div>
            )}

            {/* ── TAB: VALUATION ──────────────────────────────────────── */}
            {activeTab === 'valuation' && (
                <div>
                    {/* DCF Assumptions */}
                    <Section title="Supuestos del Modelo DCF" icon={TrendingUp}>
                        <Field label="Tasa de descuento (WACC/ke)" unit="%" half hint="Tasa de descuento = Rf + ERP + CRP + prima de riesgo empresa. Restaurantes moderados: 9–12%. Inmobiliario prime: 6–8%.">
                            <Input value={isRestaurant ? restaurant.discountRate : realEstate.discountRate}
                                onChange={isRestaurant ? setR('discountRate') : setRE('discountRate')} placeholder="10" />
                        </Field>
                        <Field label="Tasa de crecimiento terminal" unit="%" half hint="Tasa de crecimiento perpetuo. No debe superar el crecimiento del PIB nominal. Típico: 1.5–2.5%.">
                            <Input value={isRestaurant ? restaurant.terminalGrowth : '2'}
                                onChange={isRestaurant ? setR('terminalGrowth') : () => { }} placeholder="2" />
                        </Field>
                        <Field label="Horizonte de proyección" unit="años" half hint="Años de análisis DCF explícito antes del valor terminal. Típico: 5–10 años.">
                            <Input value={isRestaurant ? restaurant.horizonYears : realEstate.horizonYears}
                                onChange={isRestaurant ? setR('horizonYears') : setRE('horizonYears')} placeholder="7" />
                        </Field>
                        <Field label="Tipo impositivo efectivo" unit="%" half hint="Tipo efectivo IS aplicable. Generalista España: 25%. PYME: 23%. Incluir efecto diferidos si aplica.">
                            <Input value={isRestaurant ? restaurant.taxRate : '25'}
                                onChange={isRestaurant ? setR('taxRate') : () => { }} placeholder="25" />
                        </Field>
                        {isRealEstate && (
                            <>
                                <Field label="Cap Rate de mercado" unit="%" half hint="Tasa de capitalización de inmuebles comparables en la zona. PB prime: 3–4%. Fuengirola: 4–6%.">
                                    <Input value={realEstate.capRate} onChange={setRE('capRate')} placeholder="4.5" />
                                </Field>
                                <Field label="Apreciación anual del inmueble" unit="%" half hint="Ritmo de revalorización del subyacente inmobiliario. Histórico España: 2–4%/año.">
                                    <Input value={realEstate.propertyAppreciation} onChange={setRE('propertyAppreciation')} placeholder="3" />
                                </Field>
                            </>
                        )}
                        {isRestaurant && (
                            <>
                                <Field label="Crecimiento de ventas" unit="%" half hint="Tasa de crecimiento anual de las ventas en el horizonte de proyección.">
                                    <Input value={restaurant.revenueGrowth} onChange={setR('revenueGrowth')} placeholder="5" />
                                </Field>
                                <Field label="% Propiedad (para equity)" unit="%" half hint="Porcentaje de propiedad que te aplica. 100% = propietario único del negocio.">
                                    <Input value={restaurant.ownershipPct} onChange={setR('ownershipPct')} placeholder="100" />
                                </Field>
                            </>
                        )}
                    </Section>

                    {/* Compute button */}
                    <div style={{ marginBottom: '1rem' }}>
                        <button onClick={computeValuation} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                            <Calculator size={16} /> Ejecutar Modelo DCF
                        </button>
                    </div>

                    {/* Results */}
                    {valResult && (
                        <ValuationCard
                            result={valResult}
                            plTable={(valResult as ValuationResult & { plTable?: PlYear[] }).plTable}
                        />
                    )}

                    {!valResult && (
                        <div className="alert alert-gold">
                            <Info size={14} />
                            <span style={{ fontSize: '0.8125rem' }}>Completa los datos financieros en la pestaña anterior y ejecuta el modelo DCF.</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
