import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import RestaurantModelPage from './RestaurantModelPage'
import RealEstateModelPage from './RealEstateModelPage'
import WatchModelPage from './WatchModelPage'
import VehicleModelPage from './VehicleModelPage'
import type { Asset } from '../types'

export default function ModelPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [asset, setAsset] = useState<Asset | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!id) return
        supabase.from('patrimonio_assets').select('*').eq('id', id).single().then(({ data }) => {
            if (!data) { navigate('/assets'); return }
            setAsset(data as Asset)
            setLoading(false)
        })
    }, [id, navigate])

    if (loading) return <div className="loader"><div className="spinner" /></div>
    if (!asset) return null

    if (asset.category === 'restaurant') return <RestaurantModelPage asset={asset} />
    if (asset.category === 'real_estate') return <RealEstateModelPage asset={asset} />
    if (asset.category === 'watch') return <WatchModelPage asset={asset} />
    if (asset.category === 'car') return <VehicleModelPage asset={asset} />

    return (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>Modelo DCF aún no disponible para esta categoría.</p>
            <button onClick={() => navigate('/assets')} className="btn btn-ghost" style={{ marginTop: '1rem' }}>Volver</button>
        </div>
    )
}
