'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Download,
  Filter,
  Loader2,
  MessageSquare,
  Newspaper,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { formatUserRoleLabel, type AdminRole, type UserRole } from '@/lib/auth/roles';
import { formatUiDate, formatUiDateTime } from '@/lib/utils/dateFormat';
import { useToast } from '@/components/ui/toast/useToast';
import FormSwitch from '@/components/ui/form/FormSwitch';
import Modal from '@/components/ui/modal/Modal';
import ConfirmModal from '@/components/ui/modal/ConfirmModal';
import AccountDirectoryTabs from '@/components/admin/AccountDirectoryTabs';

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  whatsappNumber: string | null;
  role: UserRole;
  isActive: boolean;
  optInDailyEpaper: boolean;
  preferredLanguage: string;
  readCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export default function UsersManagementClient({ viewerRole }: { viewerRole: AdminRole }) {
  const toast = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'subscribers' | 'active' | 'inactive' | 'staff'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Role edit modal state
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('reader');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Status toggle confirmation
  const [pendingStatusUser, setPendingStatusUser] = useState<ManagedUser | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });

      if (searchQuery.trim()) {
        params.set('query', searchQuery.trim());
      }

      if (filterTab === 'subscribers') {
        params.set('epaper', 'opted_in');
      } else if (filterTab === 'active') {
        params.set('status', 'active');
      } else if (filterTab === 'inactive') {
        params.set('status', 'inactive');
      } else if (filterTab === 'staff') {
        params.set('role', 'staff');
      }

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const json = await res.json();

      if (json.success && json.data) {
        setUsers(json.data.users || []);
        setTotalPages(json.data.pagination?.totalPages || 1);
        setTotalCount(json.data.pagination?.total || 0);
      } else {
        toast.error('Failed to load users list.', 'Error');
      }
    } catch {
      toast.error('Network error loading users.', 'Error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
  }, [page, filterTab]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchUsers();
  };

  const handleToggleStatus = async (user: ManagedUser) => {
    const nextStatus = !user.isActive;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          isActive: nextStatus,
        }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success(
          `User ${user.name} is now ${nextStatus ? 'active' : 'inactive'}.`,
          'Status Updated'
        );
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, isActive: nextStatus } : u))
        );
      } else {
        toast.error(json.error || 'Failed to update user status.', 'Error');
      }
    } catch {
      toast.error('Network error updating status.', 'Error');
    } finally {
      setPendingStatusUser(null);
    }
  };

  const handleSaveRole = async () => {
    if (!editingUser) return;
    setIsUpdatingRole(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          role: selectedRole,
        }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success(
          `Role for ${editingUser.name} updated to ${formatUserRoleLabel(selectedRole)}.`,
          'Role Updated'
        );
        setUsers((prev) =>
          prev.map((u) => (u.id === editingUser.id ? { ...u, role: selectedRole } : u))
        );
        setEditingUser(null);
      } else {
        toast.error(json.error || 'Failed to update role.', 'Error');
      }
    } catch {
      toast.error('Network error updating role.', 'Error');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleExportCsv = () => {
    if (users.length === 0) return;

    const headers = ['Name', 'Email', 'WhatsApp Number', 'Role', 'Status', 'Daily E-Paper Opt-in', 'Joined Date'];
    const rows = users.map((u) => [
      `"${u.name.replace(/"/g, '""')}"`,
      `"${u.email}"`,
      `"${u.whatsappNumber || ''}"`,
      `"${u.role}"`,
      `"${u.isActive ? 'Active' : 'Inactive'}"`,
      `"${u.optInDailyEpaper ? 'Yes' : 'No'}"`,
      `"${u.createdAt ? formatUiDate(u.createdAt, 'N/A') : 'N/A'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `lokswami_users_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const subscriberCount = useMemo(() => {
    return users.filter((u) => u.optInDailyEpaper).length;
  }, [users]);

  return (
    <div className="space-y-6">
      <AccountDirectoryTabs active="readers" />

      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 sm:text-3xl">
            User & Subscriber Management
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            View registered readers, manage WhatsApp daily e-paper subscribers, and control editorial roles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={users.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-xs transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => void fetchUsers()}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-xs transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <Users className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Total Users</span>
          </div>
          <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">{totalCount}</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <Newspaper className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">WhatsApp Subscribers</span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-900 dark:text-emerald-300">{subscriberCount}</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <UserCheck className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Active</span>
          </div>
          <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
            {users.filter((u) => u.isActive).length}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Editorial Staff</span>
          </div>
          <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
            {users.filter((u) => u.role !== 'reader').length}
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-2xl bg-zinc-100 p-1.5 dark:bg-zinc-800">
          {[
            { key: 'all', label: 'All Users' },
            { key: 'subscribers', label: 'WhatsApp E-Paper' },
            { key: 'active', label: 'Active' },
            { key: 'inactive', label: 'Inactive' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setFilterTab(tab.key as typeof filterTab);
                setPage(1);
              }}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                filterTab === tab.key
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="relative flex min-w-[260px] items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-20 text-xs text-zinc-900 shadow-xs transition placeholder:text-zinc-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <button
            type="submit"
            className="absolute right-1 inline-flex h-8 items-center justify-center rounded-lg bg-red-600 px-3 text-[11px] font-bold text-white transition hover:bg-red-700"
          >
            Search
          </button>
        </form>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        {isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-red-600" />
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Loading users...
            </span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 p-6 text-center">
            <Users className="h-8 w-8 text-zinc-400" />
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">No users found</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Try adjusting your search query or filter tab.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50/75 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                <tr>
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-4 py-3.5">WhatsApp Number</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Daily E-Paper</th>
                  <th className="px-4 py-3.5">Joined</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {users.map((user) => (
                  <tr key={user.id} className="transition hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                            {user.name}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      {user.whatsappNumber ? (
                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                          <MessageSquare className="h-3 w-3 fill-current" />
                          <span className="font-medium">{user.whatsappNumber}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-600">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          user.role === 'super_admin'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                            : user.role === 'admin'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                            : user.role === 'copy_editor'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : user.role === 'reporter'
                            ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                            : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {formatUserRoleLabel(user.role)}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      {user.optInDailyEpaper ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                          <CheckCircle className="h-3 w-3" />
                          <span>Subscribed</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">Not opted</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-zinc-500 dark:text-zinc-400">
                      {user.createdAt ? formatUiDate(user.createdAt, '—') : '—'}
                    </td>

                    <td className="px-4 py-3.5">
                      <FormSwitch
                        checked={user.isActive}
                        onChange={() => setPendingStatusUser(user)}
                      />
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUser(user);
                          setSelectedRole(user.role);
                        }}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Change Role
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <span>
            Page {page} of {totalPages} ({totalCount} users)
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-semibold transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-semibold transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Role Change Modal */}
      {editingUser && (
        <Modal
          isOpen={Boolean(editingUser)}
          onClose={() => setEditingUser(null)}
          title={`Update Role for ${editingUser.name}`}
          description="Assign permissions and dashboard access levels."
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Select Role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="reader">Reader / Subscriber</option>
                <option value="reporter">Reporter</option>
                <option value="copy_editor">Copy Editor / Sub-Editor</option>
                <option value="admin">Admin</option>
                {viewerRole === 'super_admin' && (
                  <option value="super_admin">Super Admin</option>
                )}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingRole}
                onClick={handleSaveRole}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isUpdatingRole && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Update Role</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Status Toggle Confirmation */}
      {pendingStatusUser && (
        <ConfirmModal
          isOpen={Boolean(pendingStatusUser)}
          onClose={() => setPendingStatusUser(null)}
          onConfirm={() => handleToggleStatus(pendingStatusUser)}
          title={pendingStatusUser.isActive ? 'Deactivate User Account?' : 'Activate User Account?'}
          message={`Are you sure you want to ${
            pendingStatusUser.isActive ? 'deactivate' : 'activate'
          } ${pendingStatusUser.name}? ${
            pendingStatusUser.isActive
              ? 'They will no longer be able to log in or access their account.'
              : 'They will be granted immediate access to sign in.'
          }`}
          confirmLabel={pendingStatusUser.isActive ? 'Deactivate' : 'Activate'}
          variant={pendingStatusUser.isActive ? 'danger' : 'primary'}
        />
      )}
    </div>
  );
}
