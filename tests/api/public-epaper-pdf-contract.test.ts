import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpaperNotFoundError, EpaperValidationError } from '@/lib/server/epaper/epaperTypes';

const mocks = vi.hoisted(() => ({ resolvePublicPdfUrl: vi.fn() }));

vi.mock('@/lib/server/epaper/epaperService', () => ({
  epaperService: { resolvePublicPdfUrl: mocks.resolvePublicPdfUrl },
}));

const id = '507f1f77bcf86cd799439011';
const context = { params: Promise.resolve({ id }) };

describe('public E-Paper PDF contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves the 302 redirect and no-store cache contract', async () => {
    mocks.resolvePublicPdfUrl.mockResolvedValue('https://cdn.example.com/epapers/edition.pdf');
    const { GET } = await import('@/app/api/public/epapers/[id]/pdf/route');
    const response = await GET(new NextRequest(`http://localhost/api/public/epapers/${id}/pdf`), context);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://cdn.example.com/epapers/edition.pdf');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('preserves a 404 for an unknown edition', async () => {
    mocks.resolvePublicPdfUrl.mockRejectedValue(new EpaperNotFoundError('E-paper not found'));
    const { GET } = await import('@/app/api/public/epapers/[id]/pdf/route');
    const response = await GET(new NextRequest(`http://localhost/api/public/epapers/${id}/pdf`), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'E-paper not found' });
  });

  it('preserves a 502 when persisted PDF metadata cannot produce a safe URL', async () => {
    mocks.resolvePublicPdfUrl.mockRejectedValue(new EpaperValidationError('DigitalOcean Spaces PDF metadata not available'));
    const { GET } = await import('@/app/api/public/epapers/[id]/pdf/route');
    const response = await GET(new NextRequest(`http://localhost/api/public/epapers/${id}/pdf`), context);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'DigitalOcean Spaces PDF metadata not available',
    });
  });
});
