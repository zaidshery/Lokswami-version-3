import { createElement, type ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CategoriesPage from '@/app/(admin)/admin/categories/page';
import {
  NEWS_CATEGORIES,
  CMS_READER_CATEGORIES,
  READER_CATEGORIES,
  DEFAULT_CMS_CATEGORIES,
  DEFAULT_CATEGORY_SLUGS,
  isDefaultCategorySlug,
} from '@/lib/constants/newsCategories';
import {
  findMissingDefaults,
  type CategoryRecord,
} from '@/lib/server/content/adminTaxonomyService';

vi.mock('framer-motion', () => ({
  motion: {
    article: ({ children, ...props }: ComponentProps<'article'>) => (
      createElement('article', props, children)
    ),
    div: ({ children, ...props }: ComponentProps<'div'>) => (
      createElement('div', props, children)
    ),
    section: ({ children, ...props }: ComponentProps<'section'>) => (
      createElement('section', props, children)
    ),
  },
}));

describe('CMS Category Classification & Default Seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Single source of truth contract', () => {
    it('ensures every READER_CATEGORIES item is in DEFAULT_CMS_CATEGORIES and DEFAULT_CATEGORY_SLUGS', () => {
      expect(READER_CATEGORIES.length).toBe(19);
      expect(DEFAULT_CMS_CATEGORIES.length).toBe(19);
      expect(DEFAULT_CATEGORY_SLUGS.size).toBe(19);

      for (const cat of READER_CATEGORIES) {
        expect(DEFAULT_CATEGORY_SLUGS.has(cat.slug)).toBe(true);
        expect(isDefaultCategorySlug(cat.slug)).toBe(true);
        expect(DEFAULT_CMS_CATEGORIES.some((c) => c.slug === cat.slug)).toBe(true);
      }
    });

    it('ensures NEWS_CATEGORIES is a proper subset of DEFAULT_CATEGORY_SLUGS', () => {
      expect(NEWS_CATEGORIES.length).toBe(9);
      for (const cat of NEWS_CATEGORIES) {
        expect(DEFAULT_CATEGORY_SLUGS.has(cat.slug)).toBe(true);
        expect(isDefaultCategorySlug(cat.slug)).toBe(true);
      }
    });

    it('ensures CMS_READER_CATEGORIES are all recognized as system/default', () => {
      expect(CMS_READER_CATEGORIES.length).toBe(10);
      for (const cat of CMS_READER_CATEGORIES) {
        expect(DEFAULT_CATEGORY_SLUGS.has(cat.slug)).toBe(true);
        expect(isDefaultCategorySlug(cat.slug)).toBe(true);
      }
    });

    it('rejects arbitrary custom slugs from system classification', () => {
      expect(isDefaultCategorySlug('investigations')).toBe(false);
      expect(isDefaultCategorySlug('special-events')).toBe(false);
      expect(isDefaultCategorySlug('')).toBe(false);
      expect(isDefaultCategorySlug(null)).toBe(false);
      expect(isDefaultCategorySlug(undefined)).toBe(false);
    });
  });

  describe('Seeding and restoration invariants', () => {
    it('restores all missing default categories when starting from empty store', () => {
      const missing = findMissingDefaults([]);
      expect(missing.length).toBe(19);
      expect(missing.map((c) => c.slug).sort()).toEqual(
        READER_CATEGORIES.map((c) => c.slug).sort()
      );
    });

    it('preserves existing custom categories without re-seeding them', () => {
      const existing: CategoryRecord[] = [
        ...READER_CATEGORIES.map((c) => ({
          _id: `id-${c.slug}`,
          name: c.nameEn,
          slug: c.slug,
        })),
        {
          _id: 'custom-1',
          name: 'Investigations',
          slug: 'investigations',
          description: 'Custom investigative journalism',
        },
      ];

      const missing = findMissingDefaults(existing);
      expect(missing).toHaveLength(0);
    });

    it('restores only the deleted default category if an editor deletes one', () => {
      // Simulate deleting 'madhya-pradesh'
      const existingWithoutMP: CategoryRecord[] = READER_CATEGORIES.filter(
        (c) => c.slug !== 'madhya-pradesh'
      ).map((c) => ({
        _id: `id-${c.slug}`,
        name: c.nameEn,
        slug: c.slug,
      }));

      const missing = findMissingDefaults(existingWithoutMP);
      expect(missing).toHaveLength(1);
      expect(missing[0].slug).toBe('madhya-pradesh');
      expect(missing[0].name).toBe('Madhya Pradesh');
    });
  });

  describe('CMS UI Category Presentation & Actions', () => {
    it('classifies seeded reader categories as System, hides delete button, and preserves Custom deletion', async () => {
      const mockCategories: CategoryRecord[] = [
        {
          _id: 'cat-news-national',
          name: 'National',
          slug: 'national',
          description: 'National news',
        },
        {
          _id: 'cat-reader-mp',
          name: 'Madhya Pradesh',
          slug: 'madhya-pradesh',
          description: 'Madhya Pradesh news and updates',
        },
        {
          _id: 'cat-reader-special',
          name: 'Lokswami Special',
          slug: 'lokswami-special',
          description: 'Lokswami Special news and updates',
        },
        {
          _id: 'cat-reader-kisaan',
          name: 'Kisaan',
          slug: 'kisaan',
          description: 'Kisaan news and updates',
        },
        {
          _id: 'cat-custom-investigations',
          name: 'Investigations',
          slug: 'investigations',
          description: 'Special investigative reports',
        },
      ];

      const deleteUrls: string[] = [];

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url === '/api/admin/categories') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, data: mockCategories }),
          });
        }
        if (url.startsWith('/api/admin/categories/') && init?.method === 'DELETE') {
          deleteUrls.push(url);
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      });

      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<CategoriesPage />);

      // Wait for categories to load
      await waitFor(() => {
        expect(screen.getByText('Madhya Pradesh')).toBeInTheDocument();
      });

      // System categories checks
      // 1. National (NEWS_CATEGORY)
      const nationalCard = screen.getByText('National').closest('article')!;
      expect(nationalCard).toHaveTextContent('System');
      expect(screen.queryByRole('button', { name: /delete national/i })).not.toBeInTheDocument();

      // 2. Madhya Pradesh (State Reader Category)
      const mpCard = screen.getByText('Madhya Pradesh').closest('article')!;
      expect(mpCard).toHaveTextContent('System');
      expect(mpCard).not.toHaveTextContent('Custom');
      expect(screen.queryByRole('button', { name: /delete madhya pradesh/i })).not.toBeInTheDocument();

      // 3. Lokswami Special (Special Reader Category)
      const specialCard = screen.getByText('Lokswami Special').closest('article')!;
      expect(specialCard).toHaveTextContent('System');
      expect(specialCard).not.toHaveTextContent('Custom');
      expect(screen.queryByRole('button', { name: /delete lokswami special/i })).not.toBeInTheDocument();

      // 4. Kisaan (Overflow Reader Category)
      const kisaanCard = screen.getByText('Kisaan').closest('article')!;
      expect(kisaanCard).toHaveTextContent('System');
      expect(kisaanCard).not.toHaveTextContent('Custom');
      expect(screen.queryByRole('button', { name: /delete kisaan/i })).not.toBeInTheDocument();

      // Custom category checks
      // 5. Investigations (Custom Category)
      const customCard = screen.getByText('Investigations').closest('article')!;
      expect(customCard).toHaveTextContent('Custom');
      const deleteBtn = screen.getByRole('button', { name: /delete investigations/i });
      expect(deleteBtn).toBeInTheDocument();

      // Click delete on custom category
      fireEvent.click(deleteBtn);

      expect(confirmSpy).toHaveBeenCalledWith('Delete category?');
      await waitFor(() => {
        expect(deleteUrls).toContain('/api/admin/categories/cat-custom-investigations');
      });

      confirmSpy.mockRestore();
    });

    it('correctly calculates System and Custom metric card counts', async () => {
      // 19 default categories + 2 custom categories
      const allSeeded: CategoryRecord[] = READER_CATEGORIES.map((c) => ({
        _id: `id-${c.slug}`,
        name: c.nameEn,
        slug: c.slug,
        description: `${c.nameEn} description`,
      }));

      const withCustom: CategoryRecord[] = [
        ...allSeeded,
        {
          _id: 'custom-1',
          name: 'Op-Ed',
          slug: 'op-ed',
          description: 'Opinion pieces',
        },
        {
          _id: 'custom-2',
          name: 'Podcasts',
          slug: 'podcasts',
          description: 'Audio podcast feed',
        },
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/admin/categories') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, data: withCustom }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      });

      render(<CategoriesPage />);

      await waitFor(() => {
        expect(screen.getByText('Op-Ed')).toBeInTheDocument();
      });

      // Verify System count is 19 and Custom count is 2 in hero metric badges
      expect(screen.getByText('System 19')).toBeInTheDocument();
      expect(screen.getByText('Custom 2')).toBeInTheDocument();
      expect(screen.getByText('Total 21')).toBeInTheDocument();
    });
  });
});
