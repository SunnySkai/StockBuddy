import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { login as loginRequest, logout as logoutRequest, signup as signupRequest } from '../api/auth'
import { getMyProfile } from '../api/users'
import type { AuthenticatedUser, MeSuccessResponse, SessionOrganization } from '../types/auth'

type SessionStatus = 'checking' | 'unauthenticated' | 'authenticated'

type SessionState = {
  status: SessionStatus
  token: string | null
  user: AuthenticatedUser | null
  organization: SessionOrganization | null
  hasOrganization: boolean
}

type AuthResult = { ok: true } | { ok: false; error: string }

type SessionContextValue = SessionState & {
  login: (payload: { email: string; password: string }) => Promise<AuthResult>
  signup: (payload: { full_name: string; email: string; password: string }) => Promise<AuthResult>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

const AUTH_TOKEN_STORAGE_KEY = 'stockbuddy.authToken'

const initialState: SessionState = {
  status: 'checking',
  token: null,
  user: null,
  organization: null,
  hasOrganization: false
}

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
}

const persistToken = (token: string | null) => {
  if (typeof window === 'undefined') return
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  }
}

const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<SessionState>(initialState)
  const latestTokenRef = useRef<string | null>(null)

  const applySessionPayload = useCallback((token: string, payload: MeSuccessResponse) => {
    latestTokenRef.current = token
    setState({
      status: 'authenticated',
      token,
      user: payload.user,
      organization: payload.organization,
      hasOrganization: payload.has_organization
    })
  }, [])

  const clearSession = useCallback(() => {
    latestTokenRef.current = null
    persistToken(null)
    setState({
      status: 'unauthenticated',
      token: null,
      user: null,
      organization: null,
      hasOrganization: false
    })
  }, [])

  const refreshSession = useCallback(async () => {
    const token = latestTokenRef.current ?? getStoredToken()
    if (!token) {
      clearSession()
      return
    }

    latestTokenRef.current = token
    setState(prev => ({
      ...prev,
      status: 'checking',
      token
    }))

    const result = await getMyProfile(token)
    if (!result.ok) {
      clearSession()
      return
    }

    persistToken(token)
    applySessionPayload(token, result.data)
  }, [applySessionPayload, clearSession])

  useEffect(() => {
    const storedToken = getStoredToken()
    if (!storedToken) {
      clearSession()
      return
    }
    latestTokenRef.current = storedToken
    refreshSession()
  }, [clearSession, refreshSession])

  const login = useCallback(
    async (payload: { email: string; password: string }): Promise<AuthResult> => {
      const result = await loginRequest(payload)
      if (!result.ok) {
        return { ok: false, error: result.error }
      }
      const token = result.data.auth_token
      latestTokenRef.current = token
      persistToken(token)
      await refreshSession()
      return { ok: true }
    },
    [refreshSession]
  )

  const signup = useCallback(
    async (payload: { full_name: string; email: string; password: string }): Promise<AuthResult> => {
      const result = await signupRequest(payload)
      if (!result.ok) {
        return { ok: false, error: result.error }
      }
      const token = result.data.auth_token
      latestTokenRef.current = token
      persistToken(token)
      await refreshSession()
      return { ok: true }
    },
    [refreshSession]
  )

  const logout = useCallback(async () => {
    const token = latestTokenRef.current ?? getStoredToken()
    if (token) {
      await logoutRequest(token)
    }
    clearSession()
  }, [clearSession])

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      login,
      signup,
      logout,
      refreshSession
    }),
    [login, logout, refreshSession, signup, state]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

const useSession = (): SessionContextValue => {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return context
}

export { SessionProvider, useSession }
