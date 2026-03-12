import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Building2, Utensils, Home, Store,
    ChevronDown, ChevronRight, TrendingUp, TrendingDown,
    MapPin, Maximize2, ArrowUpRight, PlusCircle, BarChart3, Pencil, BarChart2, Watch, Car
} from 'lucide-react'
import { useAssets } from '../hooks/useAssets'
import { useAuth } from '../contexts/AuthContext'
import type { Asset } from '../types'

function fmt(n: number, currency = 'EUR') {
    if (!n) return '—'
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${currency}`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ${currency}`
    return `${Math.round(n).toLocaleString('es-ES')} ${currency}`
}

function fmtK(n: number) {
    if (!n) return '—'
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
    return String(Math.round(n))
}

function ConfidenceDot({ level }: { level: string }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: level === 'high' ? '#22c55e' : level === 'medium' ? '#f59e0b' : '#ef4444',
                boxShadow: `0 0 6px ${level === 'high' ? 'rgba(34,197,94,0.5)' : level === 'medium' ? 'rgba(245,158,11,0.5)' : 'rgba(239,68,68,0.5)'}`,
                display: 'inline-block',
            }} />
            <span style={{
                fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: level === 'high' ? '#4ade80' : level === 'medium' ? '#fbbf24' : '#f87171'
            }}>
                {level === 'high' ? 'Alta' : level === 'medium' ? 'Media' : 'Baja'}
            </span>
        </span>
    )
}

function AssetRow({ asset, currency }: { asset: Asset; currency: string }) {
    const navigate = useNavigate()
    const v = asset.latest_valuation
    const sd = asset.sector_data as Record<string, unknown> | undefined
    const debt = asset.total_debt ?? 0
    const equity = Math.max((v?.value_base ?? 0) - debt, 0)
    const revenue = Number(sd?.annual_revenue ?? sd?.annual_rent_income ?? 0)
    const ebitda = Number(
        sd?.ebitda ??
        (sd?.ebitda_pct ? Number(sd.annual_revenue) * Number(sd.ebitda_pct) / 100 : null) ??
        (v?.assumptions_metadata as Record<string, unknown>)?.ebitda ??
        (v?.assumptions_metadata as Record<string, unknown>)?.noi ??
        0
    )

    return (
        <div
            onClick={() => navigate(`/assets/${asset.id}/model`)}
            style={{
                display: 'grid',
                gridTemplateColumns: '2.5fr 1.2fr 0.9fr 0.9fr 0.9fr 0.7fr auto auto',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.875rem 1.25rem',
                borderBottom: '1px solid var(--border-muted)',
                cursor: 'pointer',
                transition: 'background var(--transition-fast)',
            }}
            className="asset-table-row"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,164,78,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
            {/* Name + location */}
            <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                    {asset.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <MapPin size={11} />
                    {String(sd?.city ?? asset.country_operating)}
                    {sd?.area_sqm ? <span style={{ marginLeft: 4 }}>· {String(sd.area_sqm)} m²</span> : null}
                </div>
            </div>

            {/* Value range */}
            <div>
                {v ? (
                    <>
                        <div style={{
                            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9375rem',
                            background: 'linear-gradient(135deg,var(--gold-400),var(--gold-600))',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
                        }}>
                            {fmt(v.value_base, currency)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {fmt(v.value_low ?? 0, '')} — {fmt(v.value_high ?? 0, '')}
                        </div>
                    </>
                ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Sin valorar</span>}
            </div>

            {/* Revenue */}
            <div style={{ fontSize: '0.8125rem' }}>
                {revenue > 0 ? (
                    <div>
                        <div style={{ fontWeight: 600, color: '#4ade80' }}>{fmtK(revenue)} €</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ingresos/año</div>
                    </div>
                ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </div>

            {/* EBITDA / NOI */}
            <div style={{ fontSize: '0.8125rem' }}>
                {ebitda > 0 ? (
                    <div>
                        <div style={{ fontWeight: 600, color: 'var(--gold-400)' }}>{fmtK(ebitda)} €</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>EBITDA/NOI</div>
                    </div>
                ) : v?.assumptions_metadata ? (
                    <div>
                        <div style={{ fontWeight: 600, color: 'var(--gold-400)' }}>
                            {fmtK(Number((v.assumptions_metadata as Record<string, unknown>)?.noi ?? 0))} €
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>NOI/año</div>
                    </div>
                ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </div>

            {/* Equity */}
            <div style={{ fontSize: '0.8125rem' }}>
                {equity > 0 ? (
                    <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmtK(equity)} €</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>patrimonio neto</div>
                    </div>
                ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </div>

            {/* Confidence */}
            <div>
                {v?.confidence_score ? <ConfidenceDot level={v.confidence_score} /> : '—'}
            </div>

            <button
                onClick={e => { e.stopPropagation(); navigate(`/assets/${asset.id}`) }}
                title="Editar activo"
                style={{ background: 'none', border: '1px solid var(--border-muted)', borderRadius: 6, cursor: 'pointer', padding: '0.3rem 0.5rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-gold)', e.currentTarget.style.borderColor = 'var(--border-gold)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)', e.currentTarget.style.borderColor = 'var(--border-muted)')}
            >
                <Pencil size={12} /> Editar
            </button>
            <button
                onClick={e => { e.stopPropagation(); navigate(`/assets/${asset.id}/model`) }}
                title="Abrir modelo DCF profesional"
                style={{ background: 'rgba(201,164,78,0.1)', border: '1px solid var(--border-gold)', borderRadius: 6, cursor: 'pointer', padding: '0.3rem 0.6rem', color: 'var(--text-gold)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,164,78,0.22)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(201,164,78,0.1)')}
            >
                <BarChart2 size={12} /> Modelo DCF
            </button>
        </div>
    )
}

function CategorySection({
    title, icon: Icon, color, assets, currency, defaultOpen = true, summary
}: {
    title: string
    icon: React.ElementType
    color: string
    assets: Asset[]
    currency: string
    defaultOpen?: boolean
    summary?: string
}) {
    const [open, setOpen] = useState(defaultOpen)
    const totalValue = assets.reduce((s, a) => s + (a.latest_valuation?.value_base ?? 0), 0)
    const totalDebt = assets.reduce((s, a) => s + (a.total_debt ?? 0), 0)
    const netValue = totalValue - totalDebt

    return (
        <div style={{ background: 'var(--black-800)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {/* Section header */}
            <button
                onClick={() => setOpen(!open)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1.25rem 1.5rem', background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: open ? '1px solid var(--border-subtle)' : 'none',
                    transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,164,78,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={20} style={{ color }} />
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text-primary)' }}>
                        {title}
                    </div>
                    {summary && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{summary}</div>}
                </div>

                {/* Totals */}
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            Valor total
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-gold)' }}>
                            {fmt(totalValue, currency)}
                        </div>
                    </div>
                    {totalDebt > 0 && (
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                Patrimonio neto
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.125rem', color: '#4ade80' }}>
                                {fmt(netValue, currency)}
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--black-700)', padding: '3px 10px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-muted)' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {assets.length} activos
                        </span>
                    </div>
                    {open ? <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        : <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                </div>
            </button>

            {/* Table */}
            {open && (
                <div>
                    {/* Table header */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '2.5fr 1.2fr 0.9fr 0.9fr 0.9fr 0.7fr auto auto',
                        gap: '1rem',
                        padding: '0.625rem 1.25rem',
                        background: 'var(--black-850)',
                    }}>
                        {['Activo', 'Valoración DCF', 'Ingresos/año', 'EBITDA/NOI', 'Patrimonio neto', 'Confianza', '', ''].map((h, i) => (
                            <div key={i} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                {h}
                            </div>
                        ))}
                    </div>
                    {assets.map(a => <AssetRow key={a.id} asset={a} currency={currency} />)}

                    {/* Section subtotal */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2rem',
                        padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border-subtle)',
                        background: 'var(--black-850)',
                    }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            TOTAL SECCIÓN
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-gold)' }}>
                            {fmt(totalValue, currency)}
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: '#4ade80' }}>
                            {fmt(netValue, currency)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>neto</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// Subcategory grouper for real estate
function RealEstateSection({ assets, currency }: { assets: Asset[]; currency: string }) {
    const [open, setOpen] = useState(true)
    const totalValue = assets.reduce((s, a) => s + (a.latest_valuation?.value_base ?? 0), 0)
    const netValue = totalValue // no general debt in this demo

    const groups: Record<string, { label: string; icon: React.ElementType; assets: Asset[] }> = {
        local: { label: 'Locales Comerciales', icon: Store, assets: [] },
        piso: { label: 'Pisos Residenciales', icon: Building2, assets: [] },
        casa: { label: 'Viviendas Unifamiliares', icon: Home, assets: [] },
    }

    assets.forEach(a => {
        const sd = a.sector_data as Record<string, unknown> | undefined
        const type = String(sd?.type ?? '').toLowerCase()
        if (type.includes('local') || type.includes('comercial') || type.includes('restauración')) {
            groups.local.assets.push(a)
        } else if (type.includes('piso')) {
            groups.piso.assets.push(a)
        } else {
            groups.casa.assets.push(a)
        }
    })

    return (
        <div style={{ background: 'var(--black-800)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {/* Section header */}
            <button
                onClick={() => setOpen(!open)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1.25rem 1.5rem', background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: open ? '1px solid var(--border-subtle)' : 'none',
                    transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,164,78,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'rgba(201,164,78,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={20} style={{ color: 'var(--gold-500)' }} />
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text-primary)' }}>
                        Activos Inmobiliarios
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        7 locales comerciales · 2 viviendas unifamiliares · 2 pisos — {assets.length} activos total
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Valor total</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-gold)' }}>{fmt(totalValue, currency)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--black-700)', padding: '3px 10px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-muted)' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{assets.length} activos</span>
                    </div>
                    {open ? <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        : <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                </div>
            </button>

            {open && (
                <div>
                    {Object.entries(groups).filter(([, g]) => g.assets.length > 0).map(([key, g]) => {
                        const GroupIcon = g.icon
                        const groupValue = g.assets.reduce((s, a) => s + (a.latest_valuation?.value_base ?? 0), 0)
                        return (
                            <div key={key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                {/* Sub-group header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.75rem 1.25rem',
                                    background: 'var(--black-850)',
                                }}>
                                    <GroupIcon size={14} style={{ color: 'var(--text-gold)' }} />
                                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-secondary)', flex: 1 }}>{g.label}</span>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-gold)' }}>{fmt(groupValue, currency)}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{g.assets.length} activos</span>
                                </div>
                                {/* Table header */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2.5fr 1.2fr 0.9fr 0.9fr 0.9fr 0.7fr auto auto',
                                    gap: '1rem',
                                    padding: '0.5rem 1.25rem',
                                    background: 'var(--black-900)',
                                }}>
                                    {['Activo', 'Valoración', 'Ingresos/año', 'NOI', 'Patrimonio neto', 'Confianza', '', ''].map((h, i) => (
                                        <div key={i} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</div>
                                    ))}
                                </div>
                                {g.assets.map(a => <AssetRow key={a.id} asset={a} currency={currency} />)}
                            </div>
                        )
                    })}

                    {/* Total */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2rem',
                        padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border-subtle)',
                        background: 'var(--black-850)',
                    }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL INMOBILIARIO</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-gold)' }}>{fmt(totalValue, currency)}</div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function AssetsPage() {
    const navigate = useNavigate()
    const { assets, loading, totalValue, totalDebt, netWorth } = useAssets()
    const { profile } = useAuth()
    const currency = profile?.base_currency ?? 'EUR'

    const restaurants = assets.filter(a => a.category === 'restaurant')
    const realEstate = assets.filter(a => a.category === 'real_estate')
    const watches = assets.filter(a => a.category === 'watch')
    const vehicles = assets.filter(a => a.category === 'car')

    const restaurantValue = restaurants.reduce((s, a) => s + (a.latest_valuation?.value_base ?? 0), 0)
    const realEstateValue = realEstate.reduce((s, a) => s + (a.latest_valuation?.value_base ?? 0), 0)
    const watchValue = watches.reduce((s, a) => s + (a.latest_valuation?.value_base ?? 0), 0)
    const vehicleValue = vehicles.reduce((s, a) => s + (a.latest_valuation?.value_base ?? 0), 0)
    const totalRestaurantRevenue = restaurants.reduce((s, a) => s + Number((a.sector_data as Record<string, unknown>)?.annual_revenue ?? 0), 0)

    if (loading) return <div className="loader"><div className="spinner" /></div>

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>

            {/* Portfolio Summary Banner */}
            <div className="net-worth-banner animate-slide-up">
                <div className="net-worth-main">
                    <div className="net-worth-label">📊 Valor Total del Portfolio</div>
                    <div className="net-worth-value">{fmt(totalValue, currency)}</div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="badge badge-gold">Restauración: {fmt(restaurantValue, currency)}</span>
                        <span className="badge badge-muted">Inmobiliario: {fmt(realEstateValue, currency)}</span>
                        {watchValue > 0 && <span className="badge badge-muted">⌚ Joyas & Relojes: {fmt(watchValue, currency)}</span>}
                        {vehicleValue > 0 && <span className="badge badge-muted">🚗 Vehículos: {fmt(vehicleValue, currency)}</span>}
                    </div>
                </div>
                <div className="net-worth-breakdown">
                    <div className="net-worth-item">
                        <div className="net-worth-item-label">Restaurantes</div>
                        <div className="net-worth-item-value">{restaurants.length} locales</div>
                    </div>
                    <div style={{ width: 1, height: 40, background: 'var(--border-subtle)' }} />
                    <div className="net-worth-item">
                        <div className="net-worth-item-label">Ingresos Hostelería</div>
                        <div className="net-worth-item-value" style={{ color: '#4ade80' }}>{fmt(totalRestaurantRevenue, currency)}/año</div>
                    </div>
                    <div style={{ width: 1, height: 40, background: 'var(--border-subtle)' }} />
                    <div className="net-worth-item">
                        <div className="net-worth-item-label">Inmuebles</div>
                        <div className="net-worth-item-value">{realEstate.length} activos</div>
                    </div>
                    <div style={{ width: 1, height: 40, background: 'var(--border-subtle)' }} />
                    <div className="net-worth-item">
                        <div className="net-worth-item-label">Total Activos</div>
                        <div className="net-worth-item-value">{assets.length}</div>
                    </div>
                </div>
            </div>

            {/* Action bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projections')}>
                    <BarChart3 size={15} /> Ver Proyecciones
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/assets/new')}>
                    <PlusCircle size={15} /> Añadir Activo
                </button>
            </div>

            {/* ── SECTION 1: RESTAURACIÓN ── */}
            {restaurants.length > 0 && (
                <CategorySection
                    title="Restauración — Mister Noodles"
                    icon={Utensils}
                    color="#C0392B"
                    assets={restaurants}
                    currency={currency}
                    summary={`${restaurants.length} establecimientos · Facturación total: ${fmt(totalRestaurantRevenue, currency)}/año`}
                    defaultOpen={true}
                />
            )}

            {/* ── SECTION 2: INMOBILIARIO ── */}
            {realEstate.length > 0 && (
                <RealEstateSection assets={realEstate} currency={currency} />
            )}

            {/* ── SECTION 3: JOYAS & RELOJES ── */}
            {watches.length > 0 && (
                <CategorySection
                    title="⌚ Joyas & Relojes de Lujo"
                    icon={Watch}
                    color="#c084fc"
                    assets={watches}
                    currency={currency}
                    summary={`${watches.length} piezas · Valor total: ${fmt(watchValue, currency)}`}
                    defaultOpen={true}
                />
            )}

            {/* ── SECTION 4: VEHÍCULOS ── */}
            {vehicles.length > 0 && (
                <CategorySection
                    title="🚗 Vehículos"
                    icon={Car}
                    color="#38bdf8"
                    assets={vehicles}
                    currency={currency}
                    summary={`${vehicles.length} vehículos · Valor: ${fmt(vehicleValue, currency)}`}
                    defaultOpen={true}
                />
            )}

            {assets.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state-icon"><Building2 size={28} /></div>
                    <div className="empty-state-title">Sin activos registrados</div>
                    <button className="btn btn-primary" onClick={() => navigate('/assets/new')}>+ Añadir activo</button>
                </div>
            )}
        </div>
    )
}
