import React from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface TopbarProps {
    title: string
    subtitle?: string
}

export default function Topbar({ title, subtitle }: TopbarProps) {
    const { profile } = useAuth()

    return (
        <header className="topbar">
            <div className="topbar-left">
                <span className="topbar-title">{title}</span>
                {subtitle && <span className="topbar-subtitle">{subtitle}</span>}
            </div>
            <div className="topbar-right">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                        fontSize: '0.7rem', fontWeight: 600,
                        color: 'var(--text-gold)',
                        background: 'rgba(201, 164, 78, 0.12)',
                        border: '1px solid rgba(201, 164, 78, 0.25)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                    }}>
                        {profile?.base_currency ?? 'EUR'}
                    </span>
                </div>
                <button className="btn btn-ghost btn-icon" title="Notificaciones">
                    <Bell size={16} />
                </button>
                <div style={{
                    width: 32, height: 32,
                    background: 'linear-gradient(135deg, var(--gold-700), var(--gold-500))',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: 700, color: 'var(--black-900)',
                    cursor: 'pointer',
                }}>
                    {profile?.full_name?.[0]?.toUpperCase() ?? 'U'}
                </div>
            </div>
        </header>
    )
}
