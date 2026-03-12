import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Asset, ValuationSnapshot, DebtFacility } from '../types'

export function useAssets() {
    const { user } = useAuth()
    const [assets, setAssets] = useState<Asset[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchAssets = useCallback(async () => {
        if (!user) return
        setLoading(true)
        setError(null)
        try {
            // Fetch assets
            const { data: assetData, error: assetErr } = await supabase
                .from('patrimonio_assets')
                .select('*')
                .eq('user_id', user.id)
                .neq('status', 'sold')
                .order('created_at', { ascending: false })

            if (assetErr) throw assetErr

            // Fetch latest valuations
            const { data: snapData } = await supabase
                .from('patrimonio_valuation_snapshots')
                .select('*')
                .eq('user_id', user.id)
                .order('snapshot_date', { ascending: false })

            // Fetch debt
            const { data: debtData } = await supabase
                .from('patrimonio_debt_facilities')
                .select('*')
                .eq('user_id', user.id)

            // Merge
            const enriched = (assetData ?? []).map((a: Asset) => {
                const latestSnap = ((snapData ?? []) as ValuationSnapshot[])
                    .filter((s: ValuationSnapshot) => s.asset_id === a.id)[0] ?? null
                const totalDebt = ((debtData ?? []) as DebtFacility[])
                    .filter((d: DebtFacility) => d.asset_id === a.id)
                    .reduce((sum: number, d: DebtFacility) => sum + (d.outstanding_principal ?? 0), 0)
                return { ...a, latest_valuation: latestSnap, total_debt: totalDebt }
            }) as Asset[]

            setAssets(enriched)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al cargar activos')
        } finally {
            setLoading(false)
        }
    }, [user])

    useEffect(() => { fetchAssets() }, [fetchAssets])

    const createAsset = async (data: Partial<Asset>) => {
        if (!user) return { error: 'No autenticado' }
        const { error } = await supabase
            .from('patrimonio_assets')
            .insert({ ...data, user_id: user.id })
        if (!error) fetchAssets()
        return { error: error?.message ?? null }
    }

    const updateAsset = async (id: string, data: Partial<Asset>) => {
        const { error } = await supabase
            .from('patrimonio_assets')
            .update(data)
            .eq('id', id)
        if (!error) fetchAssets()
        return { error: error?.message ?? null }
    }

    const deleteAsset = async (id: string) => {
        const { error } = await supabase
            .from('patrimonio_assets')
            .update({ status: 'sold' })
            .eq('id', id)
        if (!error) fetchAssets()
        return { error: error?.message ?? null }
    }

    const saveValuationSnapshot = async (snapshot: Partial<ValuationSnapshot>) => {
        if (!user) return { error: 'No autenticado' }
        const { error } = await supabase
            .from('patrimonio_valuation_snapshots')
            .insert({ ...snapshot, user_id: user.id })
        if (!error) fetchAssets()
        return { error: error?.message ?? null }
    }

    // Computed totals
    const totalValue = assets.reduce((sum, a) => sum + (a.latest_valuation?.value_base ?? 0), 0)
    const totalDebt = assets.reduce((sum, a) => sum + (a.total_debt ?? 0), 0)
    const netWorth = totalValue - totalDebt

    return { assets, loading, error, fetchAssets, createAsset, updateAsset, deleteAsset, saveValuationSnapshot, totalValue, totalDebt, netWorth }
}

export function useCountryPresets() {
    const [presets, setPresets] = useState<Record<string, unknown>[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase
            .from('patrimonio_country_presets')
            .select('*')
            .order('country_name')
            .then(({ data }) => {
                setPresets(data ?? [])
                setLoading(false)
            })
    }, [])

    return { presets, loading }
}
