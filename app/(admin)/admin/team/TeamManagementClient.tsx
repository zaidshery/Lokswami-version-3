'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy, KeyRound, Loader2, Search, ShieldCheck, ShieldOff, Trash2, Upload, UserPlus, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatUserRoleLabel, type AdminRole } from '@/lib/auth/roles';
import { formatUiDateTime } from '@/lib/utils/dateFormat';
import { uploadAuthorProfileImage } from '@/lib/utils/authorProfileImageUpload';
import AccountDirectoryTabs from '@/components/admin/AccountDirectoryTabs';

type TeamMember = {
  id: string;
  name: string;
  email: string;
  image: string;
  role: AdminRole;
  loginId: string;
  isActive: boolean;
  credentialStatus: 'password_ready' | 'setup_pending' | 'setup_expired' | 'credentials_not_set';
  passwordSetAt: string | null;
  setupExpiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Never';
  }

  return formatUiDateTime(value, 'Never');
}

function getInitials(name: string, email: string) {
  const source = name.trim() || email.trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }

  return (parts[0]?.slice(0, 2) || 'TM').toUpperCase();
}

function getRoleManagementNote(viewerRole: AdminRole) {
  return viewerRole === 'super_admin'
    ? 'Super admin can manage every newsroom role, including super admin ownership.'
    : 'Admin can manage newsroom users, but cannot create or edit super-admin accounts.';
}

function getRoleScopeLine(viewerRole: AdminRole) {
  return viewerRole === 'super_admin'
    ? 'Super Admin, Admin, Reporter, Copy Editor'
    : 'Admin, Reporter, Copy Editor';
}

export default function TeamManagementClient({
  assignableRoles,
  viewerRole,
}: {
  assignableRoles: AdminRole[];
  viewerRole: AdminRole;
}) {
  const adminRoleOptions = useMemo(
    () =>
      assignableRoles.map((nextRole) => ({
        value: nextRole,
        label: formatUserRoleLabel(nextRole),
      })),
    [assignableRoles]
  );
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [profilePhotoUploadingId, setProfilePhotoUploadingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>(assignableRoles[0] || 'reporter');
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [linkActionMemberId, setLinkActionMemberId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [linkFallback, setLinkFallback] = useState<{ href: string; actionLabel: string } | null>(null);

  useEffect(() => {
    void fetchMembers();
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setToastMessage(''), 2400);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  function credentialTone(status: TeamMember['credentialStatus']) {
    switch (status) {
      case 'password_ready':
        return 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
      case 'setup_pending':
        return 'border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300';
      case 'setup_expired':
        return 'border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300';
      case 'credentials_not_set':
      default:
        return 'border border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300';
    }
  }

  function credentialLabel(status: TeamMember['credentialStatus']) {
    switch (status) {
      case 'password_ready':
        return 'Password Ready';
      case 'setup_pending':
        return 'Setup Pending';
      case 'setup_expired':
        return 'Setup Expired';
      case 'credentials_not_set':
      default:
        return 'No Password';
    }
  }

  async function fetchMembers() {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/team', { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load team members');
      }

      const nextMembers = (Array.isArray(payload.data) ? payload.data : []) as TeamMember[];
      setMembers(nextMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team members');
    } finally {
      setIsLoading(false);
    }
  }

  async function deliverSetupLink(input: {
    setupLink: string;
    copiedMessage: string;
    fallbackMessage: string;
    actionLabel: string;
  }) {
    setLinkFallback(null);

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(input.setupLink);
        setToastMessage(input.copiedMessage);
        return;
      } catch {
        // Clipboard writes can fail in unfocused tabs/windows. Fall back to a manual open link.
      }
    }

    setLinkFallback({
      href: input.setupLink,
      actionLabel: input.actionLabel,
    });
    setToastMessage(input.fallbackMessage);
  }

  async function handleInvite() {
    setIsInviting(true);
    setError('');
    setLinkFallback(null);

    try {
      const response = await fetch('/api/admin/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, role }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to invite member');
      }

      const setupLink = typeof payload?.data?.setupLink === 'string' ? payload.data.setupLink : '';
      const setupEmailSent = payload?.data?.setupEmailSent === true;

      if (setupEmailSent) {
        setToastMessage('Invite email sent securely to the user.');
      } else if (setupLink) {
        await deliverSetupLink({
          setupLink,
          copiedMessage: 'Member added. Setup link copied.',
          fallbackMessage: 'Member added. Clipboard was blocked, so the setup page link is ready below.',
          actionLabel: 'Open setup page',
        });
      } else {
        setToastMessage('Member added.');
      }

      setName('');
      setEmail('');
      setRole(assignableRoles[0] || 'reporter');
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      setIsInviting(false);
    }
  }

  async function updateMember(id: string, updates: Partial<Pick<TeamMember, 'role' | 'isActive' | 'name' | 'image'>>) {
    setActiveMemberId(id);
    setError('');

    try {
      const response = await fetch(`/api/admin/team/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update member');
      }

      setToastMessage('Member updated');
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member');
    } finally {
      setActiveMemberId(null);
    }
  }

  async function demoteMember(id: string) {
    setActiveMemberId(id);
    setError('');

    try {
      const response = await fetch(`/api/admin/team/${id}`, {
        method: 'DELETE',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to remove member');
      }

      setToastMessage('Member moved to reader');
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setActiveMemberId(null);
    }
  }

  async function uploadMemberPhoto(memberId: string, file: File) {
    setError('');
    setProfilePhotoUploadingId(memberId);
    try {
      const image = await uploadAuthorProfileImage(file);
      await updateMember(memberId, { image });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload profile photo');
    } finally {
      setProfilePhotoUploadingId(null);
    }
  }

  async function generateSetupLink(member: TeamMember) {
    setLinkActionMemberId(member.id);
    setError('');
    setLinkFallback(null);

    try {
      const response = await fetch(`/api/admin/team/${member.id}/setup-link`, {
        method: 'POST',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to generate setup link');
      }

      const setupLink = typeof payload?.data?.setupLink === 'string' ? payload.data.setupLink : '';
      const setupEmailSent = payload?.data?.setupEmailSent === true;

      if (!setupLink) {
        throw new Error('Setup link was not generated');
      }

      if (setupEmailSent) {
        setToastMessage('Invite email sent securely to the user.');
      } else {
        const isResetFlow = member.credentialStatus === 'password_ready';
        await deliverSetupLink({
          setupLink,
          copiedMessage: isResetFlow ? 'Password reset link copied.' : 'Setup link copied.',
          fallbackMessage: isResetFlow
            ? 'Clipboard was blocked, so the password reset link is ready below.'
            : 'Clipboard was blocked, so the setup link is ready below.',
          actionLabel: isResetFlow ? 'Open reset page' : 'Open setup page',
        });
      }
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate setup link');
    } finally {
      setLinkActionMemberId(null);
    }
  }

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.email.localeCompare(b.email)),
    [members]
  );
  const visibleMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sortedMembers;
    return sortedMembers.filter((member) =>
      [member.name, member.email, member.loginId, formatUserRoleLabel(member.role), credentialLabel(member.credentialStatus)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, sortedMembers]);
  const activeMemberCount = members.filter((member) => member.isActive).length;
  const setupRequiredCount = members.filter((member) => member.credentialStatus !== 'password_ready').length;

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-4 sm:space-y-5">
      <AccountDirectoryTabs active="newsroom" />

      <div className="admin-shell-surface-strong rounded-[20px] p-4 sm:rounded-[24px] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
              Team Access
            </p>
            <h1 className="mt-1 text-2xl font-black text-[color:var(--admin-shell-text)] sm:text-3xl">
              Team Members
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">
              Invite staff, review credential readiness, and manage newsroom access from one place.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <ShieldCheck className="mr-2 h-4 w-4" />
              <span>{viewerRole === 'super_admin' ? 'Leadership Access' : 'Admin Control'}</span>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen((current) => !current)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              aria-expanded={inviteOpen}
            >
              <UserPlus className="h-4 w-4" />
              {inviteOpen ? 'Close' : 'New Member'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="admin-shell-surface-muted rounded-[16px] p-3 sm:p-4">
            <div className="flex items-center gap-2 text-[color:var(--admin-shell-text-muted)]"><Users className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.14em]">Members</span></div>
            <p className="mt-2 text-2xl font-black text-[color:var(--admin-shell-text)]">{members.length}</p>
          </div>
          <div className="admin-shell-surface-muted rounded-[16px] p-3 sm:p-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.14em]">Active</span></div>
            <p className="mt-2 text-2xl font-black text-[color:var(--admin-shell-text)]">{activeMemberCount}</p>
          </div>
          <div className="admin-shell-surface-muted rounded-[16px] p-3 sm:p-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-300"><KeyRound className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.14em]">Setup needed</span></div>
            <p className="mt-2 text-2xl font-black text-[color:var(--admin-shell-text)]">{setupRequiredCount}</p>
          </div>
        </div>

        {inviteOpen ? <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_220px_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name (optional)"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-red-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@example.com"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-red-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as AdminRole)}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-red-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {adminRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleInvite()}
            disabled={isInviting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            <span>{isInviting ? 'Adding...' : 'Invite Team Member'}</span>
          </button>
        </div> : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {linkFallback ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
            <p>
              Clipboard access was blocked in this browser tab. Use the secure link below instead.
            </p>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="truncate rounded-xl border border-blue-200/80 bg-white/70 px-3 py-2 font-medium text-blue-900 dark:border-blue-400/20 dark:bg-zinc-950/70 dark:text-blue-100">
                {linkFallback.href}
              </p>
              <a
                href={linkFallback.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700"
              >
                {linkFallback.actionLabel}
              </a>
            </div>
          </div>
        ) : null}

        <details className="admin-shell-surface-muted group mt-4 rounded-[16px]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[color:var(--admin-shell-text)] [&::-webkit-details-marker]:hidden">
            Access policy and staff login guidance
            <ChevronDown className="h-4 w-4 text-[color:var(--admin-shell-text-muted)] transition-transform group-open:rotate-180" />
          </summary>
        <div className="grid gap-4 border-t border-[color:var(--admin-shell-border)] p-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Role Boundary
            </p>
            <p className="mt-2 font-semibold text-zinc-900 dark:text-zinc-100">
              {getRoleManagementNote(viewerRole)}
            </p>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Roles visible in this panel: {getRoleScopeLine(viewerRole)}.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Staff Login Flow
            </p>
            <p className="mt-2 font-semibold text-zinc-900 dark:text-zinc-100">
              Generate setup or reset link, set password, then sign in from `/signin?redirect=/admin`.
            </p>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Staff can log in with either their login ID or email after setup is complete.
            </p>
          </div>
        </div>
        </details>
      </div>

      <section className="admin-shell-surface-strong rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[color:var(--admin-shell-text)]">Newsroom directory</h2>
            <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">Search staff, review setup state, or open access controls.</p>
          </div>
          <label className="relative block w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--admin-shell-text-muted)]" />
            <span className="sr-only">Search team members</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, role..." className="w-full rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface)] py-2.5 pl-10 pr-4 text-sm text-[color:var(--admin-shell-text)] outline-none placeholder:text-[color:var(--admin-shell-text-muted)] focus:border-red-500/50" />
          </label>
        </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center rounded-3xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <Loader2 className="h-6 w-6 animate-spin text-red-500" />
          </div>
        ) : visibleMembers.length === 0 ? (
          <div className="col-span-full rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
            {query ? 'No team members match this search.' : 'No team members found yet.'}
          </div>
        ) : (
          visibleMembers.map((member, index) => {
            const isBusy = activeMemberId === member.id;
            const isGeneratingLink = linkActionMemberId === member.id;

            return (
              <motion.article
                key={member.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="admin-shell-surface-muted rounded-[16px] p-4 transition hover:border-red-500/20"
              >
                <div className="flex items-start gap-3">
                  <div className="relative inline-flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-full bg-red-100 text-xs font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                    {member.image ? (
                      <Image
                        src={member.image}
                        alt={member.name || member.email}
                        fill
                        sizes="44px"
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      getInitials(member.name, member.email)
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-zinc-900 dark:text-zinc-100">
                      {member.name || member.email.split('@')[0]}
                    </p>
                    <p className="truncate text-xs text-zinc-600 sm:text-sm dark:text-zinc-400">
                      {member.email}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex rounded-full border border-zinc-300 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
                        {formatUserRoleLabel(member.role)}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          member.isActive
                            ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                            : 'border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
                        }`}
                      >
                        {member.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${credentialTone(member.credentialStatus)}`}
                      >
                        {credentialLabel(member.credentialStatus)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Last login: {formatDateTime(member.lastLoginAt)}</span>
                  </div>
                  {member.setupExpiresAt ? (
                    <div>Setup link expires: {formatDateTime(member.setupExpiresAt)}</div>
                  ) : null}
                </div>

                <details className="group mt-3 rounded-xl border border-zinc-300/80 dark:border-zinc-700">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden dark:text-zinc-100">
                    <span>Manage access</span>
                    <ChevronDown className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 border-t border-zinc-200/80 p-3 dark:border-zinc-800">
                    <div>
                      <div>
                        <span className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Profile photo</span>
                        <label htmlFor={`team-profile-photo-${member.id}`} className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-white px-3 py-2.5 text-sm transition hover:border-red-400 hover:bg-red-50/30 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
                            <Upload className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span>
                            <span className="block font-semibold text-zinc-900 dark:text-zinc-100">{profilePhotoUploadingId === member.id ? 'Uploading photo...' : 'Choose a profile photo'}</span>
                            <span className="block text-[11px] font-normal text-zinc-500">JPG, PNG, or WEBP · Maximum 5MB</span>
                          </span>
                        </label>
                        <input
                          id={`team-profile-photo-${member.id}`}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={profilePhotoUploadingId === member.id || isBusy}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) void uploadMemberPhoto(member.id, file);
                          }}
                          className="sr-only"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void updateMember(member.id, { image: '' })}
                        disabled={isBusy}
                        className="mt-2 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Remove photo
                      </button>
                    </div>
                    <select
                      value={member.role}
                      onChange={(event) =>
                        void updateMember(member.id, { role: event.target.value as AdminRole })
                      }
                      disabled={isBusy}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-red-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      {adminRoleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => void generateSetupLink(member)}
                        disabled={isGeneratingLink}
                        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 px-2 py-2.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {isGeneratingLink ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        <span>{member.credentialStatus === 'password_ready' ? 'Reset' : 'Setup'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void updateMember(member.id, { isActive: !member.isActive })}
                        disabled={isBusy}
                        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 px-2 py-2.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : member.isActive ? (
                          <ShieldOff className="h-4 w-4" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        <span>{member.isActive ? 'Off' : 'On'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void demoteMember(member.id)}
                        disabled={isBusy}
                        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-red-200 px-2 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                </details>
              </motion.article>
            );
          })
        )}
      </div>
      </section>

      {toastMessage ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-lg dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}


