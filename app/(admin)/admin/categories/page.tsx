"use client";

import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  FolderTree,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  CmsCollectionHero,
  CmsCollectionMetricCard,
  CmsCollectionMetricGrid,
  CmsCollectionPage,
  CMS_COLLECTION_DANGER_BUTTON_CLASS as DANGER_BUTTON_CLASS,
  CMS_COLLECTION_EMPTY_STATE_CLASS as EMPTY_STATE_CLASS,
  CMS_COLLECTION_FILTER_INPUT_CLASS as FILTER_INPUT_CLASS,
  CMS_COLLECTION_META_CHIP_CLASS as META_CHIP_CLASS,
  CMS_COLLECTION_PANEL_CLASS as PANEL_CLASS,
  CMS_COLLECTION_PRIMARY_BUTTON_CLASS as PRIMARY_BUTTON_CLASS,
  CMS_COLLECTION_SECONDARY_BUTTON_CLASS as SECONDARY_BUTTON_CLASS,
} from '@/components/admin/CmsCollectionLayout';
import { getAuthHeader } from '@/lib/auth/clientToken';
import { isDefaultCategorySlug } from '@/lib/constants/newsCategories';

interface CategoryItem {
  _id: string;
  name: string;
  description?: string;
  slug?: string;
  icon?: string;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function CategoriesPage() {
  const [cats, setCats] = useState<CategoryItem[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchCats = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/categories');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load categories');
      setCats(Array.isArray(data.data) ? data.data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCats();
  }, [fetchCats]);

  const filteredCats = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return cats;

    return cats.filter((cat) =>
      [cat.name, cat.slug, cat.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [cats, query]);

  const defaultCount = useMemo(
    () => cats.filter((cat) => isDefaultCategorySlug(cat.slug)).length,
    [cats]
  );

  const create = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError('');

    const nextName = name.trim();
    const nextDescription = desc.trim();

    if (!nextName) {
      setError('Name required');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ name: nextName, description: nextDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create category');

      setName('');
      setDesc('');
      await fetchCats();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    const target = cats.find((c) => c._id === id);
    if (target && isDefaultCategorySlug(target.slug)) {
      setError('System categories cannot be deleted');
      return;
    }

    if (!confirm('Delete category?')) return;

    setDeletingId(id);
    setError('');

    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete category');

      await fetchCats();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <CmsCollectionPage className="space-y-6">
      <CmsCollectionHero
        accent="amber"
        eyebrow="Taxonomy"
        title="Categories"
        description="Keep reader sections, article dropdowns, and public category pages aligned from one CMS surface."
        meta={
          <>
            <span className={META_CHIP_CLASS}>Total {cats.length}</span>
            <span className={META_CHIP_CLASS}>System {defaultCount}</span>
            <span className={META_CHIP_CLASS}>Custom {Math.max(cats.length - defaultCount, 0)}</span>
          </>
        }
        aside={
          <form onSubmit={create} className={cx(PANEL_CLASS, 'space-y-4 p-4 sm:p-6')}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-shell-text-muted)]">
                New Category
              </p>
              <div className="mt-4 grid gap-3">
                <label className="sr-only" htmlFor="category-name">
                  Category name
                </label>
                <input
                  id="category-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Category name"
                  className={FILTER_INPUT_CLASS}
                />
                <label className="sr-only" htmlFor="category-description">
                  Description
                </label>
                <input
                  id="category-description"
                  value={desc}
                  onChange={(event) => setDesc(event.target.value)}
                  placeholder="Description"
                  className={FILTER_INPUT_CLASS}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={saving || loading}
                className={cx(PRIMARY_BUTTON_CLASS, 'w-full disabled:cursor-not-allowed disabled:opacity-60')}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {saving ? 'Creating' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => void fetchCats()}
                disabled={loading}
                className={cx(SECONDARY_BUTTON_CLASS, 'w-full disabled:cursor-not-allowed disabled:opacity-60')}
              >
                <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
                Refresh
              </button>
            </div>
          </form>
        }
      />

      {error ? (
        <div className="flex items-start gap-2 rounded-[20px] border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <CmsCollectionMetricGrid className="grid-cols-2 md:grid-cols-4 xl:grid-cols-4">
        <CmsCollectionMetricCard label="Total" value={cats.length} />
        <CmsCollectionMetricCard label="System" value={defaultCount} />
        <CmsCollectionMetricCard label="Custom" value={Math.max(cats.length - defaultCount, 0)} />
        <CmsCollectionMetricCard label="Visible" value={filteredCats.length} />
      </CmsCollectionMetricGrid>

      <section className={cx(PANEL_CLASS, 'p-4 sm:p-6')}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search categories..."
            className={cx(FILTER_INPUT_CLASS, 'pl-11')}
          />
        </div>
      </section>

      {loading && cats.length === 0 ? (
        <div className={cx(PANEL_CLASS, 'flex items-center justify-center py-16')}>
          <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-300" />
        </div>
      ) : filteredCats.length === 0 ? (
        <div className={EMPTY_STATE_CLASS}>
          {query ? 'No categories match this search.' : 'No categories have been created yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredCats.map((cat, index) => {
            const isSystemCategory = isDefaultCategorySlug(cat.slug);

            return (
              <motion.article
                key={cat._id || cat.slug || cat.name}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.025 }}
                className="admin-shell-surface-strong rounded-[24px] p-4 shadow-[0_22px_70px_-48px_rgba(15,23,42,0.18)] sm:rounded-[30px] sm:p-5 dark:shadow-[0_26px_76px_-46px_rgba(0,0,0,0.42)]"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                        <FolderTree className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold tracking-tight text-[color:var(--admin-shell-text)]">
                          {cat.name}
                        </h2>
                        <p className="mt-1 break-all text-xs text-[color:var(--admin-shell-text-muted)]">
                          {cat.slug || 'slug pending'}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 line-clamp-2 text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">
                      {cat.description || 'No description added'}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                    <span className={META_CHIP_CLASS}>{isSystemCategory ? 'System' : 'Custom'}</span>
                    {!isSystemCategory ? (
                      <button
                        type="button"
                        onClick={() => void del(cat._id)}
                        disabled={deletingId === cat._id}
                        className={cx(DANGER_BUTTON_CLASS, 'px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60')}
                        aria-label={`Delete ${cat.name}`}
                      >
                        {deletingId === cat._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span className="sm:sr-only">Delete</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </CmsCollectionPage>
  );
}
