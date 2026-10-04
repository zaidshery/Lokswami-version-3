import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  connectDBMock,
  isMongoAvailableMock,
  reportMongoUnavailableMock,
  listAllStoredEPapersMock,
  countDocumentsMock,
  latestLeanMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(),
  isMongoAvailableMock: vi.fn(),
  reportMongoUnavailableMock: vi.fn(),
  listAllStoredEPapersMock: vi.fn(),
  countDocumentsMock: vi.fn(),
  latestLeanMock: vi.fn(),
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/db/mongoAvailability', () => ({
  isMongoAvailable: isMongoAvailableMock,
  reportMongoUnavailable: reportMongoUnavailableMock,
}));

vi.mock('@/lib/storage/epapersFile', () => ({
  listAllStoredEPapers: listAllStoredEPapersMock,
}));

vi.mock('@/lib/models/EPaper', () => ({
  default: {
    countDocuments: countDocumentsMock,
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        skip: vi.fn(() => ({
          limit: vi.fn(() => ({
            lean: latestLeanMock,
          })),
        })),
        limit: vi.fn(() => ({
          lean: latestLeanMock,
        })),
      })),
    })),
  },
}));

import { GET as getPublicEpapers } from '@/app/api/epapers/route';
import { GET as getLatestPublicEpapers } from '@/app/api/epapers/latest/route';

const storedPaper = {
  _id: 'stored-paper-1',
  title: 'Stored Indore Edition',
  description: '',
  city: 'Indore',
  thumbnail: '/uploads/epapers/indore-cover.jpg',
  pdfUrl: '/uploads/epapers/indore.pdf',
  publishDate: '2026-06-12',
  pages: 12,
  articleHotspots: [],
  publishedAt: '2026-06-12T06:00:00.000Z',
  updatedAt: '2026-06-12T06:00:00.000Z',
};

describe('public e-paper MongoDB fallback', () => {
  it('does not resurrect stale file issues when connected Mongo has no public records', async () => {
    countDocumentsMock.mockResolvedValue(0);
    latestLeanMock.mockResolvedValue([]);
    const response = await getPublicEpapers(new NextRequest('http://localhost/api/epapers?limit=20&status=published'));
    const payload = await response.json();
    expect(payload.data).toEqual([]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONGODB_URI = 'mongodb://example.invalid/lokswami';
    connectDBMock.mockResolvedValue(undefined);
    isMongoAvailableMock.mockResolvedValue(true);
    listAllStoredEPapersMock.mockResolvedValue([storedPaper]);
    countDocumentsMock.mockRejectedValue(new Error('MongoDB DNS unavailable'));
    latestLeanMock.mockRejectedValue(new Error('MongoDB DNS unavailable'));
  });

  it('serves stored e-papers when the paginated Mongo query fails', async () => {
    const response = await getPublicEpapers(
      new NextRequest('http://localhost/api/epapers?limit=20&status=published')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]._id).toBe(storedPaper._id);
  });

  it('serves the stored latest feed when Mongo fails after its health check', async () => {
    const response = await getLatestPublicEpapers(
      new NextRequest('http://localhost/api/epapers/latest?limit=20')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]._id).toBe(storedPaper._id);
  });

  it('bounds a stalled latest-feed query before serving stored data', async () => {
    process.env.MONGODB_PUBLIC_QUERY_TIMEOUT_MS = '10';
    latestLeanMock.mockReturnValue(new Promise(() => undefined));

    const response = await getLatestPublicEpapers(
      new NextRequest('http://localhost/api/epapers/latest?limit=20')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items[0]._id).toBe(storedPaper._id);
    expect(reportMongoUnavailableMock).toHaveBeenCalledOnce();
    delete process.env.MONGODB_PUBLIC_QUERY_TIMEOUT_MS;
  });
});
