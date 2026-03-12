import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

// ── Demo credentials (auto-login so RLS works) ──────────────
const DEMO_EMAIL = 'demo@gestpatrimonio.com'
const DEMO_PASSWORD = 'Demo123!'
// ─────────────────────────────────────────────────────────────

interface AuthContextType {
    user: User | null
    session: Session | null
    profile: Profile | null
    loading: boolean
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>
    signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>
    signOut: () => Promise<void>
    refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)

    const loadProfile = async (userId: string) => {
        const { data } = await supabase
            .from('patrimonio_profiles')
            .select('*')
            .eq('id', userId)
            .single()
        setProfile(data as Profile | null)
    }

    const autoSignIn = async () => {
        // Auto-login with demo user so RLS works
        const { data, error } = await supabase.auth.signInWithPassword({
            email: DEMO_EMAIL,
            password: DEMO_PASSWORD,
        })
        if (!error && data.session) {
            setSession(data.session)
            setUser(data.session.user)
            await loadProfile(data.session.user.id)
        }
        setLoading(false)
    }

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setSession(session)
                setUser(session.user)
                loadProfile(session.user.id)
                setLoading(false)
            } else {
                // No session → auto-sign-in with demo user
                autoSignIn()
            }
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            if (session?.user) {
                setUser(session.user)
                loadProfile(session.user.id)
            } else {
                setUser(null)
                setProfile(null)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return { error }
    }

    const signUp = async (email: string, password: string, fullName: string) => {
        const { error } = await supabase.auth.signUp({
            email, password,
            options: { data: { full_name: fullName } }
        })
        return { error }
    }

    const signOut = async () => {
        await supabase.auth.signOut()
        // Re-login as demo
        await autoSignIn()
    }

    const refreshProfile = async () => {
        if (user) await loadProfile(user.id)
    }

    return (
        <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
