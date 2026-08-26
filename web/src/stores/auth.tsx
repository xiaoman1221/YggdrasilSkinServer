import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authApi, User } from '../api/auth'

const ACCESS_KEY = 'yss_access_token'
const REFRESH_KEY = 'yss_refresh_token'

interface AuthState {
  user: User | null
  loading: boolean
  login: (account: string, password: string, captcha?: { captchaId?: string; captchaCode?: string }) => Promise<void>
  register: (username: string, email: string, password: string, captcha?: { captchaId?: string; captchaCode?: string }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    refreshUser().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem(ACCESS_KEY)) return
    try {
      const res = await authApi.me()
      setUser({ ...res.user, oauth_bindings: res.oauth_bindings || [] })
    } catch {
      setUser(null)
    }
  }, [])

  async function login(account: string, password: string, captcha?: { captchaId?: string; captchaCode?: string }) {
    const res = await authApi.login({ account, password, ...captcha })
    localStorage.setItem(ACCESS_KEY, res.accessToken)
    localStorage.setItem(REFRESH_KEY, res.refreshToken)
    setUser(res.user)
  }

  async function register(username: string, email: string, password: string, captcha?: { captchaId?: string; captchaCode?: string }) {
    await authApi.register({ username, email, password, ...captcha })
  }

  async function logout() {
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken)
      } catch {
        /* ignore */
      }
    }
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

