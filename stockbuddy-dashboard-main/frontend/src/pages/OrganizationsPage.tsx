import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Mail, RefreshCcw, UserCheck, UsersRound } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import {
  cancelOrganizationInvitation,
  createOrganizationInvitation,
  listOrganizationInvitations,
  listOrganizationMembers
} from '../api/organizations'
import LoadingScreen from '../components/LoadingScreen'
import { useSession } from '../context/SessionContext'

type InviteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

const OrganizationsPage = () => {
  const { status, token, organization } = useSession()
  const [members, setMembers] = useState<
    Array<{
      id: string
      name: string
      email: string
      role: string
      joinedAt: string
    }>
  >([])
  const [invitations, setInvitations] = useState<
    Array<{
      code: string
      email: string
      status: string
      createdAt: string
      expiresAt: string | null
    }>
  >([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteState, setInviteState] = useState<InviteState>({ status: 'idle' })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const inviteSectionRef = useRef<HTMLDivElement | null>(null)

  const inviteLinkBase = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.location.origin.replace(/\/$/, '')
  }, [])

  const loadData = useCallback(async () => {
    if (!token) {
      setLoadError('Session expired. Please sign in again.')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(null)

    const [membersResult, invitationsResult] = await Promise.all([
      listOrganizationMembers(token),
      listOrganizationInvitations(token)
    ])

    if (!membersResult.ok) {
      setLoadError(membersResult.error)
      setIsLoading(false)
      return
    }

    if (!invitationsResult.ok) {
      setLoadError(invitationsResult.error)
      setIsLoading(false)
      return
    }

    setMembers(
      membersResult.data.members.map(item => ({
        id: item.user_id,
        name: item.user?.full_name ?? item.user?.email ?? 'Pending user',
        email: item.user?.email ?? '—',
        role: item.role,
        joinedAt: item.joined_at
      }))
    )

    setInvitations(
      invitationsResult.data.invitations.map(invite => ({
        code: invite.code,
        email: invite.email,
        status: invite.status,
        createdAt: invite.created_at,
        expiresAt: invite.expires_at
      }))
    )

    setIsLoading(false)
  }, [token])

  const copyInviteLink = async (code: string) => {
    if (typeof navigator === 'undefined') return
    const link = `${inviteLinkBase}/join/${code}`
    try {
      await navigator.clipboard.writeText(link)
      setInviteState({ status: 'success', message: 'Invitation link copied to clipboard.' })
    } catch {
      setInviteState({ status: 'error', message: 'Unable to copy. Please copy the link manually.' })
    }
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    loadData()
  }, [loadData, status])

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) {
      setInviteState({ status: 'error', message: 'Session expired. Please sign in again.' })
      return
    }
    const email = inviteEmail.trim()
    if (!email.length) {
      setInviteState({ status: 'error', message: 'Enter an email to send an invitation.' })
      return
    }

    setInviteState({ status: 'loading' })
    const result = await createOrganizationInvitation(token, { email })
    if (!result.ok) {
      setInviteState({ status: 'error', message: result.error })
      return
    }

    setInviteEmail('')
    setInviteState({ status: 'success', message: 'Invitation sent successfully.' })
    await loadData()
  }

  const handleCancelInvite = async (code: string) => {
    if (!token) {
      setInviteState({ status: 'error', message: 'Session expired. Please sign in again.' })
      return
    }
    setInviteState({ status: 'loading' })
    const result = await cancelOrganizationInvitation(token, code)
    if (!result.ok) {
      setInviteState({ status: 'error', message: result.error })
      return
    }
    setInviteState({ status: 'success', message: 'Invitation cancelled.' })
    await loadData()
  }

  const header = (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#cbd6ff] bg-white/80 px-4 py-1.5 text-xs font-semibold text-[#1d4ed8] shadow-sm">
        <UsersRound className="h-4 w-4" />
        Team operations board
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.45em] text-[#8aa0ff]">Members</p>
        <h1 className="mt-2 text-4xl font-semibold text-slate-900">
          Keep every operator and reseller aligned.
        </h1>
        <p className="mt-3 max-w-xl text-base text-slate-500">
          Invite teammates, watch pending access, and keep your StockBuddy workspace ready for the next release window.
        </p>
      </div>
      {organization && (
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100/70 px-3 py-1 text-xs font-semibold text-indigo-600">
          <UserCheck className="h-3.5 w-3.5" />
          {organization.name} · {members.length} members
        </div>
      )}
    </div>
  )

  if (status === 'checking' || isLoading) {
    return <LoadingScreen label="Syncing your team..." />
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#eef3ff] via-white to-[#f5f7ff] text-slate-900">
        <div className="max-w-lg rounded-[32px] border border-white/70 bg-white p-10 text-center shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
          <h1 className="text-3xl font-semibold">We hit a snag</h1>
          <p className="mt-3 text-sm text-slate-500">{loadError}</p>
          <button
            onClick={() => loadData()}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl"
          >
            <RefreshCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout
      header={header}
      headerActions={
        <button
          type="button"
          onClick={() => inviteSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl"
        >
          Invite&nbsp;teammate
        </button>
      }
    >
      <div className="space-y-10">
        <section
          ref={inviteSectionRef}
          className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]"
        >
          <div className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_32px_80px_rgba(15,23,42,0.1)]">
            <h2 className="text-xl font-semibold text-slate-900">Send an invitation</h2>
            <p className="mt-1 text-sm text-slate-500">
              Teammates receive an email with a secure link. Invitations expire automatically after seven days.
            </p>

            <form className="mt-5 flex flex-col gap-4 md:flex-row" onSubmit={handleInviteSubmit}>
              <label className="flex flex-1 flex-col gap-2 text-sm font-semibold text-slate-600">
                Email address
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={event => setInviteEmail(event.target.value)}
                  placeholder="teammate@club.com"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-medium text-slate-900 shadow focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/20"
                />
              </label>
              <button
                type="submit"
                disabled={inviteState.status === 'loading'}
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
              >
                {inviteState.status === 'loading' ? 'Sending...' : 'Send invite'}
              </button>
            </form>

            {inviteState.status === 'error' && (
              <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                {inviteState.message}
              </p>
            )}
            {inviteState.status === 'success' && (
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-600">
                {inviteState.message}
              </p>
            )}
          </div>

          <div className="rounded-[28px] border border-white/70 bg-gradient-to-br from-[#1d4ed8] via-[#1b45c8] to-[#0f2f84] p-6 text-white shadow-[0_32px_80px_rgba(29,78,216,0.45)]">
            <h3 className="text-xl font-semibold">Workspace access rituals</h3>
            <p className="mt-2 text-sm text-white/80">
              Create a repeatable onboarding moment for every operator that joins {organization?.name ?? 'your org'}.
            </p>
            <ul className="mt-4 space-y-3 text-sm text-white/80">
              <li>• Brief them on your trading cadence and escalation paths.</li>
              <li>• Add them to your StockBuddy playbook distribution list.</li>
              <li>• Use invite links for partners or contracted teams.</li>
            </ul>
            <button
              type="button"
              className="mt-6 inline-flex items-center justify-center rounded-full border border-white/30 bg-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/20"
            >
              Download onboarding checklist
            </button>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_32px_80px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Active members</h2>
              <p className="text-sm text-slate-500">Operators and partners with access to this workspace.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              <UserCheck className="h-4 w-4" />
              {members.length} total members
            </span>
          </div>

          <div className="mt-6 overflow-hidden rounded-[22px] border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                {members.map(member => (
                  <tr key={member.id} className="transition hover:bg-indigo-50/40">
                    <td className="px-5 py-4 font-semibold text-slate-900">{member.name}</td>
                    <td className="px-5 py-4">{member.email}</td>
                    <td className="px-5 py-4 capitalize text-slate-500">
                      {(member.role ?? 'member').toLowerCase()}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {new Date(member.joinedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-sm text-slate-400">
                      No members yet. Invite your first teammate above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_32px_80px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Pending invitations</h2>
              <p className="text-sm text-slate-500">Track outstanding invites and follow up when needed.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100/80 px-3 py-1 text-xs font-semibold text-indigo-600">
              <Mail className="h-4 w-4" />
              {invitations.length} invites out
            </span>
          </div>

          <div className="mt-6 overflow-hidden rounded-[22px] border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Expires</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                {invitations.map(invite => (
                  <tr key={invite.code} className="transition hover:bg-indigo-50/40">
                    <td className="px-5 py-4 font-semibold text-slate-900">{invite.email}</td>
                    <td className="px-5 py-4 capitalize text-slate-500">{invite.status}</td>
                    <td className="px-5 py-4 text-slate-500">
                      {new Date(invite.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {invite.expiresAt
                        ? new Date(invite.expiresAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })
                        : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => copyInviteLink(invite.code)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 transition hover:border-[#2563eb] hover:text-[#2563eb]"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy link
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelInvite(invite.code)}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-600 transition hover:bg-rose-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {invitations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-sm text-slate-400">
                      No pending invitations. Everyone who needs access is in.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}

export default OrganizationsPage
