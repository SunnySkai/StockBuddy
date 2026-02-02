import { clsx } from 'clsx'
import type { AuthMode } from '../types/auth'

type AuthModeToggleProps = {
  mode: AuthMode
  onChange: (mode: AuthMode) => void
}

const buttons: Array<{ label: string; value: AuthMode }> = [
  { label: 'Login', value: 'login' },
  { label: 'Sign Up', value: 'signup' }
]

const AuthModeToggle = ({ mode, onChange }: AuthModeToggleProps) => (
  <div className="inline-flex rounded-full border border-[#d7e0f5] bg-[#eef2fb] p-1 shadow-[0_12px_24px_rgba(12,24,60,0.12)]">
    {buttons.map((button) => (
      <button
        key={button.value}
        type="button"
        onClick={() => onChange(button.value)}
        className={clsx(
          'cursor-pointer flex-1 whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
          mode === button.value
            ? 'bg-white text-[#0a1635] shadow-[0_10px_18px_rgba(9,24,60,0.16)]'
            : 'text-brand-500 hover:text-brand-700'
        )}
      >
        {button.label}
      </button>
    ))}
  </div>
)

export default AuthModeToggle
