import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getInvitationByCode, joinOrganization } from '../api/organizations'
import LoadingScreen from '../components/LoadingScreen'
import { useSession } from '../context/SessionContext'

type InvitationState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | {
      status: 'ready'
      payload: {
        code: string
        organizationName: string | null
        email: string
        invitedBy: string | null
        expiresAt: string | null
        inviteStatus: string
      }
    }

const messageStyles = 'rounded-2xl border px-4 py-3 text-sm font-semibold'

const JoinInvitationPage = () => {
  const { code = '' } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteCode = code.trim().toLowerCase()
  const [invitationState, setInvitationState] = useState<InvitationState>({ status: 'loading' })
  const [isAccepting, setIsAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const { status: sessionStatus, hasOrganization, token, refreshSession } = useSession()

  useEffect(() => {
    if (!inviteCode.length) {
      setInvitationState({ status: 'not-found' })
      return
    }
    let isMounted = true
    setInvitationState({ status: 'loading' })

    getInvitationByCode(inviteCode).then(result => {
      if (!isMounted) return
      if (!result.ok || !result.data?.invitation) {
        setInvitationState({ status: 'not-found' })
        return
      }
      const { invitation } = result.data
      setInvitationState({
        status: 'ready',
        payload: {
          code: invitation.code,
          organizationName: invitation.organization?.name ?? null,
          email: invitation.email,
          invitedBy: invitation.invited_by_user_id,
          expiresAt: invitation.expires_at,
          inviteStatus: invitation.status
        }
      })
    })

    return () => {
      isMounted = false
    }
  }, [inviteCode])

  const invite = invitationState.status === 'ready' ? invitationState.payload : null
  const isExpired = useMemo(() => {
    if (!invite?.expiresAt) return false
    return new Date(invite.expiresAt) <= new Date()
  }, [invite?.expiresAt])

  const inviteStatus = invite?.inviteStatus ?? 'pending'
  const requiresLogin = sessionStatus !== 'authenticated'
  const canAccept =
    !!invite &&
    !isExpired &&
    inviteStatus === 'pending' &&
    sessionStatus === 'authenticated' &&
    !hasOrganization &&
    !!token

  const postAuthRedirect = useMemo(() => {
    const origin = searchParams.get('origin')
    return origin === 'onboarding'
  }, [searchParams])

  const handleAccept = async () => {
    if (!canAccept || !token || !invite) return
    setIsAccepting(true)
    setAcceptError(null)
    const result = await joinOrganization(token, { invite_code: invite.code })
    setIsAccepting(false)

    if (!result.ok) {
      setAcceptError(result.error)
      return
    }

    await refreshSession()
    navigate('/', { replace: true })
  }

  if (invitationState.status === 'loading') {
    return <LoadingScreen label="Checking your invitation..." />
  }

  if (invitationState.status === 'not-found') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#eef3ff] via-white to-[#f5f7ff] text-slate-900">
        <div className="max-w-lg rounded-[32px] border border-white/70 bg-white p-10 text-center shadow-[0_32px_80px_rgba(15,23,42,0.08)]">
          <h1 className="text-3xl font-semibold text-slate-900">Invitation not found</h1>
          <p className="mt-3 text-sm text-slate-500">
            We couldn&apos;t find an organization invitation matching that code. Double-check the link from your email
            or ask the sender to invite you again.
          </p>
          <button
            className="mt-6 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl"
            onClick={() => navigate('/auth', { replace: true })}
          >
            Return to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef3ff] via-white to-[#f5f7ff] text-slate-900">
      <header className="px-6 py-10 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#cbd6ff] bg-white/80 px-4 py-1.5 text-xs font-semibold text-[#1d4ed8] shadow-sm">
          Organization invitation
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-slate-900">
          Join {invite?.organizationName ?? 'this organization'} on StockBuddy
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          This invitation is linked to <span className="font-semibold text-[#1d4ed8]">{invite?.email}</span>. Sign in with
          that email to continue.
        </p>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 pb-16">
        <section className="rounded-[28px] border border-white/70 bg-white p-8 shadow-[0_32px_80px_rgba(15,23,42,0.08)]">
          <h2 className="text-2xl font-semibold text-slate-900">Invitation details</h2>
          <dl className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-500 md:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-400">Organization</dt>
              <dd className="font-semibold text-slate-900">{invite?.organizationName ?? 'Pending organization'}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-400">Invited email</dt>
              <dd className="font-semibold text-slate-900">{invite?.email}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-400">Invitation status</dt>
              <dd className="font-semibold capitalize text-slate-900">{inviteStatus}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-400">Expires</dt>
              <dd className="font-semibold text-slate-900">
                {invite?.expiresAt ? new Date(invite.expiresAt).toLocaleString() : 'No expiry set'}
              </dd>
            </div>
          </dl>

          {isExpired && (
            <p className={`${messageStyles} mt-6 border-red-200 bg-red-50 text-red-600`}>
              This invitation has expired. Ask the organization owner to send a new invite.
            </p>
          )}

          {inviteStatus !== 'pending' && !isExpired && (
            <p className={`${messageStyles} mt-6 border-amber-200 bg-amber-50 text-amber-600`}>
              This invitation is no longer active ({inviteStatus}). Reach out to your admin for a new invite.
            </p>
          )}

          {acceptError && (
            <p className={`${messageStyles} mt-6 border-red-200 bg-red-50 text-red-600`}>{acceptError}</p>
          )}

          {requiresLogin ? (
            <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
              <p className="text-sm text-slate-500">
                Already have an account? Sign in with your invited email to accept this invitation.
              </p>
              <button
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl"
                onClick={() => navigate(`/auth?invite=${invite?.code}`)}
              >
                Sign in to continue
              </button>
            </div>
          ) : hasOrganization ? (
            <p className={`${messageStyles} mt-6 border-amber-200 bg-amber-50 text-amber-600`}>
              You already belong to an organization. Leave your current workspace or ask an admin to transfer you before
              accepting new invites.
            </p>
          ) : (
            <button
              disabled={!canAccept || isExpired || inviteStatus !== 'pending'}
              onClick={handleAccept}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-7 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAccepting ? 'Accepting invitation...' : 'Accept invitation'}
            </button>
          )}
        </section>

        <button
          onClick={() => (postAuthRedirect ? navigate('/onboarding') : navigate('/auth'))}
          className="self-center text-sm font-semibold text-[#1d4ed8] underline-offset-4 hover:underline"
        >
          Need to switch accounts?
        </button>
      </main>
    </div>
  )
}

export default JoinInvitationPage
