import { clsx } from 'clsx'
import type { FormEvent } from 'react'
import type { AuthMode } from '../types/auth'

type AuthFormProps = {
  mode: AuthMode
  status: { type: 'success' | 'error'; message: string } | null
  isSubmitting: boolean
  onSubmit: (payload: { mode: AuthMode; values: Record<string, FormDataEntryValue> }) => void
  onSwitchMode: (mode: AuthMode) => void
}

const baseInputClasses =
  'rounded-2xl border border-[#dbe3f5] bg-white px-4 py-3.5 text-sm font-medium text-[#0a1635] shadow-[0_12px_24px_rgba(15,23,42,0.04)] transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-200/50'

const AuthForm = ({ mode, status, isSubmitting, onSubmit, onSwitchMode }: AuthFormProps) => {
  const isSignUp = mode === 'signup'
  const submitLabel = isSignUp ? 'Sign Up' : 'Login'
  const pendingLabel = isSignUp ? 'Creating account...' : 'Logging in...'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    onSubmit({ mode, values: Object.fromEntries(formData.entries()) })
  }

  return (
    <form className="mt-2 flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
      {status && (
        <div
          className={clsx(
            'rounded-2xl px-4 py-3 text-sm font-semibold shadow-[0_12px_24px_rgba(15,23,42,0.08)]',
            status.type === 'success' ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-[#fef2f2] text-[#b91c1c]'
          )}
          role="status"
          aria-live="polite"
        >
          {status.message}
        </div>
      )}
      {isSignUp && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-brand-600">Full name</span>
          <input
            required
            id="full_name"
            name="full_name"
            placeholder="Avery Carter"
            autoComplete="name"
            className={baseInputClasses}
          />
        </label>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-brand-600">Email address</span>
        <input
          required
          id="email"
          name="email"
          type="email"
          placeholder="you@business.com"
          autoComplete="email"
          className={baseInputClasses}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-brand-600">Password</span>
        <input
          required
          id="password"
          name="password"
          type="password"
          placeholder="Create a secure password"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          className={baseInputClasses}
        />
      </label>

      {isSignUp && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-brand-600">Confirm password</span>
          <input
            required
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            placeholder="Repeat password"
            autoComplete="new-password"
            className={baseInputClasses}
          />
        </label>
      )}

      {!isSignUp && (
        <div className="flex items-center justify-between text-sm font-medium text-brand-500">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="rememberMe"
              className="cursor-pointer h-4 w-4 rounded border-brand-300 text-brand-500 focus:ring-brand-300"
            />
            <span>Remember me</span>
          </label>
          <a href="#" className="text-brand-500 transition hover:text-brand-700">
            Forgot password?
          </a>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="cursor-pointer mt-1 inline-flex items-center justify-center rounded-[20px] bg-gradient-to-r from-[#2563eb] via-[#1f56db] to-[#1d4ed8] px-6 py-3.5 text-base font-semibold text-white shadow-[0_24px_46px_rgba(37,99,235,0.36)] transition hover:translate-y-[-1px] hover:shadow-[0_30px_60px_rgba(37,99,235,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? pendingLabel : submitLabel}
      </button>

      <p className="rounded-2xl bg-[#f6f8fd] px-4 py-3 text-sm font-medium text-brand-600 shadow-[0_12px_24px_rgba(15,23,42,0.06)]">
        {isSignUp ? (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => onSwitchMode('login')}
              className="cursor-pointer text-brand-500 underline-offset-4 transition hover:text-brand-700 hover:underline"
            >
              Login
            </button>
          </>
        ) : (
          <>
            Need an account?{' '}
            <button
              type="button"
              onClick={() => onSwitchMode('signup')}
              className="cursor-pointer text-brand-500 underline-offset-4 transition hover:text-brand-700 hover:underline"
            >
              Sign up now
            </button>
          </>
        )}
      </p>

      <p className="text-xs text-brand-400">
        By continuing, you agree to our{' '}
        <a href="#" className="underline decoration-dashed underline-offset-4 hover:text-brand-700">
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="#" className="underline decoration-dashed underline-offset-4 hover:text-brand-700">
          Privacy Policy
        </a>.
      </p>
    </form>
  )
}

export default AuthForm
