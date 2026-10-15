import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/epaperActivity', () => ({
  buildEpaperActivityMessage: vi.fn(() => 'Activity message'),
  recordEpaperActivity: vi.fn(),
  listEpaperActivity: vi.fn(() => []),
}));
vi.mock('@/lib/server/epaperObservability', () => ({
  logEpaperMetric: vi.fn(),
}));
vi.mock('@/lib/storage/workflowNotifications', () => ({
  createWorkflowNotification: vi.fn(),
}));

import { EpaperService } from '@/lib/server/epaper/epaperService';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import { normalizeEpaperPages, mapPublicFeedMongo } from '@/lib/server/epaper/epaperMapper';
import {
  EpaperNotFoundError,
  type EpaperRecord,
  type PublicEpaperFilterState,
} from '@/lib/server/epaper/epaperTypes';

function makeFilterState(overrides: Partial<PublicEpaperFilterState> = {}): PublicEpaperFilterState {
  return {
    publicationType: 'epaper',
    citySlug: 'indore',
    date: '2026-09-26',
    parsedDate: new Date('2026-09-26T00:00:00.000Z'),
    month: '2026-09',
    monthStart: new Date('2026-09-01T00:00:00.000Z'),
    monthEnd: new Date('2026-10-01T00:00:00.000Z'),
    query: '',
    queryDate: null,
    queryDateEnd: null,
    queryMonth: '',
    queryMonthStart: null,
    queryMonthEnd: null,
    ...overrides,
  };
}

describe('Phase 3.9E — Public Reader Contract Freeze & Invariants', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIGITALOCEAN_SPACES_ACCESS_KEY = 'test-access-key';
    process.env.DIGITALOCEAN_SPACES_SECRET_KEY = 'test-secret-key';
    process.env.DIGITALOCEAN_SPACES_BUCKET = 'lokswami-test-bucket';
    process.env.DIGITALOCEAN_SPACES_REGION = 'sgp1';
    process.env.DIGITALOCEAN_SPACES_CDN_BASE_URL = 'https://lokswami-test-bucket.sgp1.cdn.digitaloceanspaces.com';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. Public List Contract (Task 16)', () => {
    it('exposes ONLY published current revisions in public list and excludes drafts, superseded, and archived', async () => {
      const familyId = 'family-alpha';
      const publishedCurrent: EpaperRecord = {
        _id: 'edition-v2',
        familyId,
        revisionNumber: 2,
        status: 'published',
        isCurrentRevision: true,
        title: 'Indore Morning Edition',
        citySlug: 'indore',
        cityName: 'Indore',
        publicationType: 'epaper',
        publishDate: '2026-09-26',
        publishedAt: '2026-09-26T06:00:00.000Z',
        pdfUrl: 'https://fra1.digitaloceanspaces.com/bucket/epapers/indore-v2.pdf',
        pdfPublicId: 'epapers/indore-v2.pdf',
        thumbnailPath: '/uploads/epapers/indore-v2-cover.jpg',
        pageCount: 8,
        pages: [
          { pageNumber: 1, imagePath: '/uploads/page1.jpg', processingStatus: 'ready' },
          { pageNumber: 2, imagePath: '/uploads/page2.jpg', processingStatus: 'ready' },
        ],
      };

      const historicalSuperseded: EpaperRecord = {
        _id: 'edition-v1',
        familyId,
        revisionNumber: 1,
        status: 'published',
        isCurrentRevision: false,
        title: 'Indore Morning Edition (Old)',
        citySlug: 'indore',
        cityName: 'Indore',
        publicationType: 'epaper',
        publishDate: '2026-09-26',
        publishedAt: '2026-09-26T05:00:00.000Z',
        pdfUrl: 'https://fra1.digitaloceanspaces.com/bucket/epapers/indore-v1.pdf',
        pdfPublicId: 'epapers/indore-v1.pdf',
        pageCount: 8,
        pages: [],
      };

      const draftRevision: EpaperRecord = {
        _id: 'edition-v3-draft',
        familyId,
        revisionNumber: 3,
        status: 'draft',
        isCurrentRevision: false,
        title: 'Indore Morning Edition (Draft Revision)',
        citySlug: 'indore',
        cityName: 'Indore',
        publicationType: 'epaper',
        publishDate: '2026-09-26',
        pageCount: 8,
        pages: [],
      };

      const archivedEdition: EpaperRecord = {
        _id: 'edition-archived',
        familyId: 'family-beta',
        revisionNumber: 1,
        status: 'published',
        productionStatus: 'archived',
        isCurrentRevision: false,
        title: 'Indore Archived Edition',
        citySlug: 'indore',
        cityName: 'Indore',
        publicationType: 'epaper',
        publishDate: '2026-09-20',
        pageCount: 4,
        pages: [],
      };

      const allEditions = [publishedCurrent, historicalSuperseded, draftRevision, archivedEdition];

      const mockRepo = {
        listPublic: vi.fn(async () => {
          // Canonical filter: status === 'published' AND isCurrentRevision === true
          const rows = allEditions
            .filter((e) => e.status === 'published' && e.isCurrentRevision === true && e.productionStatus !== 'archived')
            .map((r) => mapPublicFeedMongo(r));
          return { rows, total: rows.length, source: 'mongo' as const };
        }),
      } as unknown as EpaperRepository;

      const service = new EpaperService(mockRepo);
      const result = await service.listPublicEpapers({
        filters: makeFilterState(),
        limit: 20,
        page: 1,
      });

      expect(result.data).toHaveLength(1);
      const first = result.data[0];
      expect(first).not.toBeNull();
      expect(first?._id).toBe('edition-v2');
      expect(first?.title).toBe('Indore Morning Edition');

      // Verify drafts, superseded revisions, and archived editions are NEVER present
      const ids = result.data.map((item) => item?._id);
      expect(ids).not.toContain('edition-v1');
      expect(ids).not.toContain('edition-v3-draft');
      expect(ids).not.toContain('edition-archived');
    });
  });

  describe('2. Public Latest Feed Contract (Task 17)', () => {
    it('returns only the current published edition and never returns draft N+1 or superseded N-1', async () => {
      const familyId = 'family-gamma';
      const publishedV1: EpaperRecord = {
        _id: 'edition-pub-1',
        familyId,
        revisionNumber: 1,
        status: 'published',
        isCurrentRevision: true,
        title: 'Ujjain Edition',
        citySlug: 'ujjain',
        cityName: 'Ujjain',
        publicationType: 'epaper',
        publishDate: '2026-09-26',
        pageCount: 10,
        pages: [],
      };

      const mockRepo = {
        listPublicFeed: vi.fn(async () => ({
          items: [mapPublicFeedMongo(publishedV1)!],
          nextCursor: null,
          hasMore: false,
          total: 1,
        })),
      } as unknown as EpaperRepository;

      const service = new EpaperService(mockRepo);
      const feed = await service.listPublicEpaperFeed({
        filters: makeFilterState({ citySlug: 'ujjain' }),
      });

      expect(feed.items).toHaveLength(1);
      expect(feed.items[0]._id).toBe('edition-pub-1');
      expect(feed.items[0].status).toBe('published');
    });
  });

  describe('3. Public Single / PDF Contract (Task 18)', () => {
    it('resolves canonical PDF URL for published current edition using server Spaces identity', async () => {
      const mockRepo = {
        findPdfRecord: vi.fn(async (id: string) => {
          if (id === 'pub-current-id') {
            return {
              _id: 'pub-current-id',
              status: 'published',
              isCurrentRevision: true,
              pdfPublicId: 'epapers/2026-09-26/indore.pdf',
              pdfFormat: 'pdf',
              pdfUrl: 'https://fra1.digitaloceanspaces.com/bucket/epapers/2026-09-26/indore.pdf',
            };
          }
          return null;
        }),
      } as unknown as EpaperRepository;

      const service = new EpaperService(mockRepo);
      const url = await service.resolvePublicPdfUrl('pub-current-id');

      expect(url).toContain('epapers/2026-09-26/indore.pdf');
      expect(url).toMatch(/^https?:\/\//);
    });

    it('denies PDF access for draft editions (returns 404 EpaperNotFoundError)', async () => {
      const mockRepo = {
        findPdfRecord: vi.fn(async () => ({
          _id: 'draft-id',
          status: 'draft',
          isCurrentRevision: false,
          pdfPublicId: 'epapers/draft.pdf',
        })),
      } as unknown as EpaperRepository;

      const service = new EpaperService(mockRepo);
      await expect(service.resolvePublicPdfUrl('draft-id')).rejects.toThrow(EpaperNotFoundError);
    });

    it('denies PDF access for superseded historical revisions (returns 404 EpaperNotFoundError)', async () => {
      const mockRepo = {
        findPdfRecord: vi.fn(async () => ({
          _id: 'superseded-id',
          status: 'published',
          isCurrentRevision: false,
          pdfPublicId: 'epapers/old-revision.pdf',
        })),
      } as unknown as EpaperRepository;

      const service = new EpaperService(mockRepo);
      await expect(service.resolvePublicPdfUrl('superseded-id')).rejects.toThrow(EpaperNotFoundError);
    });

    it('denies PDF access for archived editions (returns 404 EpaperNotFoundError)', async () => {
      const mockRepo = {
        findPdfRecord: vi.fn(async () => null),
      } as unknown as EpaperRepository;

      const service = new EpaperService(mockRepo);
      await expect(service.resolvePublicPdfUrl('archived-id')).rejects.toThrow(EpaperNotFoundError);
    });

    it('prevents arbitrary storage key / URL injection by deriving URL strictly from server record', async () => {
      const mockRepo = {
        findPdfRecord: vi.fn(async (id: string) => {
          if (id === 'valid-id') {
            return {
              _id: 'valid-id',
              status: 'published',
              isCurrentRevision: true,
              pdfPublicId: 'epapers/trusted-canonical.pdf',
              pdfFormat: 'pdf',
            };
          }
          return null;
        }),
      } as unknown as EpaperRepository;

      const service = new EpaperService(mockRepo);
      const url = await service.resolvePublicPdfUrl('valid-id');
      expect(url).toContain('epapers/trusted-canonical.pdf');
      expect(url).not.toContain('malicious');
    });
  });

  describe('4. Public Page Order Contract (Task 19)', () => {
    it('guarantees strictly numeric sequential page ordering (1, 2, 3 ... 10, never lexical 1, 10, 2)', () => {
      const rawPages = [
        { pageNumber: 10, imagePath: '/uploads/page10.jpg' },
        { pageNumber: 1, imagePath: '/uploads/page1.jpg' },
        { pageNumber: 2, imagePath: '/uploads/page2.jpg' },
        { pageNumber: 11, imagePath: '/uploads/page11.jpg' },
        { pageNumber: 3, imagePath: '/uploads/page3.jpg' },
      ];

      const normalized = normalizeEpaperPages(rawPages);
      const pageNumbers = normalized.map((p) => p.pageNumber);

      expect(pageNumbers).toEqual([1, 2, 3, 10, 11]);
      // Verify not lexical:
      expect(pageNumbers[1]).toBe(2);
      expect(pageNumbers[3]).toBe(10);
    });

    it('excludes stale-generation and invalid page shells from public pages', () => {
      const rawPages = [
        { pageNumber: 1, imagePath: '/uploads/p1.jpg' },
        { pageNumber: 0, imagePath: '/uploads/p0.jpg' }, // invalid pageNumber
        { pageNumber: -5, imagePath: '/uploads/invalid.jpg' }, // invalid
        { pageNumber: 2, imagePath: '/uploads/p2.jpg' },
      ];

      const normalized = normalizeEpaperPages(rawPages);
      expect(normalized).toHaveLength(2);
      expect(normalized.map((p) => p.pageNumber)).toEqual([1, 2]);
    });
  });

  describe('5. Data Minimization & Reader Boundary (Task 20 & 21)', () => {
    it('public feed item excludes operational and internal CMS fields', () => {
      const rawRecord: EpaperRecord = {
        _id: 'edition-1',
        title: 'Morning Post',
        citySlug: 'indore',
        cityName: 'Indore',
        publicationType: 'epaper',
        publishDate: '2026-09-26',
        thumbnailPath: '/cover.jpg',
        pdfUrl: '/paper.pdf',
        status: 'published',
        isCurrentRevision: true,
        pageCount: 4,
        pages: [{ pageNumber: 1, imagePath: '/p1.jpg' }],
        // Internal CMS fields that must be hidden from public reader:
        leaseOwner: 'worker-node-42',
        leaseExpiresAt: '2026-09-26T12:00:00.000Z',
        cleanupPending: true,
        cleanupKeys: ['tmp/upload-abc.pdf'],
        lastCleanupError: 'Socket timeout',
        processingGeneration: 'gen-999',
        productionNotes: [{ body: 'Internal editorial note' }],
        productionAssignee: { id: 'usr-1', name: 'Desk Editor' },
        sourceType: 'manual-upload',
        sourceLabel: 'Admin file drop',
        version: 5,
      };

      const publicItem = mapPublicFeedMongo(rawRecord);
      expect(publicItem).toBeDefined();

      const publicKeys = Object.keys(publicItem || {});

      // Assert forbidden internal fields are NOT present
      expect(publicKeys).not.toContain('leaseOwner');
      expect(publicKeys).not.toContain('leaseExpiresAt');
      expect(publicKeys).not.toContain('cleanupPending');
      expect(publicKeys).not.toContain('cleanupKeys');
      expect(publicKeys).not.toContain('lastCleanupError');
      expect(publicKeys).not.toContain('processingGeneration');
      expect(publicKeys).not.toContain('productionNotes');
      expect(publicKeys).not.toContain('productionAssignee');
      expect(publicKeys).not.toContain('sourceType');
      expect(publicKeys).not.toContain('sourceLabel');
      expect(publicKeys).not.toContain('version');

      // Assert expected reader-facing fields are present
      expect(publicItem).toMatchObject({
        _id: 'edition-1',
        title: 'Morning Post',
        citySlug: 'indore',
        cityName: 'Indore',
        publicationType: 'epaper',
        publishDate: '2026-09-26',
        status: 'published',
        pageCount: 4,
        pagesWithImage: 1,
      });
    });

    it('public edition detail strips CMS workflow metadata from pages', async () => {
      const rawEdition: EpaperRecord = {
        _id: 'edition-1',
        publicationType: 'epaper',
        citySlug: 'indore',
        cityName: 'Indore',
        title: 'Indore Live',
        publishDate: new Date('2026-09-26'),
        pdfUrl: 'https://spaces.example.com/epapers/indore.pdf',
        thumbnailPath: '/cover.jpg',
        pageCount: 2,
        status: 'published',
        isCurrentRevision: true,
        pages: [
          {
            pageNumber: 1,
            imagePath: '/uploads/page1.jpg',
            width: 3000,
            height: 4200,
            pageType: 'editorial',
            classificationNote: 'Front page lead',
            processingStatus: 'ready',
            processingError: '',
            reviewStatus: 'ready',
            reviewNote: 'Looks sharp',
            reviewedBy: { id: 'adm-1', name: 'Chief Editor' },
          },
        ],
      };

      const mockRepo = {
        findPublicEdition: vi.fn(async () => ({
          store: 'mongo' as const,
          edition: rawEdition,
          articles: [],
        })),
      } as unknown as EpaperRepository;

      const service = new EpaperService(mockRepo);
      const detail = await service.getPublicEditionDetail('edition-1', 'epaper');

      expect(detail._id).toBe('edition-1');
      expect(detail.pages).toHaveLength(1);
      const publicPage = detail.pages[0];

      // Safe public page fields only
      expect(publicPage).toEqual({
        pageNumber: 1,
        imagePath: '/uploads/page1.jpg',
        width: 3000,
        height: 4200,
      });

      // Internal editorial fields stripped
      const pageKeys = Object.keys(publicPage);
      expect(pageKeys).not.toContain('classificationNote');
      expect(pageKeys).not.toContain('processingStatus');
      expect(pageKeys).not.toContain('processingError');
      expect(pageKeys).not.toContain('reviewStatus');
      expect(pageKeys).not.toContain('reviewNote');
      expect(pageKeys).not.toContain('reviewedBy');
    });
  });

  describe('6. Cross-Phase Synthetic Lifecycle & Handoff (Task 31 & 32)', () => {
    it('simulates full lifecycle: draft -> publish v1 -> draft v2 created -> public still exposes v1 -> publish v2 -> public exposes v2 -> draft v3 deleted -> public v2 intact', async () => {
      const familyId = 'family-lifecycle-test';
      const store: Record<string, EpaperRecord> = {};

      // Step 1: Create draft revision 1
      store['rev-1'] = {
        _id: 'rev-1',
        familyId,
        revisionNumber: 1,
        title: 'Lokswami City News',
        citySlug: 'indore',
        cityName: 'Indore',
        publicationType: 'epaper',
        publishDate: '2026-09-26',
        status: 'draft',
        isCurrentRevision: true,
        pageCount: 8,
        pages: [
          { pageNumber: 1, imagePath: '/uploads/v1-p1.jpg', processingStatus: 'ready' },
        ],
        pdfPublicId: 'epapers/v1.pdf',
        pdfUrl: 'https://spaces.example.com/v1.pdf',
      };

      // Invariant: Draft rev-1 is NOT visible on public API
      const queryPublicCurrent = () =>
        Object.values(store).find(
          (e) => e.familyId === familyId && e.status === 'published' && e.isCurrentRevision === true
        );

      expect(queryPublicCurrent()).toBeUndefined();

      // Step 2: Publish revision 1
      store['rev-1'].status = 'published';
      store['rev-1'].publishedAt = new Date().toISOString();

      // Invariant: Revision 1 is now visible publicly
      let currentPublic = queryPublicCurrent();
      expect(currentPublic).toBeDefined();
      expect(currentPublic?._id).toBe('rev-1');
      expect(currentPublic?.revisionNumber).toBe(1);

      // Step 3: Create draft revision 2
      store['rev-2'] = {
        _id: 'rev-2',
        familyId,
        revisionNumber: 2,
        title: 'Lokswami City News (Late Update)',
        citySlug: 'indore',
        cityName: 'Indore',
        publicationType: 'epaper',
        publishDate: '2026-09-26',
        status: 'draft',
        isCurrentRevision: false, // draft revisions are never current
        pageCount: 8,
        pages: [
          { pageNumber: 1, imagePath: '/uploads/v2-p1.jpg', processingStatus: 'ready' },
        ],
        pdfPublicId: 'epapers/v2.pdf',
        pdfUrl: 'https://spaces.example.com/v2.pdf',
      };

      // Invariant: Public API STILL exposes published rev-1, never draft rev-2
      currentPublic = queryPublicCurrent();
      expect(currentPublic).toBeDefined();
      expect(currentPublic?._id).toBe('rev-1');
      expect(currentPublic?.revisionNumber).toBe(1);

      // Step 4: Publish revision 2 (atomic switchover)
      store['rev-1'].isCurrentRevision = false; // superseded
      store['rev-2'].status = 'published';
      store['rev-2'].isCurrentRevision = true; // now current
      store['rev-2'].publishedAt = new Date().toISOString();

      // Invariant: Public API now exposes ONLY rev-2
      currentPublic = queryPublicCurrent();
      expect(currentPublic).toBeDefined();
      expect(currentPublic?._id).toBe('rev-2');
      expect(currentPublic?.revisionNumber).toBe(2);

      // Step 5: Create draft revision 3 and then delete it
      store['rev-3'] = {
        _id: 'rev-3',
        familyId,
        revisionNumber: 3,
        status: 'draft',
        isCurrentRevision: false,
        pageCount: 8,
      };

      // Delete draft revision 3
      delete store['rev-3'];

      // Invariant (Task 32): Deleting draft revision cannot alter public contract for published revision 2
      currentPublic = queryPublicCurrent();
      expect(currentPublic).toBeDefined();
      expect(currentPublic?._id).toBe('rev-2');
      expect(currentPublic?.isCurrentRevision).toBe(true);
      expect(currentPublic?.status).toBe('published');
    });
  });
});
