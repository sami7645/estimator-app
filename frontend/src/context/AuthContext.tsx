import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authLogin, authLogout, authMe, authRegister, type AuthUser } from '../api'

const TOKEN_KEY = 'estimator_token'

type AuthState = {
  user: AuthUser | null
  token: string | null
  loading: boolean
}

type AuthContextValue = AuthState & {
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  isAuthenticated: boolean
  isSubscribed: boolean
  subscriptionPlan: string | null
  getAuthHeader: () => { Authorization: string } | {}
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem(TOKEN_KEY),
    loading: true,
  })

  const loadUser = useCallback(async (token: string) => {
    try {
      const user = await authMe(token)
      setState((s) => ({ ...s, user, token, loading: false }))
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      setState((s) => ({ ...s, user: null, token: null, loading: false }))
    }
  }, [])

  useEffect(() => {
    const t = state.token
    if (!t) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    loadUser(t)
  }, [state.token, loadUser])

  const login = useCallback(async (username: string, password: string) => {
    const { token, user } = await authLogin({ username, password })
    localStorage.setItem(TOKEN_KEY, token)
    setState({ user, token, loading: false })
  }, [])

  const register = useCallback(async (username: string, email: string, password: string) => {
    const { token, user } = await authRegister({ username, email, password })
    localStorage.setItem(TOKEN_KEY, token)
    setState({ user, token, loading: false })
  }, [])

  const logout = useCallback(async () => {
    if (state.token) {
      try {
        await authLogout(state.token)
      } catch {}
      localStorage.removeItem(TOKEN_KEY)
    }
    setState({ user: null, token: null, loading: false })
  }, [state.token])

  const refreshUser = useCallback(async () => {
    if (state.token) {
      await loadUser(state.token)
    }
  }, [state.token, loadUser])

  const getAuthHeader = useCallback(() => {
    if (state.token) return { Authorization: `Token ${state.token}` }
    return {}
  }, [state.token])

  const sub = state.user?.subscription
  const isSubscribed = !!(sub && sub.is_active && sub.plan !== 'free')

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    logout,
    refreshUser,
    isAuthenticated: !!state.user && !!state.token,
    isSubscribed,
    subscriptionPlan: sub?.plan ?? null,
    getAuthHeader,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
