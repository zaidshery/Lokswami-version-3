'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, Eye, Search } from 'lucide-react';
import DateInputField from '@/components/ui/DateInputField';
import { getAuthHeader } from '@/lib/auth/clientToken';
import { canCreateEpaper, canDeleteEpaper } from '@/lib/auth/permissions';
import { normalizeAdminRole } from '@/lib/auth/roles';
import { EPAPER_CITY_OPTIONS } from '@/lib/constants/epaperCities';
import type { EPaperRecord } from '@/lib/types/epaper';
import {
  formatPublicationIssueLabel,
  getPublicationTypeLabels,
  normalizePublicationIssueMonth,
  resolveEPaperPublicationType,
} from '@/lib/utils/epaperPublication';

type ApiResponse = {
  success: boolean;
  error?: string;
  data?: EPaperRecord[];
};

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatProductionStatusLabel(status: string | null | undefined) {
  return String(status || 'draft_upload')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function productionTone(status: string | null | undefined) {
  switch (status) {
    case 'published':
      return 'bg-emerald-100 text-emerald-700';
    case 'ready_to_publish':
      return 'bg-blue-100 text-blue-700';
    case 'hotspot_mapping':
    case 'ocr_review':
    case 'pages_ready':
      return 'bg-amber-100 text-amber-700';
    case 'archived':
      return 'bg-zinc-200 text-zinc-700';
    default:
      return 'bg-zinc-100 text-zinc-700';
  }
}

export default function AdminEPaperListPage() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = normalizeAdminRole(session?.user?.role);
  const canCreatePublication = canCreateEpaper(role);
  const canDeletePublication = canDeleteEpaper(role);
  const publicationType = resolveEPaperPublicationType(
    pathname.startsWith('/admin/emagazines') ? 'emagazine' : 'epaper'
  );
  const labels = useMemo(
    () => getPublicationTypeLabels(publicationType),
    [publicationType]
  );
  const isMonthlyPublication = publicationType === 'emagazine';
  const [epapers, setEpapers] = useState<EPaperRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productionFilter, setProductionFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [deleteId, setDeleteId] = useState('');

  const fetchEpapers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        limit: 'all',
        publicationType,
      });
      const response = await fetch(`/api/admin/epapers?${query.toString()}`, {
        headers: {
          ...getAuthHeader(),
        },
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `Failed to load ${labels.lowercase}s`);
      }

      setEpapers(Array.isArray(payload.data) ? payload.data : []);
    } catch (err: unknown) {
      setError(toErrorMessage(err, `Failed to load ${labels.lowercase}s`));
      setEpapers([]);
    } finally {
      setLoading(false);
    }
  }, [labels.lowercase, publicationType]);

  useEffect(() => {
    void fetchEpapers();
  }, [fetchEpapers]);

  const filtered = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return epapers.filter((item) => {
      const cityMatch =
        isMonthlyPublication || cityFilter === 'all' || item.citySlug === cityFilter;
      const statusMatch = statusFilter === 'all' || item.status === statusFilter;
      const productionMatch =
        productionFilter === 'all' || item.productionStatus === productionFilter;
      const dateMatch =
        !dateFilter ||
        (isMonthlyPublication
          ? normalizePublicationIssueMonth(item.publishDate) === dateFilter
          : item.publishDate === dateFilter);
      const textMatch =
        !searchValue ||
        item.title.toLowerCase().includes(searchValue) ||
        (!isMonthlyPublication && item.cityName.toLowerCase().includes(searchValue));

      return cityMatch && statusMatch && productionMatch && dateMatch && textMatch;
    });
  }, [dateFilter, epapers, isMonthlyPublication, search, cityFilter, statusFilter, productionFilter]);

  const summary = useMemo(() => {
    return {
      total: epapers.length,
      readyToPublish: epapers.filter((item) => item.productionStatus === 'ready_to_publish').length,
      hotspotMapping: epapers.filter(
        (item) => item.productionStatus === 'hotspot_mapping'
      ).length,
      blocked: epapers.filter((item) => item.readiness?.status === 'not-ready').length,
    };
  }, [epapers]);

  const deletePaper = async (id: string) => {
    setError('');
    try {
      const response = await fetch(`/api/admin/epapers/${id}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeader(),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to delete ${labels.lowercase}`);
      }

      setEpapers((current) => current.filter((item) => item._id !== id));
      setDeleteId('');
    } catch (err: unknown) {
      setError(toErrorMessage(err, `Failed to delete ${labels.lowercase}`));
    }
  };

  return (
    <div className="space-y-6">
      <div className="admin-shell-surface-strong rounded-[28px] p-5 sm:rounded-[36px] sm:p-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-600">
            {isMonthlyPublication ? 'Issue Workflow' : 'Edition Workflow'}
          </p>
          <h1 className="mt-3 text-3xl font-black text-[color:var(--admin-shell-text)] sm:text-5xl">{labels.desk}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">
            Review pages, hotspot readiness, OCR status, and {isMonthlyPublication ? 'monthly issues' : 'editions'} moving toward admin release.
          </p>
        </div>

        {canCreatePublication ? (
          <Link
            href={`${labels.adminBasePath}/new`}
            className="admin-shell-toolbar-btn mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            New Upload
          </Link>
        ) : (
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
            Your copy-desk role can review pages, OCR, hotspots, and readiness. An Admin creates,
            publishes, archives, or deletes {isMonthlyPublication ? 'monthly issues' : 'editions'}.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="admin-shell-surface rounded-[22px] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]">
            {isMonthlyPublication ? 'Total issues' : 'Total editions'}
          </p>
          <p className="mt-2 text-2xl font-bold text-[color:var(--admin-shell-text)]">{summary.total}</p>
          <p className="mt-1 hidden text-xs text-[color:var(--admin-shell-text-muted)] sm:block">All draft and published {isMonthlyPublication ? 'monthly issue' : labels.lowercase} records.</p>
        </div>
        <div className="admin-shell-surface rounded-[22px] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]">Ready</p>
          <p className="mt-2 text-2xl font-bold text-blue-700">{summary.readyToPublish}</p>
          <p className="mt-1 hidden text-xs text-[color:var(--admin-shell-text-muted)] sm:block">{isMonthlyPublication ? 'Issues' : 'Editions'} that cleared the production desk.</p>
        </div>
        <div className="admin-shell-surface rounded-[22px] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]">Hotspot mapping</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">{summary.hotspotMapping}</p>
          <p className="mt-1 hidden text-xs text-[color:var(--admin-shell-text-muted)] sm:block">{isMonthlyPublication ? 'Issues' : 'Editions'} still mapping clickable stories.</p>
        </div>
        <div className="admin-shell-surface rounded-[22px] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]">Blocked</p>
          <p className="mt-2 text-2xl font-bold text-red-700">{summary.blocked}</p>
          <p className="mt-1 hidden text-xs text-[color:var(--admin-shell-text-muted)] sm:block">Readiness blockers still need work.</p>
        </div>
      </div>

      <div
        className={`admin-shell-surface-strong grid grid-cols-1 gap-3 rounded-[24px] p-4 ${
          isMonthlyPublication ? 'md:grid-cols-4' : 'md:grid-cols-5'
        }`}
      >
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-[color:var(--admin-shell-text-muted)]">Search</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={isMonthlyPublication ? 'Search by title' : 'Search by title or city'}
              aria-label={isMonthlyPublication ? 'Search by title' : 'Search by title or city'}
              className="w-full rounded-2xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface)] py-2 pl-9 pr-3 text-sm text-[color:var(--admin-shell-text)] outline-none focus:border-red-500"
            />
          </span>
        </label>

        {!isMonthlyPublication ? (
          <label>
            <span className="mb-1 block text-xs font-semibold text-[color:var(--admin-shell-text-muted)]">City</span>
            <select
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
              aria-label="Filter by city"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-600"
            >
              <option value="all">All cities</option>
              {EPAPER_CITY_OPTIONS.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          <span className="mb-1 block text-xs font-semibold text-[color:var(--admin-shell-text-muted)]">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
            className="w-full rounded-2xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface)] px-3 py-2 text-sm text-[color:var(--admin-shell-text)] outline-none focus:border-red-500"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs font-semibold text-[color:var(--admin-shell-text-muted)]">Production</span>
          <select
            value={productionFilter}
            onChange={(event) => setProductionFilter(event.target.value)}
            aria-label="Filter by production stage"
            className="w-full rounded-2xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface)] px-3 py-2 text-sm text-[color:var(--admin-shell-text)] outline-none focus:border-red-500"
          >
            <option value="all">All stages</option>
            <option value="draft_upload">Draft upload</option>
            <option value="pages_ready">Pages ready</option>
            <option value="ocr_review">OCR review</option>
            <option value="hotspot_mapping">Hotspot mapping</option>
            <option value="ready_to_publish">Ready to publish</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs font-semibold text-[color:var(--admin-shell-text-muted)]">{labels.issueFilterLabel}</span>
          {isMonthlyPublication ? (
            <input
              type="month"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              aria-label={labels.issueFilterLabel}
              className="w-full rounded-2xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface)] px-3 py-2 text-sm text-[color:var(--admin-shell-text)] outline-none focus:border-red-500"
            />
          ) : (
            <DateInputField
              value={dateFilter}
              onChange={setDateFilter}
              className="w-full rounded-2xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface)] px-3 py-2 text-sm text-[color:var(--admin-shell-text)] outline-none focus:border-red-500"
            />
          )}
        </label>
      </div>

      {error ? (
        <div role="alert" aria-live="assertive" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div role="status" aria-live="polite" className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
          <span className="sr-only">Loading {labels.plural.toLowerCase()}...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-shell-surface-strong rounded-[24px] px-5 py-12 text-center text-[color:var(--admin-shell-text-muted)]">
          No {labels.plural.toLowerCase()} found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((epaper) => {
            const pagesWithImage = epaper.pages.filter((page) => Boolean(page.imagePath)).length;
            const missingPages = Math.max(0, epaper.pageCount - pagesWithImage);
            const canOpenPublicView = epaper.status === 'published';
            const publicViewParams = new URLSearchParams({ paper: epaper._id });
            if (!isMonthlyPublication && epaper.citySlug) {
              publicViewParams.set('city', epaper.citySlug);
            }
            const readiness = epaper.readiness;
            const readinessLabel =
              readiness?.status === 'ready'
                ? 'Ready'
                : readiness?.status === 'needs-review'
                  ? 'Needs review'
                  : 'Not ready';

            return (
              <div
                key={epaper._id}
                className="admin-shell-surface-strong rounded-[24px] p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-[color:var(--admin-shell-text)]">{epaper.title}</h2>
                    <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">
                      {isMonthlyPublication
                        ? formatPublicationIssueLabel(epaper.publishDate, publicationType, epaper.publishDate)
                        : `${epaper.cityName} (${epaper.citySlug}) | ${formatPublicationIssueLabel(epaper.publishDate, publicationType, epaper.publishDate)}`}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">
                      {epaper.pageCount} pages | {pagesWithImage} with image | {missingPages} missing
                    </p>
                    {readiness ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            readiness.status === 'ready'
                              ? 'bg-emerald-100 text-emerald-700'
                              : readiness.status === 'needs-review'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {readinessLabel}
                        </span>
                        <span className="text-[11px] text-[color:var(--admin-shell-text-muted)]">
                          Hotspots {readiness.hotspotCoveragePercent}% | Text {readiness.textCoveragePercent}%
                        </span>
                        {epaper.automation?.sourceLabel ? (
                          <span className="text-[11px] text-[color:var(--admin-shell-text-muted)]">
                            Source: {epaper.automation.sourceLabel}
                          </span>
                        ) : null}
                        {epaper.productionAssignee ? (
                          <span className="text-[11px] text-[color:var(--admin-shell-text-muted)]">
                            Desk owner: {epaper.productionAssignee.name}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {epaper.revisionNumber && epaper.revisionNumber > 1 ? (
                      <div className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
                        Rev {epaper.revisionNumber}
                      </div>
                    ) : null}
                    {epaper.isCurrentRevision === false ? (
                      <div className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                        Historical
                      </div>
                    ) : null}
                    <div
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        epaper.status === 'published'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {epaper.status}
                    </div>
                    <div
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${productionTone(
                        epaper.productionStatus
                      )}`}
                    >
                      {formatProductionStatusLabel(epaper.productionStatus)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`${labels.adminBasePath}/${epaper._id}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Link>

                  <Link
                    href={`${labels.publicBasePath}?${publicViewParams.toString()}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold ${
                      canOpenPublicView
                        ? 'border-gray-300 bg-gray-100 text-gray-800 hover:bg-gray-200'
                        : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                    }`}
                    aria-disabled={!canOpenPublicView}
                    onClick={(event) => {
                      if (!canOpenPublicView) event.preventDefault();
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {canOpenPublicView ? 'View' : 'Publish to View'}
                  </Link>

                  {canDeletePublication && deleteId === epaper._id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void deletePaper(epaper._id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId('')}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </>
                  ) : canDeletePublication ? (
                    <button
                      type="button"
                      onClick={() => setDeleteId(epaper._id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
