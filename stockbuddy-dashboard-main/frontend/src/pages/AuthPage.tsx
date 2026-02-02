import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLandingHero from '../components/AuthLandingHero'
import AuthLayout from '../components/AuthLayout'
import AuthModeToggle from '../components/AuthModeToggle'
import AuthForm from '../components/AuthForm'
import LoadingScreen from '../components/LoadingScreen'
import { useSession } from '../context/SessionContext'
import type { AuthMode } from '../types/auth'

const copy: Record<AuthMode, { headline: string; subheadline: string }> = {
  login: {
    headline: 'Welcome back, operator',
    subheadline: 'Log in to oversee live stock health, approve transfers, and brief stakeholders in minutes.'
  },
  signup: {
    headline: 'Create your command centre',
    subheadline: 'Launch a unified space for every store, franchise and retail partner to align around truth.'
  }
}

const AuthPage = () => {
  const [view, setView] = useState<'landing' | 'auth'>('landing')
  const [mode, setMode] = useState<AuthMode>('login')
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { status: sessionStatus, hasOrganization, login, signup } = useSession()

  const inviteCode = useMemo(() => {
    const value = searchParams.get('invite')
    return value ? value.trim() : null
  }, [searchParams])

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return

    if (!hasOrganization) {
      if (inviteCode) {
        navigate(`/join/${inviteCode}?origin=auth`, { replace: true })
      } else {
        navigate('/onboarding', { replace: true })
      }
      return
    }

    if (inviteCode) {
      navigate(`/join/${inviteCode}`, { replace: true })
      return
    }

    const state = location.state as { from?: { pathname?: string } } | undefined
    const redirectPath = state?.from?.pathname && state.from.pathname !== '/auth' ? state.from.pathname : '/'
    navigate(redirectPath, { replace: true })
  }, [hasOrganization, inviteCode, location.state, navigate, sessionStatus])

  const handleModeChange = (value: AuthMode) => {
    setMode(value)
    setStatus(null)
  }

  const handleSubmit = async (payload: { mode: AuthMode; values: Record<string, FormDataEntryValue> }) => {
    const { mode: submittedMode, values } = payload
    setStatus(null)

    const email = typeof values.email === 'string' ? values.email.trim() : ''
    const password = typeof values.password === 'string' ? values.password : ''

    if (!email || !password) {
      setStatus({ type: 'error', message: 'Email and password are required.' })
      return
    }

    if (submittedMode === 'signup') {
      const confirmPassword = typeof values.confirmPassword === 'string' ? values.confirmPassword : ''
      if (password !== confirmPassword) {
        setStatus({ type: 'error', message: 'Passwords do not match.' })
        return
      }

      const fullName = typeof values.full_name === 'string' ? values.full_name.trim() : ''
      if (!fullName) {
        setStatus({ type: 'error', message: 'Full name is required.' })
        return
      }

      setIsSubmitting(true)
      const result = await signup({ full_name: fullName, email, password })
      setIsSubmitting(false)

      if (result.ok) {
        setStatus({ type: 'success', message: 'Account created. Redirecting...' })
      } else {
        setStatus({ type: 'error', message: result.error })
        return
      }
    } else {
      setIsSubmitting(true)
      const result = await login({ email, password })
      setIsSubmitting(false)

      if (result.ok) {
        setStatus({ type: 'success', message: 'Welcome back. Redirecting...' })
      } else {
        setStatus({ type: 'error', message: result.error })
      }
    }
  }

  if (sessionStatus === 'checking') {
    return <LoadingScreen label="Reconnecting to your workspace..." />
  }

  if (view === 'landing') {
    return <AuthLandingHero onGetStarted={() => setView('auth')} />
  }

  return (
    <AuthLayout
      headingSlot={
        <div className="flex items-center justify-start">
          <AuthModeToggle mode={mode} onChange={handleModeChange} />
        </div>
      }
      headline={copy[mode].headline}
      subheadline={copy[mode].subheadline}
    >
      <AuthForm
        mode={mode}
        status={status}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onSwitchMode={handleModeChange}
      />
    </AuthLayout>
  )
}

export default AuthPage
