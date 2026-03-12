import React from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import CustomCursor from '../components/CustomCursor'
import { useAuth } from '../contexts/AuthContext'

interface AppLayoutProps {
    title: string
    subtitle?: string
}

export default function AppLayout({ title, subtitle }: AppLayoutProps) {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--black-950)',
            }}>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                    <div className="spinner" style={{ width: 48, height: 48 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Cargando patrimonio...</p>
                </div>
            </div>
        )
    }

    // Auth bypass — re-enable when ready: if (!user) return <Navigate to="/login" replace />

    return (
        <div className="app-layout">
            <CustomCursor />
            <Sidebar />
            <div className="main-content">
                <Topbar title={title} subtitle={subtitle} />
                <div className="page-content animate-fade-in">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}
