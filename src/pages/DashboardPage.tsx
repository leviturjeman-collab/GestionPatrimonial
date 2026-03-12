import React from 'react'
import {
    AreaChart, Area, PieChart, Pie, Cell,
    ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid
} from 'recharts'
import {
    Building2, Utensils, Watch, Car, Package,
    TrendingUp, TrendingDown, AlertCircle, ArrowUpRight
} from 'lucide-react'
import { useAssets } from '../hooks/useAssets'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import type { Asset } from '../types'

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; className: string }> = {
    real_estate: { label: 'Inmobiliario', icon: Building2, color: '#C9A44E', className: 'real-estate' },
    restaurant: { label: 'Restaurantes', icon: Utensils, color: '#C0392B', className: 'restaurant' },
    watch: { label: 'Relojes', icon: Watch, color: '#8B5CF6', className: 'watch' },
    car: { label: 'Coches', icon: Car, color: '#3B82F6', className: 'car' },
    other: { label: 'Otros', icon: Package, color: '#22C55E', className: 'other' },
}

function fmt(n: number, currency = 'EUR') {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${currency}`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ${currency}`
    return `${n.toLocaleString('es-ES')} ${currency}`
}

export default function DashboardPage() {
    const { assets, loading, totalValue, totalDebt, netWorth } = useAssets()
    const { profile } = useAuth()
    const navigate = useNavigate()
    const currency = profile?.base_currency ?? 'EUR'

    if (loading) return (
        <div className="loader animate-fade-in">
            <div className="spinner" />
        </div>
    )

    // Distribution by category
    const categoryData = Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
        const categoryAssets = assets.filter(a => a.category === key)
        const value = categoryAssets.reduce((s, a) => s + (a.latest_valuation?.value_base ?? 0), 0)
        return { name: cfg.label, value, color: cfg.color, count: categoryAssets.length }
    }).filter(d => d.value > 0)

    // Top 5
    const top5 = [...assets]
        .sort((a, b) => (b.latest_valuation?.value_base ?? 0) - (a.latest_valuation?.value_base ?? 0))
        .slice(0, 5)

    // Projection data (simple linear)
    const projectionData = [0, 1, 2, 3, 4, 5].map(y => ({
        year: `${new Date().getFullYear() + y}`,
        conservative: netWorth * Math.pow(1.04, y),
        base: netWorth * Math.pow(1.08, y),
        optimistic: netWorth * Math.pow(1.14, y),
    }))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>

            {/* Net Worth Banner */}
            <div className="net-worth-banner animate-slide-up">
                <div className="net-worth-main">
                    <div className="net-worth-label">📊 Patrimonio Neto Total</div>
                    <div className="net-worth-value">
                        {fmt(netWorth, currency)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <span className="badge badge-gold">
                            {assets.filter(a => a.status === 'active').length} activos
                        </span>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                            Última actualización: hoy
                        </span>
                    </div>
                </div>
                <div className="net-worth-breakdown">
                    <div className="net-worth-item">
                        <span className="net-worth-item-label">Activos Totales</span>
                        <span className="net-worth-item-value" style={{ color: '#4ade80' }}>{fmt(totalValue, currency)}</span>
                    </div>
                    <div style={{ width: 1, height: 40, background: 'var(--border-subtle)' }} />
                    <div className="net-worth-item">
                        <span className="net-worth-item-label">Deuda Total</span>
                        <span className="net-worth-item-value debt">{fmt(totalDebt, currency)}</span>
                    </div>
                    <div style={{ width: 1, height: 40, background: 'var(--border-subtle)' }} />
                    <div className="net-worth-item">
                        <span className="net-worth-item-label">Activos</span>
                        <span className="net-worth-item-value">{assets.length}</span>
                    </div>
                </div>
            </div>

            {/* Quick Stats Row */}
            {assets.length === 0 ? (
                <div className="card empty-state animate-slide-up">
                    <div className="empty-state-icon">
                        <TrendingUp size={28} />
                    </div>
                    <div className="empty-state-title">Tu patrimonio está vacío</div>
                    <div className="empty-state-text">
                        Añade tu primer activo para comenzar a gestionar y valorar tu patrimonio.
                    </div>
                    <button className="btn btn-primary" onClick={() => navigate('/assets/new')}>
                        + Añadir primer activo
                    </button>
                </div>
            ) : (
                <>
                    {/* Charts Row */}
                    <div className="grid-2" style={{ gap: '1.25rem' }}>
                        {/* Distribution Pie */}
                        <div className="chart-container animate-slide-up">
                            <div className="chart-header">
                                <h4 className="chart-title">Distribución por Sector</h4>
                            </div>
                            {categoryData.length > 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                                    <ResponsiveContainer width={180} height={180}>
                                        <PieChart>
                                            <Pie
                                                data={categoryData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={55}
                                                outerRadius={80}
                                                paddingAngle={3}
                                                dataKey="value"
                                            >
                                                {categoryData.map((entry) => (
                                                    <Cell key={entry.name} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ background: 'var(--black-800)', border: '1px solid var(--border-gold)', borderRadius: 8, fontSize: 12 }}
                                                formatter={(v: number) => [fmt(v, currency), '']}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', flex: 1 }}>
                                        {categoryData.map(d => (
                                            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', flex: 1 }}>{d.name}</span>
                                                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(0) : 0}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Sin valoraciones</div>
                            )}
                        </div>

                        {/* Growth Projection */}
                        <div className="chart-container animate-slide-up">
                            <div className="chart-header">
                                <h4 className="chart-title">Proyección 5 años</h4>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => navigate('/projections')}
                                >
                                    Ver detalle <ArrowUpRight size={13} />
                                </button>
                            </div>
                            <ResponsiveContainer width="100%" height={180}>
                                <AreaChart data={projectionData}>
                                    <defs>
                                        <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#C9A44E" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#C9A44E" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                    <XAxis dataKey="year" tick={{ fill: 'var(--black-200)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis hide />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--black-800)', border: '1px solid var(--border-gold)', borderRadius: 8, fontSize: 12 }}
                                        formatter={(v: number) => [fmt(v, currency), '']}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="optimistic"
                                        stroke="rgba(201,164,78,0.3)"
                                        fill="transparent"
                                        strokeDasharray="3 3"
                                        dot={false}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="base"
                                        stroke="#C9A44E"
                                        fill="url(#baseGrad)"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="conservative"
                                        stroke="rgba(201,164,78,0.3)"
                                        fill="transparent"
                                        strokeDasharray="3 3"
                                        dot={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Top 5 Assets */}
                    <div className="card animate-slide-up">
                        <div className="section-header" style={{ marginBottom: '1rem' }}>
                            <h4 className="chart-title">Top 5 Activos por Valor</h4>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/assets')}>
                                Ver todos <ArrowUpRight size={13} />
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {top5.map((asset, idx) => {
                                const cfg = CATEGORY_CONFIG[asset.category]
                                const value = asset.latest_valuation?.value_base ?? 0
                                const maxVal = top5[0].latest_valuation?.value_base ?? 1
                                const Icon = cfg.icon
                                return (
                                    <div
                                        key={asset.id}
                                        onClick={() => navigate(`/assets/${asset.id}`)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '1rem',
                                            padding: '0.75rem', borderRadius: 'var(--radius-md)',
                                            background: 'var(--black-800)', cursor: 'pointer',
                                            transition: 'all var(--transition-fast)',
                                            border: '1px solid var(--border-muted)',
                                        }}
                                        className="card"
                                    >
                                        <span style={{
                                            width: 24, height: 24, borderRadius: '50%',
                                            background: 'var(--black-700)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-gold)',
                                            flexShrink: 0,
                                        }}>
                                            {idx + 1}
                                        </span>
                                        <div className={`cat-icon ${cfg.className}`}>
                                            <Icon size={18} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                                                {asset.name}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span className="chip">{asset.country_operating}</span>
                                                <span className={`badge badge-${asset.liquidity_level}`}>{asset.liquidity_level}</span>
                                                {asset.latest_valuation && (
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                        Confianza: {asset.latest_valuation.confidence_score}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                                                {fmt(value, currency)}
                                            </div>
                                            {asset.total_debt ? (
                                                <div style={{ fontSize: '0.75rem', color: '#f87171' }}>
                                                    -{fmt(asset.total_debt ?? 0, currency)} deuda
                                                </div>
                                            ) : null}
                                        </div>
                                        <div style={{ width: 80 }}>
                                            <div className="progress-bar">
                                                <div className="progress-bar-fill" style={{ width: `${(value / maxVal) * 100}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Category Stats */}
                    <div className="grid-4 animate-slide-up">
                        {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
                            const catAssets = assets.filter(a => a.category === key)
                            const catValue = catAssets.reduce((s, a) => s + (a.latest_valuation?.value_base ?? 0), 0)
                            if (catAssets.length === 0) return null
                            const Icon = cfg.icon
                            return (
                                <div
                                    key={key}
                                    className="card-stat"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => navigate(`/assets?category=${key}`)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                        <div className={`cat-icon ${cfg.className}`}>
                                            <Icon size={20} />
                                        </div>
                                        <span className="badge badge-muted">{catAssets.length}</span>
                                    </div>
                                    <div className="card-value gold" style={{ fontSize: '1.25rem', marginBottom: 4 }}>
                                        {fmt(catValue, currency)}
                                    </div>
                                    <div className="card-label">{cfg.label}</div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}
        </div>
    )
}
