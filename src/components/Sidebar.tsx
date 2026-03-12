import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
    LayoutDashboard, Briefcase, TrendingUp, Settings,
    LogOut, ChevronRight, PlusCircle, Globe
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Briefcase, label: 'Mis Activos', path: '/assets' },
    { icon: TrendingUp, label: 'Proyecciones', path: '/projections' },
    { icon: Globe, label: 'País & Supuestos', path: '/settings' },
]

export default function Sidebar() {
    const navigate = useNavigate()
    const location = useLocation()
    const { profile, signOut } = useAuth()

    const handleSignOut = async () => {
        await signOut()
        navigate('/login')
    }

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/'
        return location.pathname.startsWith(path)
    }

    return (
        <aside className="sidebar">
            {/* Logo */}
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon">GP</div>
                <div className="sidebar-logo-text">
                    <span className="sidebar-logo-title">GestPatrimonio</span>
                    <span className="sidebar-logo-subtitle">Wealth Manager</span>
                </div>
            </div>

            {/* CTA */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <button
                    className="btn btn-primary w-full"
                    onClick={() => navigate('/assets/new')}
                    style={{ fontSize: '0.8125rem' }}
                >
                    <PlusCircle size={15} />
                    Añadir Activo
                </button>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                <span className="sidebar-section-label">Menú Principal</span>
                {navItems.map((item) => (
                    <button
                        key={item.path}
                        className={`sidebar-link ${isActive(item.path) ? 'active' : ''}`}
                        onClick={() => navigate(item.path)}
                    >
                        <item.icon className="sidebar-link-icon" size={18} />
                        {item.label}
                        {isActive(item.path) && (
                            <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                        )}
                    </button>
                ))}
            </nav>

            {/* User Footer */}
            <div className="sidebar-footer">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <div style={{
                        width: 32, height: 32,
                        background: 'linear-gradient(135deg, var(--gold-700), var(--gold-500))',
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.8rem', fontWeight: 700, color: 'var(--black-900)',
                        flexShrink: 0,
                    }}>
                        {profile?.full_name?.[0]?.toUpperCase() ?? 'U'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {profile?.full_name ?? 'Usuario'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {profile?.expertise_level === 'easy' ? 'Modo Fácil' : profile?.expertise_level === 'pro' ? 'Modo Pro' : 'Intermedio'}
                        </div>
                    </div>
                </div>
                <button className="btn btn-ghost w-full btn-sm" onClick={handleSignOut}>
                    <LogOut size={14} />
                    Cerrar sesión
                </button>
            </div>
        </aside>
    )
}
