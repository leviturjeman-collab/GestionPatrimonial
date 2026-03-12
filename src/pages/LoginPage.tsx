import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff, TrendingUp } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
    const { user, signIn, signUp } = useAuth()
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [showPwd, setShowPwd] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    if (user) return <Navigate to="/" replace />

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setSuccess(null)

        if (mode === 'login') {
            const { error } = await signIn(email, password)
            if (error) setError('Email o contraseña incorrectos.')
        } else {
            if (!fullName) { setError('Introduce tu nombre completo.'); setLoading(false); return }
            const { error } = await signUp(email, password, fullName)
            if (error) setError(error.message)
            else setSuccess('¡Cuenta creada! Revisa tu correo para confirmar.')
        }
        setLoading(false)
    }

    return (
        <div className="auth-page">
            <div className="auth-bg-grid" />
            <div className="auth-bg-glow" />

            <div className="auth-card">
                {/* Logo */}
                <div className="auth-logo">
                    <div className="auth-logo-icon">
                        <TrendingUp size={22} />
                    </div>
                    <div>
                        <div className="auth-title">GestPatrimonio</div>
                        <div className="auth-subtitle">Asset & Wealth Manager</div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0', marginBottom: '1.75rem', background: 'var(--black-800)', borderRadius: 'var(--radius-md)', padding: '3px' }}>
                    {(['login', 'register'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setMode(tab); setError(null); setSuccess(null) }}
                            style={{
                                flex: 1, padding: '0.5rem', border: 'none', borderRadius: '7px',
                                background: mode === tab ? 'linear-gradient(135deg, var(--gold-700), var(--gold-500))' : 'transparent',
                                color: mode === tab ? 'var(--black-900)' : 'var(--text-muted)',
                                fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                                transition: 'all var(--transition-fast)',
                            }}
                        >
                            {tab === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {mode === 'register' && (
                        <div className="form-group">
                            <label className="form-label">Nombre completo <span className="required">*</span></label>
                            <input
                                className="form-input"
                                type="text"
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                                placeholder="Ej: Juan García"
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Email <span className="required">*</span></label>
                        <input
                            className="form-input"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="tu@email.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Contraseña <span className="required">*</span></label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="form-input"
                                type={showPwd ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                style={{ paddingRight: '2.5rem' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd(!showPwd)}
                                style={{
                                    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                                }}
                            >
                                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="alert alert-error">
                            <span style={{ fontSize: '0.875rem' }}>{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className="alert alert-success">
                            <span style={{ fontSize: '0.875rem' }}>{success}</span>
                        </div>
                    )}

                    <button
                        className="btn btn-primary btn-lg w-full"
                        type="submit"
                        disabled={loading}
                        style={{ marginTop: '0.5rem' }}
                    >
                        {loading ? 'Procesando...' : mode === 'login' ? 'Acceder' : 'Crear Cuenta'}
                    </button>
                </form>

                <div className="divider" />
                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Tus datos patrimoniales están cifrados y protegidos.
                </p>
            </div>
        </div>
    )
}
