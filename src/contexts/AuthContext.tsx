import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

// ── DEMO bypass: use real seeded user without login ──────────
const DEMO_USER_ID = '702dda83-031a-4df7-b0cf-b5e4b99c03b5'
const DEMO_USER = {
    id: DEMO_USER_ID,
    email: 'demo@gestpatrimonio.com',
    app_metadata: {},
    user_metadata: { full_name: 'Propietario' },
    aud: 'authenticated',
    created_at: '',
} as unknown as User
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
    const [user, setUser] = useState<User | null>(DEMO_USER)   // start with demo user
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

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setSession(session)
                setUser(session.user)
                loadProfile(session.user.id)
            } else {
                // No session → use demo user
                setUser(DEMO_USER)
                loadProfile(DEMO_USER_ID)
            }
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            if (session?.user) {
                setUser(session.user)
                loadProfile(session.user.id)
            } else {
                setUser(DEMO_USER)
                loadProfile(DEMO_USER_ID)
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
        setUser(DEMO_USER)
        loadProfile(DEMO_USER_ID)
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
