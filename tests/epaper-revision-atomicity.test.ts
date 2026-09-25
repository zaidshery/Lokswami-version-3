import { describe, expect, it, vi, beforeEach } from 'vitest';

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

import { EpaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import { EpaperRevisionService } from '@/lib/server/epaper/epaperRevisionService';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import {
  EpaperForbiddenError,
  EpaperConflictError,
  EpaperVersionConflictError,
  type AdminSessionIdentity,
  type EpaperRecord,
} from '@/lib/server/epaper/epaperTypes';

const superAdminActor: AdminSessionIdentity = {
  id: 'super-admin-1',
  username: 'superadmin',
  name: 'Super Admin',
  email: 'superadmin@example.com',
  role: 'super_admin',
};

const adminActor: AdminSessionIdentity = {
  id: 'admin-1',
  username: 'admin',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin',
};

describe('Phase 3.9C — Revision Atomicity, Cloning & Optimistic Concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Task 25: Atomic Current Revision Switching', () => {
    it('publishes first revision: sets status published, isCurrentRevision true, server publishedAt', async () => {
      const familyId = 'family-alpha-1';
      const storedEditions: Record<string, EpaperRecord> = {
        'rev-1': {
          _id: 'rev-1',
          familyId,
          revisionNumber: 1,
          status: 'draft',
          productionStatus: 'ready_to_publish',
          isCurrentRevision: true,
          publishedAt: null,
          title: 'Edition R1',
          citySlug: 'indore',
          cityName: 'Indore',
          publicationType: 'epaper',
          pageCount: 1,
          pdfPath: '/uploads/r1.pdf',
          thumbnailPath: '/thumb-1.jpg',
          pages: [{ pageNumber: 1, imagePath: '/p1.jpg', processingStatus: 'ready' }],
        },
      };

      const mockRepo = {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
        findEditionById: vi.fn((id: string) => Promise.resolve(storedEditions[id] || null)),
        listArticles: vi.fn().mockResolvedValue([]),
        findLatestProcessingJob: vi.fn().mockResolvedValue(null),
        resolveAssignee: vi.fn().mockResolvedValue(null),
        publishEdition: vi.fn((id: string, famId: string, updates: EpaperRecord) => {
          for (const key of Object.keys(storedEditions)) {
            if (storedEditions[key].familyId === famId && key !== id) {
              storedEditions[key].isCurrentRevision = false;
            }
          }
          storedEditions[id] = {
            ...storedEditions[id],
            ...updates,
            status: 'published',
            isCurrentRevision: true,
            publishedAt: updates.publishedAt || new Date(),
          };
          return Promise.resolve(storedEditions[id]);
        }),
      } as unknown as EpaperRepository;

      const service = new EpaperEditorialService(mockRepo);
      const res = await service.updateWorkflow(superAdminActor, 'rev-1', {
        productionStatus: 'published',
      });

      expect(res.data.status).toBe('published');
      expect(res.data.isCurrentRevision).toBe(true);
      expect(storedEditions['rev-1'].status).toBe('published');
      expect(storedEditions['rev-1'].isCurrentRevision).toBe(true);
      expect(storedEditions['rev-1'].publishedAt).toBeInstanceOf(Date);
      expect(mockRepo.publishEdition).toHaveBeenCalledWith('rev-1', familyId, expect.any(Object));
    });

    it('publishes revision N+1 atomically: old isCurrentRevision becomes false, new becomes true', async () => {
      const familyId = 'family-beta-2';
      const storedEditions: Record<string, EpaperRecord> = {
        'rev-1': {
          _id: 'rev-1',
          familyId,
          revisionNumber: 1,
          status: 'published',
          productionStatus: 'published',
          isCurrentRevision: true,
          publishedAt: new Date('2026-09-20T00:00:00Z'),
          title: 'Edition Rev 1',
          citySlug: 'indore',
          cityName: 'Indore',
          publicationType: 'epaper',
          pageCount: 1,
          pdfPath: '/uploads/r1.pdf',
          thumbnailPath: '/thumb.jpg',
          pages: [{ pageNumber: 1, imagePath: '/p1.jpg', processingStatus: 'ready' }],
        },
        'rev-2': {
          _id: 'rev-2',
          familyId,
          revisionNumber: 2,
          status: 'draft',
          productionStatus: 'ready_to_publish',
          isCurrentRevision: false,
          publishedAt: null,
          title: 'Edition Rev 2',
          citySlug: 'indore',
          cityName: 'Indore',
          publicationType: 'epaper',
          pageCount: 1,
          pdfPath: '/uploads/r2.pdf',
          thumbnailPath: '/thumb.jpg',
          pages: [{ pageNumber: 1, imagePath: '/p1.jpg', processingStatus: 'ready' }],
        },
      };

      const mockRepo = {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
        findEditionById: vi.fn((id: string) => Promise.resolve(storedEditions[id] || null)),
        listArticles: vi.fn().mockResolvedValue([]),
        findLatestProcessingJob: vi.fn().mockResolvedValue(null),
        resolveAssignee: vi.fn().mockResolvedValue(null),
        publishEdition: vi.fn((id: string, famId: string, updates: EpaperRecord) => {
          for (const key of Object.keys(storedEditions)) {
            if (storedEditions[key].familyId === famId && key !== id) {
              storedEditions[key].isCurrentRevision = false;
            }
          }
          storedEditions[id] = {
            ...storedEditions[id],
            ...updates,
            status: 'published',
            isCurrentRevision: true,
            publishedAt: updates.publishedAt || new Date(),
          };
          return Promise.resolve(storedEditions[id]);
        }),
      } as unknown as EpaperRepository;

      const service = new EpaperEditorialService(mockRepo);
      await service.updateWorkflow(superAdminActor, 'rev-2', {
        productionStatus: 'published',
      });

      expect(storedEditions['rev-1'].isCurrentRevision).toBe(false);
      expect(storedEditions['rev-2'].isCurrentRevision).toBe(true);
      expect(storedEditions['rev-2'].status).toBe('published');

      // Invariant: Exactly one edition in this family has isCurrentRevision === true
      const familyRevisions = Object.values(storedEditions).filter((e) => e.familyId === familyId);
      const currentRevisions = familyRevisions.filter((e) => e.isCurrentRevision === true);
      expect(currentRevisions.length).toBe(1);
      expect(currentRevisions[0]._id).toBe('rev-2');
    });

    it('isolates families: publishing in family A does not affect family B', async () => {
      const storedEditions: Record<string, EpaperRecord> = {
        'family-a-rev-1': {
          _id: 'family-a-rev-1',
          familyId: 'fam-a',
          revisionNumber: 1,
          status: 'published',
          productionStatus: 'published',
          isCurrentRevision: true,
          citySlug: 'indore',
          cityName: 'Indore',
          publicationType: 'epaper',
          pageCount: 1,
          pdfPath: '/uploads/a.pdf',
          thumbnailPath: '/t.jpg',
          pages: [{ pageNumber: 1, imagePath: '/p.jpg', processingStatus: 'ready' }],
        },
        'family-b-rev-1': {
          _id: 'family-b-rev-1',
          familyId: 'fam-b',
          revisionNumber: 1,
          status: 'draft',
          productionStatus: 'ready_to_publish',
          isCurrentRevision: false,
          citySlug: 'bhopal',
          cityName: 'Bhopal',
          publicationType: 'epaper',
          pageCount: 1,
          pdfPath: '/uploads/b.pdf',
          thumbnailPath: '/t.jpg',
          pages: [{ pageNumber: 1, imagePath: '/p.jpg', processingStatus: 'ready' }],
        },
      };

      const mockRepo = {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
        findEditionById: vi.fn((id: string) => Promise.resolve(storedEditions[id] || null)),
        listArticles: vi.fn().mockResolvedValue([]),
        findLatestProcessingJob: vi.fn().mockResolvedValue(null),
        resolveAssignee: vi.fn().mockResolvedValue(null),
        publishEdition: vi.fn((id: string, famId: string, updates: EpaperRecord) => {
          for (const key of Object.keys(storedEditions)) {
            if (storedEditions[key].familyId === famId && key !== id) {
              storedEditions[key].isCurrentRevision = false;
            }
          }
          storedEditions[id] = {
            ...storedEditions[id],
            ...updates,
            status: 'published',
            isCurrentRevision: true,
            publishedAt: updates.publishedAt || new Date(),
          };
          return Promise.resolve(storedEditions[id]);
        }),
      } as unknown as EpaperRepository;

      const service = new EpaperEditorialService(mockRepo);
      await service.updateWorkflow(superAdminActor, 'family-b-rev-1', {
        productionStatus: 'published',
      });

      // family-a-rev-1 MUST still be current
      expect(storedEditions['family-a-rev-1'].isCurrentRevision).toBe(true);
      // family-b-rev-1 is now current for its own family
      expect(storedEditions['family-b-rev-1'].isCurrentRevision).toBe(true);
    });

    it('resolves concurrent publish race deterministically so only one isCurrentRevision remains', async () => {
      const familyId = 'family-race';
      const storedEditions: Record<string, EpaperRecord> = {
        'rev-A': {
          _id: 'rev-A',
          familyId,
          revisionNumber: 2,
          status: 'draft',
          productionStatus: 'ready_to_publish',
          isCurrentRevision: false,
          citySlug: 'indore',
          cityName: 'Indore',
          publicationType: 'epaper',
          pageCount: 1,
          pdfPath: '/uploads/a.pdf',
          thumbnailPath: '/t.jpg',
          pages: [{ pageNumber: 1, imagePath: '/p.jpg', processingStatus: 'ready' }],
        },
        'rev-B': {
          _id: 'rev-B',
          familyId,
          revisionNumber: 3,
          status: 'draft',
          productionStatus: 'ready_to_publish',
          isCurrentRevision: false,
          citySlug: 'indore',
          cityName: 'Indore',
          publicationType: 'epaper',
          pageCount: 1,
          pdfPath: '/uploads/b.pdf',
          thumbnailPath: '/t.jpg',
          pages: [{ pageNumber: 1, imagePath: '/p.jpg', processingStatus: 'ready' }],
        },
      };

      const mockRepo = {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
        findEditionById: vi.fn((id: string) => Promise.resolve(storedEditions[id] || null)),
        listArticles: vi.fn().mockResolvedValue([]),
        findLatestProcessingJob: vi.fn().mockResolvedValue(null),
        resolveAssignee: vi.fn().mockResolvedValue(null),
        publishEdition: vi.fn(async (id: string, famId: string, updates: EpaperRecord) => {
          // Simulate serialized atomic switch in database
          for (const key of Object.keys(storedEditions)) {
            if (storedEditions[key].familyId === famId && key !== id) {
              storedEditions[key].isCurrentRevision = false;
            }
          }
          storedEditions[id] = {
            ...storedEditions[id],
            ...updates,
            status: 'published',
            isCurrentRevision: true,
            publishedAt: updates.publishedAt || new Date(),
          };
          return storedEditions[id];
        }),
      } as unknown as EpaperRepository;

      const service = new EpaperEditorialService(mockRepo);

      // Race: attempt to publish both simultaneously
      await Promise.all([
        service.updateWorkflow(superAdminActor, 'rev-A', { productionStatus: 'published' }),
        service.updateWorkflow(superAdminActor, 'rev-B', { productionStatus: 'published' }),
      ]);

      const currentRevisions = Object.values(storedEditions).filter((e) => e.isCurrentRevision === true);
      // Invariant: Exactly one current revision survives
      expect(currentRevisions.length).toBe(1);
    });
  });

  describe('Task 26: Revision Cloning Asset & Reference Independence', () => {
    it('clones page metadata, hotspots, and resets processing generation & QA review status', async () => {
      const sourceId = '507f1f77bcf86cd799439011';
      const createdEditions: EpaperRecord[] = [];
      const createdArticles: EpaperRecord[] = [];

      const sourceEdition: EpaperRecord = {
        _id: sourceId,
        familyId: 'family-clone-1',
        revisionNumber: 1,
        status: 'published',
        productionStatus: 'published',
        isCurrentRevision: true,
        title: 'Original Published Edition',
        citySlug: 'indore',
        cityName: 'Indore',
        publicationType: 'epaper',
        publishDate: new Date('2026-09-25T00:00:00Z'),
        pageCount: 2,
        pdfPath: 'https://cdn.digitaloceanspaces.com/lokswami/epapers/2026/09/doc.pdf',
        pdfPublicId: 'lokswami/epapers/2026/09/doc.pdf',
        thumbnailPath: 'https://cdn.digitaloceanspaces.com/lokswami/epapers/2026/09/thumb.jpg',
        processingGeneration: 'gen-finished-original',
        pages: [
          {
            pageNumber: 1,
            imagePath: '/page-1.jpg',
            pageType: 'editorial',
            classificationNote: '',
            processingStatus: 'ready',
            reviewStatus: 'ready',
            reviewNote: 'Looks great',
            reviewedAt: new Date(),
            reviewedBy: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'super_admin' },
          },
          {
            pageNumber: 2,
            imagePath: '/page-2.jpg',
            pageType: 'editorial',
            classificationNote: '',
            processingStatus: 'ready',
            reviewStatus: 'ready',
            reviewNote: 'Approved',
            reviewedAt: new Date(),
            reviewedBy: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'super_admin' },
          },
        ],
      };

      const sourceArticles: EpaperRecord[] = [
        {
          _id: 'article-1',
          epaperId: sourceId,
          pageNumber: 1,
          title: 'Article 1',
          slug: 'article-1',
          excerpt: 'Excerpt 1',
          contentHtml: '<p>Body 1</p>',
          hotspot: { x: 10, y: 20, w: 30, h: 40 },
          workflow: { reviewStatus: 'ready' },
        },
      ];

      const mockRepo = {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
        findEditionById: vi.fn().mockResolvedValue(sourceEdition),
        findEdition: vi.fn().mockResolvedValue(null),
        findLatestRevision: vi.fn().mockResolvedValue({ revisionNumber: 1 }),
        updateEditionWhere: vi.fn(),
        createEdition: vi.fn((data: EpaperRecord) => {
          const doc = { _id: 'rev-2-id', ...data };
          createdEditions.push(doc);
          return Promise.resolve(doc);
        }),
        listArticles: vi.fn().mockResolvedValue(sourceArticles),
        createArticle: vi.fn((data: EpaperRecord) => {
          const doc = { _id: `cloned-article-${createdArticles.length + 1}`, ...data };
          createdArticles.push(doc);
          return Promise.resolve(doc);
        }),
        listReadyTtsAssets: vi.fn().mockResolvedValue([]),
      } as unknown as EpaperRepository;

      const service = new EpaperRevisionService(mockRepo);
      const res = await service.create(superAdminActor, sourceId);

      expect(res.data.revisionNumber).toBe(2);
      expect(res.data.familyId).toBe('family-clone-1');

      const clonedEdition = createdEditions[0];
      expect(clonedEdition.status).toBe('draft');
      expect(clonedEdition.isCurrentRevision).toBe(false);
      expect(clonedEdition.productionStatus).toBe('hotspot_mapping');
      // Processing generation must be reset to empty!
      expect(clonedEdition.processingGeneration).toBe('');
      expect(clonedEdition.version).toBe(1);

      // Verify page metadata was cloned but QA reviews were reset
      expect(Array.isArray(clonedEdition.pages)).toBe(true);
      const pages = clonedEdition.pages as Array<Record<string, unknown>>;
      expect(pages.length).toBe(2);
      expect(pages[0].imagePath).toBe('/page-1.jpg');
      expect(pages[0].reviewStatus).toBe('pending');
      expect(pages[0].reviewedAt).toBeNull();
      expect(pages[0].reviewedBy).toBeNull();

      // Verify articles and hotspots are cloned as independent deep copies
      expect(createdArticles.length).toBe(1);
      const clonedArticle = createdArticles[0];
      expect(clonedArticle.title).toBe('Article 1');
      expect(clonedArticle.hotspot).toEqual({ x: 10, y: 20, w: 30, h: 40 });

      // Mutating cloned hotspot must NOT mutate source hotspot
      (clonedArticle.hotspot as { x: number }).x = 999;
      expect((sourceArticles[0].hotspot as { x: number }).x).toBe(10);
    });

    it('rejects revision creation if the source edition is not published', async () => {
      const mockRepo = {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
        findEditionById: vi.fn().mockResolvedValue({
          _id: 'draft-edition-1',
          status: 'draft',
          productionStatus: 'hotspot_mapping',
        }),
      } as unknown as EpaperRepository;

      const service = new EpaperRevisionService(mockRepo);
      await expect(service.create(superAdminActor, 'draft-edition-1')).rejects.toThrow(
        EpaperConflictError
      );
    });
  });

  describe('Task 27: Optimistic Concurrency Control (CAS)', () => {
    it('accepts metadata update when expectedVersion matches canonical version and increments version', async () => {
      let storedDoc = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Initial Title',
        citySlug: 'indore',
        cityName: 'Indore',
        status: 'draft',
        productionStatus: 'hotspot_mapping',
        version: 3,
      };

      const mockRepo = {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
        findEditionById: vi.fn().mockImplementation(() => Promise.resolve({ ...storedDoc })),
        findEdition: vi.fn().mockResolvedValue(null),
        updateEditionWithCas: vi.fn((id: string, updates: EpaperRecord, expectedVersion?: number) => {
          if (expectedVersion !== undefined && expectedVersion !== storedDoc.version) {
            throw new EpaperVersionConflictError(storedDoc.version, expectedVersion);
          }
          storedDoc = {
            ...storedDoc,
            ...updates,
            version: storedDoc.version + 1,
          };
          return Promise.resolve(storedDoc);
        }),
      } as unknown as EpaperRepository;

      const service = new EpaperEditorialService(mockRepo);
      const res = await service.updateMetadata(superAdminActor, '507f1f77bcf86cd799439011', {
        title: 'New Title V4',
        expectedVersion: 3,
      });

      expect(res.data.title).toBe('New Title V4');
      expect(storedDoc.version).toBe(4);
    });

    it('rejects metadata update with HTTP 409 when expectedVersion is stale', async () => {
      const storedDoc = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Already Updated Title',
        citySlug: 'indore',
        cityName: 'Indore',
        status: 'draft',
        productionStatus: 'hotspot_mapping',
        version: 5,
      };

      const mockRepo = {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
        findEditionById: vi.fn().mockResolvedValue(storedDoc),
      } as unknown as EpaperRepository;

      const service = new EpaperEditorialService(mockRepo);

      // Writer submits expectedVersion: 4 while stored is 5
      await expect(
        service.updateMetadata(superAdminActor, '507f1f77bcf86cd799439011', {
          title: 'Stale Writer Edit',
          expectedVersion: 4,
        })
      ).rejects.toThrow(EpaperVersionConflictError);
    });

    it('handles concurrent writers: Writer A succeeds and increments version, Writer B conflicts', async () => {
      let storedDoc = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Initial Title',
        citySlug: 'indore',
        cityName: 'Indore',
        status: 'draft',
        productionStatus: 'hotspot_mapping',
        version: 1,
      };

      const mockRepo = {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
        findEditionById: vi.fn().mockImplementation(() => Promise.resolve({ ...storedDoc })),
        findEdition: vi.fn().mockResolvedValue(null),
        updateEditionWithCas: vi.fn((id: string, updates: EpaperRecord, expectedVersion?: number) => {
          if (expectedVersion !== undefined && expectedVersion !== storedDoc.version) {
            throw new EpaperVersionConflictError(storedDoc.version, expectedVersion);
          }
          storedDoc = {
            ...storedDoc,
            ...updates,
            version: storedDoc.version + 1,
          };
          return Promise.resolve(storedDoc);
        }),
      } as unknown as EpaperRepository;

      const service = new EpaperEditorialService(mockRepo);

      // Writer A writes version 1 -> succeeds, version becomes 2
      const resA = await service.updateMetadata(superAdminActor, '507f1f77bcf86cd799439011', {
        title: 'Writer A Edit',
        expectedVersion: 1,
      });
      expect(resA.data.title).toBe('Writer A Edit');
      expect(storedDoc.version).toBe(2);

      // Writer B read version 1 and attempts to write with expectedVersion: 1 -> must conflict!
      await expect(
        service.updateMetadata(superAdminActor, '507f1f77bcf86cd799439011', {
          title: 'Writer B Edit (Stale)',
          expectedVersion: 1,
        })
      ).rejects.toThrow(EpaperVersionConflictError);

      // Stored title must remain Writer A's edit, no silent overwrite
      expect(storedDoc.title).toBe('Writer A Edit');
    });

    it('denies non-super_admin actors independently of version', async () => {
      const mockRepo = {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
      } as unknown as EpaperRepository;

      const service = new EpaperEditorialService(mockRepo);

      await expect(
        service.updateMetadata(adminActor, '507f1f77bcf86cd799439011', {
          title: 'Admin Attempt',
          expectedVersion: 1,
        })
      ).rejects.toThrow(EpaperForbiddenError);
    });
  });
});
