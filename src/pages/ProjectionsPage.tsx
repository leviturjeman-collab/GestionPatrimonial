import React, { useState } from 'react'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend, BarChart, Bar
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { useAssets } from '../hooks/useAssets'
import { useAuth } from '../contexts/AuthContext'

function fmt(n: number, currency = 'EUR') {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${currency}`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ${currency}`
    return `${Math.round(n).toLocaleString('es-ES')} ${currency}`
}

type Horizon = 1 | 3 | 5 | 10

const GROWTH_RATES: Record<string, { conservative: number; base: number; optimistic: number; label: string }> = {
    real_estate: { conservative: 0.03, base: 0.05, optimistic: 0.09, label: 'Inmobiliario' },
    restaurant: { conservative: 0.04, base: 0.08, optimistic: 0.15, label: 'Restaurantes' },
    watch: { conservative: 0.02, base: 0.06, optimistic: 0.12, label: 'Relojes' },
    car: { conservative: -0.08, base: -0.05, optimistic: 0.02, label: 'Coches' },
    other: { conservative: 0.03, base: 0.06, optimistic: 0.10, label: 'Otros' },
}

export default function ProjectionsPage() {
    const { assets, totalValue, netWorth } = useAssets()
    const { profile } = useAuth()
    const currency = profile?.base_currency ?? 'EUR'
    const [horizon, setHorizon] = useState<Horizon>(5)

    // Build year-by-year projection
    const years = Array.from({ length: horizon + 1 }, (_, i) => i)
    const currentYear = new Date().getFullYear()

    const projectionData = years.map(y => {
        let conservative = 0, base = 0, optimistic = 0

        assets.forEach(a => {
            const v = a.latest_valuation?.value_base ?? a.purchase_cost ?? 0
            const debt = a.total_debt ?? 0
            const equity = Math.max(v - debt, 0)
            const rates = GROWTH_RATES[a.category] ?? GROWTH_RATES.other
            conservative += equity * Math.pow(1 + rates.conservative, y)
            base += equity * Math.pow(1 + rates.base, y)
            optimistic += equity * Math.pow(1 + rates.optimistic, y)
        })

        return {
            year: String(currentYear + y),
            conservative: Math.round(conservative),
            base: Math.round(base),
            optimistic: Math.round(optimistic),
        }
    })

    // Contribution by category
    const finalYear = projectionData[projectionData.length - 1]
    const categoryContrib = Object.entries(GROWTH_RATES).map(([key, cfg]) => {
        const catAssets = assets.filter(a => a.category === key)
        if (!catAssets.length) return null
        const v = catAssets.reduce((s, a) => s + Math.max((a.latest_valuation?.value_base ?? 0) - (a.total_debt ?? 0), 0), 0)
        const projected = v * Math.pow(1 + cfg.base, horizon)
        const growth = projected - v
        return { name: cfg.label, current: Math.round(v), projected: Math.round(projected), growth: Math.round(growth) }
    }).filter(Boolean)

    if (assets.length === 0) return (
        <div className="empty-state">
            <div className="empty-state-icon"><TrendingUp size={28} /></div>
            <div className="empty-state-title">Sin activos para proyectar</div>
            <div className="empty-state-text">Añade activos para visualizar la proyección de tu patrimonio.</div>
        </div>
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>

            {/* Horizon selector */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h3 style={{ marginBottom: '0.25rem' }}>Proyección de Patrimonio</h3>
                    <p className="text-muted text-sm">Estimación basada en tasas históricas por sector</p>
                </div>
                <div className="mode-toggle">
                    {([1, 3, 5, 10] as Horizon[]).map(h => (
                        <button key={h} className={`mode-toggle-option ${horizon === h ? 'active' : ''}`} onClick={() => setHorizon(h)}>
                            {h} año{h > 1 ? 's' : ''}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid-3">
                {(['conservative', 'base', 'optimistic'] as const).map((scenario) => {
                    const finalVal = projectionData[projectionData.length - 1]?.[scenario] ?? 0
                    const growth = ((finalVal - netWorth) / (netWorth || 1)) * 100
                    const labels = { conservative: '🐢 Conservador', base: '📊 Base', optimistic: '🚀 Optimista' }
                    return (
                        <div key={scenario} className="card-stat">
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                {labels[scenario]}
                            </div>
                            <div className="card-value gold" style={{ fontSize: '1.375rem' }}>{fmt(finalVal, currency)}</div>
                            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: growth >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                                {growth >= 0 ? '+' : ''}{growth.toFixed(1)}% en {horizon} año{horizon > 1 ? 's' : ''}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Area Chart */}
            <div className="chart-container">
                <div className="chart-header">
                    <h4 className="chart-title">Curva de Patrimonio — 3 Escenarios</h4>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={projectionData}>
                        <defs>
                            <linearGradient id="baseGr" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#C9A44E" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#C9A44E" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="optimGr" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.12} />
                                <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="year" tick={{ fill: 'var(--black-200)', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--black-200)', fontSize: 11 }} tickFormatter={v => fmt(v, '')} axisLine={false} tickLine={false} width={80} />
                        <Tooltip
                            contentStyle={{ background: 'var(--black-800)', border: '1px solid var(--border-gold)', borderRadius: 10, fontSize: 13 }}
                            formatter={(v: number, name: string) => [fmt(v, currency), name === 'conservative' ? 'Conservador' : name === 'base' ? 'Base' : 'Optimista']}
                        />
                        <Legend formatter={v => v === 'conservative' ? 'Conservador' : v === 'base' ? 'Base' : 'Optimista'} />
                        <Area type="monotone" dataKey="optimistic" stroke="#4ade80" fill="url(#optimGr)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                        <Area type="monotone" dataKey="base" stroke="#C9A44E" fill="url(#baseGr)" strokeWidth={2.5} dot={false} />
                        <Area type="monotone" dataKey="conservative" stroke="rgba(201,164,78,0.4)" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Contribution by Category */}
            {categoryContrib.length > 0 && (
                <div className="chart-container">
                    <div className="chart-header">
                        <h4 className="chart-title">Contribución por Sector (escenario base)</h4>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={categoryContrib as Record<string, unknown>[]} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis type="number" tick={{ fill: 'var(--black-200)', fontSize: 11 }} tickFormatter={v => fmt(v, '')} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fill: 'var(--black-200)', fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
                            <Tooltip
                                contentStyle={{ background: 'var(--black-800)', border: '1px solid var(--border-gold)', borderRadius: 10, fontSize: 13 }}
                                formatter={(v: number, name: string) => [fmt(v, currency), name === 'projected' ? 'Proyectado' : 'Crecimiento']}
                            />
                            <Bar dataKey="projected" fill="#C9A44E" radius={[0, 4, 4, 0]} opacity={0.8} />
                            <Bar dataKey="growth" fill="#4ade80" radius={[0, 4, 4, 0]} opacity={0.6} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}
