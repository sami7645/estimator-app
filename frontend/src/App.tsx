import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import SiteLayout from './layouts/SiteLayout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import PaymentPage from './pages/PaymentPage'
import ProfilePage from './pages/ProfilePage'
import PrivacyAgreementPage from './pages/PrivacyAgreementPage'
import SubscriptionPage from './pages/SubscriptionPage'
import TeamPage from './pages/TeamPage'
import DatasetPage from './pages/DatasetPage'
import DesignerApp from './DesignerApp'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SiteLayout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="signup" element={<SignupPage />} />
            <Route path="pricing" element={<PaymentPage />} />
            <Route path="privacy-agreement" element={
              <RequireAuth><PrivacyAgreementPage /></RequireAuth>
            } />
            <Route path="subscribe" element={
              <RequireAuth><SubscriptionPage /></RequireAuth>
            } />
            <Route path="team" element={
              <RequireAuth><TeamPage /></RequireAuth>
            } />
            <Route path="datasets" element={
              <RequireAuth><DatasetPage /></RequireAuth>
            } />
            <Route path="profile" element={<ProfilePage />} />
            <Route
              path="designer/*"
              element={
                <RequireAuth>
                  <DesignerApp />
                </RequireAuth>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
