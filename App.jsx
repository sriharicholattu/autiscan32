import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import ClinicDashboard from './pages/ClinicDashboard'
import ClinicianDashboard from './pages/ClinicianDashboard'
import PatientSession from './pages/PatientSession'

function ProtectedRoute({ children, role }) {
  const { profile, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/><p>Loading...</p></div>
  if (!profile) return <Navigate to="/" replace />
  if (role && profile.role !== role) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { profile, loading } = useAuth()

  if (loading) return <div className="loading-screen"><div className="spinner"/><p style={{color:'var(--muted)'}}>Loading AutiScan...</p></div>

  return (
    <Routes>
      <Route path="/" element={
        profile ? (
          profile.role === 'clinic' ? <Navigate to="/clinic" replace /> :
          profile.role === 'clinician' ? <Navigate to="/clinician" replace /> :
          <Navigate to="/patient" replace />
        ) : <LoginPage />
      } />
      <Route path="/clinic" element={<ProtectedRoute role="clinic"><ClinicDashboard /></ProtectedRoute>} />
      <Route path="/clinician" element={<ProtectedRoute role="clinician"><ClinicianDashboard /></ProtectedRoute>} />
      <Route path="/patient" element={<ProtectedRoute role="patient"><PatientSession /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
