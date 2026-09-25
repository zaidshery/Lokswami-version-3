import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpaperUploadService } from '@/lib/server/epaper/epaperUploadService';
import { resetInMemoryLocks } from '@/lib/security/distributedLock';
import type { AdminSessionIdentity } from '@/lib/server/epaper/epaperTypes';

const {
  buildDigitalOceanSpacesPublicUrlMock,
  createDigitalOceanSpacesBrowserUploadTargetMock,
  verifyDigitalOceanSpacesUploadedObjectMock,
} = vi.hoisted(() => ({
  buildDigitalOceanSpacesPublicUrlMock: vi.fn(),
  createDigitalOceanSpacesBrowserUploadTargetMock: vi.fn(),
  verifyDigitalOceanSpacesUploadedObjectMock: vi.fn(),
}));

vi.mock('@/lib/utils/digitalOceanSpaces', () => ({
  buildDigitalOceanSpacesPublicUrl: buildDigitalOceanSpacesPublicUrlMock,
  createDigitalOceanSpacesBrowserUploadTarget: createDigitalOceanSpacesBrowserUploadTargetMock,
  verifyDigitalOceanSpacesUploadedObject: verifyDigitalOceanSpacesUploadedObjectMock,
  deleteDigitalOceanSpacesAssetByPublicId: vi.fn().mockResolvedValue(undefined),
}));

const actor: AdminSessionIdentity = {
  id: 'super-admin-1',
  name: 'Super Admin',
  email: 'superadmin@lokswami.com',
  username: 'superadmin',
  role: 'super_admin',
};

describe('Phase 3.9A — Draft Logical Uniqueness & Concurrency Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemoryLocks();

    buildDigitalOceanSpacesPublicUrlMock.mockImplementation(
      (key: string) => `https://cdn.example.com/${key}`
    );
    createDigitalOceanSpacesBrowserUploadTargetMock.mockImplementation(
      ({ key, contentType }: { key: string; contentType: string }) => ({
        publicId: key,
        secureUrl: `https://cdn.example.com/${key}`,
        uploadUrl: `https://origin.example.com/${key}`,
        uploadHeaders: { 'Content-Type': contentType },
        expiresAt: '2026-09-25T12:00:00.000Z',
      })
    );
  });

  it('serializes concurrent draft initialize requests for the same logical edition, preventing duplicate families', async () => {
    // In-memory store simulating MongoDB editions collection
    const storedEditions: any[] = [];

    const mockRepo = {
      connect: vi.fn().mockResolvedValue(undefined),
      isValidId: vi.fn().mockReturnValue(true),
      findEdition: vi.fn().mockImplementation(async (filter: any) => {
        // Small delay to simulate async network latency in DB query
        await new Promise((resolve) => setTimeout(resolve, 10));
        return (
          storedEditions.find(
            (e) =>
              e.citySlug === filter.citySlug &&
              e.isCurrentRevision === true
          ) || null
        );
      }),
      createEdition: vi.fn().mockImplementation(async (doc: any) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const created = {
          ...doc,
          _id: `edition-${storedEditions.length + 1}`,
        };
        storedEditions.push(created);
        return created;
      }),
      updateEditionWhere: vi.fn().mockImplementation(async (query: any, update: any) => {
        const item = storedEditions.find((e) => e._id === query._id);
        if (item && update.$set) {
          Object.assign(item, update.$set);
        }
        return item;
      }),
    };

    const service = new EpaperUploadService(mockRepo as any, {} as any);

    const initPayload = {
      publicationType: 'epaper',
      citySlug: 'indore',
      cityName: 'Indore',
      title: 'Indore Daily Edition',
      publishDate: '2026-09-25',
      pageCount: 8,
      fileName: 'indore-2026-09-25.pdf',
      fileType: 'application/pdf',
      fileSize: 1024 * 1024,
    };

    // Execute two initialize calls simultaneously for the same logical edition
    const [result1, result2] = await Promise.all([
      service.initialize(actor, initPayload),
      service.initialize(actor, initPayload),
    ]);

    // Exactly one edition record should have been created in storedEditions
    expect(storedEditions.length).toBe(1);

    // Both results must point to the SAME familyId and epaperId
    expect(result1.data.epaperId).toBe(result2.data.epaperId);
    expect(result1.data.familyId).toBe(result2.data.familyId);

    // One was created (201), the other resumed (200)
    const statuses = [result1.status, result2.status].sort();
    expect(statuses).toEqual([200, 201]);
  });

  it('allows independent concurrent creation for different cities', async () => {
    const storedEditions: any[] = [];

    const mockRepo = {
      connect: vi.fn().mockResolvedValue(undefined),
      isValidId: vi.fn().mockReturnValue(true),
      findEdition: vi.fn().mockImplementation(async (filter: any) => {
        return (
          storedEditions.find(
            (e) =>
              e.publicationType === filter.publicationType &&
              e.citySlug === filter.citySlug &&
              e.isCurrentRevision === true
          ) || null
        );
      }),
      createEdition: vi.fn().mockImplementation(async (doc: any) => {
        const created = {
          ...doc,
          _id: `edition-${storedEditions.length + 1}`,
        };
        storedEditions.push(created);
        return created;
      }),
    };

    const service = new EpaperUploadService(mockRepo as any, {} as any);

    const [indoreRes, ujjainRes] = await Promise.all([
      service.initialize(actor, {
        publicationType: 'epaper',
        citySlug: 'indore',
        cityName: 'Indore',
        title: 'Indore Edition',
        publishDate: '2026-09-25',
        pageCount: 8,
        fileName: 'indore.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
      }),
      service.initialize(actor, {
        publicationType: 'epaper',
        citySlug: 'ujjain',
        cityName: 'Ujjain',
        title: 'Ujjain Edition',
        publishDate: '2026-09-25',
        pageCount: 8,
        fileName: 'ujjain.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
      }),
    ]);

    expect(indoreRes.status).toBe(201);
    expect(ujjainRes.status).toBe(201);
    expect(indoreRes.data.familyId).not.toBe(ujjainRes.data.familyId);
    expect(storedEditions.length).toBe(2);
  });

  it('allows independent concurrent creation for different dates', async () => {
    const storedEditions: any[] = [];

    const mockRepo = {
      connect: vi.fn().mockResolvedValue(undefined),
      isValidId: vi.fn().mockReturnValue(true),
      findEdition: vi.fn().mockImplementation(async (filter: any) => {
        return (
          storedEditions.find(
            (e) =>
              e.publicationType === filter.publicationType &&
              e.citySlug === filter.citySlug &&
              e.publishDate?.toISOString?.() === filter.publishDate?.toISOString?.() &&
              e.isCurrentRevision === true
          ) || null
        );
      }),
      createEdition: vi.fn().mockImplementation(async (doc: any) => {
        const created = {
          ...doc,
          _id: `edition-${storedEditions.length + 1}`,
        };
        storedEditions.push(created);
        return created;
      }),
    };

    const service = new EpaperUploadService(mockRepo as any, {} as any);

    const [day1Res, day2Res] = await Promise.all([
      service.initialize(actor, {
        publicationType: 'epaper',
        citySlug: 'indore',
        cityName: 'Indore',
        title: 'Indore Day 1',
        publishDate: '2026-09-25',
        pageCount: 8,
        fileName: 'indore-25.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
      }),
      service.initialize(actor, {
        publicationType: 'epaper',
        citySlug: 'indore',
        cityName: 'Indore',
        title: 'Indore Day 2',
        publishDate: '2026-09-26',
        pageCount: 8,
        fileName: 'indore-26.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
      }),
    ]);

    expect(day1Res.status).toBe(201);
    expect(day2Res.status).toBe(201);
    expect(day1Res.data.familyId).not.toBe(day2Res.data.familyId);
    expect(storedEditions.length).toBe(2);
  });
});
