import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createOrganization, joinOrganization } from '../api/organizations'
import { useSession } from '../context/SessionContext'
import LoadingScreen from '../components/LoadingScreen'
import { Building2, Share2 } from 'lucide-react'

const cardClasses =
  'rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_32px_80px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_40px_90px_rgba(15,23,42,0.1)]'

const OrganizationOnboardingPage = () => {
  const navigate = useNavigate()
  const { status, hasOrganization, user, token, refreshSession, logout } = useSession()
  const [createName, setCreateName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [joinCode, setJoinCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && hasOrganization) {
      navigate('/', { replace: true })
    }
  }, [hasOrganization, navigate, status])

  if (status === 'checking') {
    return <LoadingScreen label="Preparing your workspace..." />
  }

  if (status !== 'authenticated') {
    return null
  }

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) {
      setCreateError('Your session expired. Please log in again.')
      return
    }
    const trimmedName = createName.trim()
    if (!trimmedName.length) {
      setCreateError('Please enter an organization name.')
      return
    }

    setIsCreating(true)
    setCreateError(null)
    const result = await createOrganization(token, { name: trimmedName })
    setIsCreating(false)

    if (!result.ok) {
      setCreateError(result.error)
      return
    }

    await refreshSession()
    navigate('/', { replace: true })
  }

  const handleJoinSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) {
      setJoinError('Your session expired. Please log in again.')
      return
    }
    const trimmedCode = joinCode.trim()
    if (!trimmedCode.length) {
      setJoinError('Please enter an invitation code.')
      return
    }

    setIsJoining(true)
    setJoinError(null)
    const result = await joinOrganization(token, { invite_code: trimmedCode })
    setIsJoining(false)

    if (!result.ok) {
      setJoinError(result.error)
      return
    }

    await refreshSession()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef3ff] via-white to-[#f5f7ff] text-slate-900">
      <header className="flex flex-col gap-6 px-10 py-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#cbd6ff] bg-white/80 px-4 py-1.5 text-xs font-semibold text-[#1d4ed8] shadow-sm">
            <Building2 className="h-4 w-4" />
            Organization setup
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.45em] text-[#8aa0ff]">
              Welcome{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
            </p>
            <h1 className="mt-2 text-4xl font-semibold">Build or join your StockBuddy workspace.</h1>
            <p className="mt-3 max-w-2xl text-base text-slate-500">
              Create a fresh command centre or join the organization that invited you. You can always invite teammates
              once you&apos;re inside.
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-800"
        >
          Sign out
        </button>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 pb-20 md:flex-row">
        <section className={`${cardClasses} flex-1 bg-white/95 text-slate-900`}>
          <h2 className="text-2xl font-semibold text-slate-900">Create an organization</h2>
          <p className="mt-2 text-sm text-slate-500">
            Launch a fresh workspace for your ticketing operations. Invite teammates and set rituals in a few clicks.
          </p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleCreateSubmit}>
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Organization name
              <input
                value={createName}
                onChange={event => setCreateName(event.target.value)}
                placeholder="e.g. Premier Ticket Group"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-medium text-slate-900 shadow focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-200/60"
              />
            </label>
            {createError && <p className="text-sm font-semibold text-red-600">{createError}</p>}
            <button
              type="submit"
              disabled={isCreating}
              className="cursor-pointer inline-flex items-center justify-center rounded-2xl border border-brand-400 px-5 py-3 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isCreating ? 'Creating organization...' : 'Create organization'}
            </button>
          </form>
        </section>

        <section className={`${cardClasses} flex-1 bg-white/95 text-slate-900`}>
          <h2 className="text-2xl font-semibold text-slate-900">Join with an invite code</h2>
          <p className="mt-2 text-sm text-slate-500">
            Enter the invitation code from your email to unlock the workspace in seconds.
          </p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleJoinSubmit}>
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Invitation code
              <input
                value={joinCode}
                onChange={event => setJoinCode(event.target.value)}
                placeholder="Paste the invitation code"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-medium text-slate-900 shadow focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-200/60"
              />
            </label>
            {joinError && <p className="text-sm font-semibold text-red-600">{joinError}</p>}
            <button
              type="submit"
              disabled={isJoining}
              className="cursor-pointer inline-flex items-center justify-center rounded-2xl border border-brand-400 px-5 py-3 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isJoining ? 'Joining organization...' : 'Join organization'}
            </button>
          </form>

          <p className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            Have an invitation link instead?{' '}
            <button
              type="button"
              onClick={() => {
                const potentialCode = joinCode.trim()
                if (potentialCode.length) {
                  navigate(`/join/${potentialCode}`)
                } else {
                  setJoinError('Paste the invitation code first or open the link directly from your email.')
                  setTimeout(() => {
                    setJoinError(null)
                  }, 4000)
                }
              }}
              className="cursor-pointer inline-flex items-center gap-2 font-semibold text-[#1d4ed8] underline-offset-4 hover:underline"
            >
              <Share2 className="h-4 w-4" />
              Open the join page
            </button>{' '}
            to review the invite details.
          </p>
        </section>
      </main>
    </div>
  )
}

export default OrganizationOnboardingPage
