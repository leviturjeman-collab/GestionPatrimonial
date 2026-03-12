import React from 'react'
import { Globe, Info } from 'lucide-react'
import { useCountryPresets } from '../hooks/useAssets'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function SettingsPage() {
    const { profile, refreshProfile } = useAuth()
    const { presets, loading } = useCountryPresets()

    const handleLevelChange = async (level: string) => {
        if (!profile) return
        await supabase.from('patrimonio_profiles').update({ expertise_level: level }).eq('id', profile.id)
        refreshProfile()
    }

    const handleCurrencyChange = async (currency: string) => {
        if (!profile) return
        await supabase.from('patrimonio_profiles').update({ base_currency: currency }).eq('id', profile.id)
        refreshProfile()
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem', maxWidth: 800 }}>

            {/* Nivel de usuario */}
            <div className="card">
                <h4 style={{ marginBottom: '0.5rem' }}>Nivel de Experiencia</h4>
                <p className="text-muted text-sm" style={{ marginBottom: '1.25rem' }}>Controla la complejidad de las herramientas de valoración.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                    {[
                        { key: 'easy', label: 'Modo Fácil', desc: 'Valoración automática con inputs mínimos. Ideal para no expertos.' },
                        { key: 'intermediate', label: 'Intermedio', desc: 'Ajusta supuestos clave y revisa los drivers de valoración.' },
                        { key: 'pro', label: 'Modo Pro', desc: 'DCF completo, WACC, escenarios, sensibilidad y FX avanzado.' },
                    ].map(opt => {
                        const active = profile?.expertise_level === opt.key
                        return (
                            <button
                                key={opt.key}
                                onClick={() => handleLevelChange(opt.key)}
                                style={{
                                    background: active ? 'rgba(201, 164, 78, 0.12)' : 'var(--black-800)',
                                    border: `1px solid ${active ? 'var(--gold-500)' : 'var(--border-muted)'}`,
                                    borderRadius: 'var(--radius-lg)', padding: '1rem',
                                    cursor: 'pointer', textAlign: 'left',
                                    transition: 'all var(--transition-fast)',
                                    boxShadow: active ? 'var(--shadow-gold)' : 'none',
                                }}
                            >
                                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: active ? 'var(--text-gold)' : 'var(--text-primary)', marginBottom: 4 }}>{opt.label}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{opt.desc}</div>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Moneda base */}
            <div className="card">
                <h4 style={{ marginBottom: '0.5rem' }}>Moneda Base</h4>
                <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>Todos los valores patrimoniales se mostrarán en esta moneda.</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['EUR', 'USD', 'GBP', 'CHF'].map(c => (
                        <button
                            key={c}
                            onClick={() => handleCurrencyChange(c)}
                            className={profile?.base_currency === c ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                        >
                            {c === 'EUR' ? '€' : c === 'USD' ? '$' : c === 'GBP' ? '£' : 'CHF'} {c}
                        </button>
                    ))}
                </div>
            </div>

            {/* Country Presets Table */}
            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <Globe size={18} style={{ color: 'var(--text-gold)' }} />
                    <h4>Presets por País</h4>
                </div>
                <div className="alert alert-gold" style={{ marginBottom: '1rem' }}>
                    <Info size={14} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8125rem' }}>Estos parámetros se usan para calcular la tasa de descuento y ajustes fiscales en el motor de valoración.</span>
                </div>

                {loading ? (
                    <div className="loader"><div className="spinner" /></div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>País</th>
                                    <th>Moneda</th>
                                    <th>Rf (Free Rate)</th>
                                    <th>ERP</th>
                                    <th>CRP</th>
                                    <th>Inflación</th>
                                    <th>T. Efectivo</th>
                                    <th>FX Base</th>
                                </tr>
                            </thead>
                            <tbody>
                                {presets.map((p: Record<string, unknown>) => (
                                    <tr key={String(p.id)}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{String(p.country_name)}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{String(p.country_code)}</div>
                                        </td>
                                        <td><span className="badge badge-gold">{String(p.currency)}</span></td>
                                        <td style={{ color: 'var(--text-gold)' }}>{((Number(p.risk_free_rate)) * 100).toFixed(1)}%</td>
                                        <td>{((Number(p.equity_risk_premium)) * 100).toFixed(1)}%</td>
                                        <td>{((Number(p.country_risk_premium)) * 100).toFixed(1)}%</td>
                                        <td>{((Number(p.expected_inflation)) * 100).toFixed(1)}%</td>
                                        <td style={{ color: '#f87171' }}>{((Number(p.effective_tax_rate)) * 100).toFixed(0)}%</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{Number(p.fx_vs_base).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
