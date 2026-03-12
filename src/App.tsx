import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import AppLayout from './components/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AssetsPage from './pages/AssetsPage'
import AddAssetPage from './pages/AddAssetPage'
import AssetDetailPage from './pages/AssetDetailPage'
import ModelPage from './pages/ModelPage'
import ProjectionsPage from './pages/ProjectionsPage'
import SettingsPage from './pages/SettingsPage'
import './styles/global.css'

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />

                    {/* Protected routes */}
                    <Route path="/" element={<AppLayout title="Dashboard" subtitle="Resumen de tu patrimonio" />}>
                        <Route index element={<DashboardPage />} />
                    </Route>

                    <Route path="/assets" element={<AppLayout title="Mis Activos" subtitle="Inventario patrimonial" />}>
                        <Route index element={<AssetsPage />} />
                        <Route path=":id" element={<AssetDetailPage />} />
                        <Route path=":id/model" element={<AppLayout title="Modelo DCF Profesional" subtitle="Análisis financiero completo" />}>
                            <Route index element={<ModelPage />} />
                        </Route>
                    </Route>

                    <Route path="/assets/new" element={<AppLayout title="Nuevo Activo" subtitle="Wizard de registro y valoración" />}>
                        <Route index element={<AddAssetPage />} />
                    </Route>

                    <Route path="/projections" element={<AppLayout title="Proyecciones" subtitle="Evolución patrimonial a futuro" />}>
                        <Route index element={<ProjectionsPage />} />
                    </Route>

                    <Route path="/settings" element={<AppLayout title="Configuración" subtitle="País, moneda y supuestos globales" />}>
                        <Route index element={<SettingsPage />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}
