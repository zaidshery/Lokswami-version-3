import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpaperConflictError, EpaperForbiddenError, EpaperNotFoundError, EpaperValidationError } from '@/lib/server/epaper/epaperTypes';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(), create: vi.fn(), get: vi.fn(), updateMetadata: vi.fn(), updateWorkflow: vi.fn(), remove: vi.fn(), activity: vi.fn(),
  listArticles: vi.fn(), createArticle: vi.fn(), release: vi.fn(),
  updatePages: vi.fn(), listOcr: vi.fn(), queueOcr: vi.fn(), reviewOcr: vi.fn(),
  processingStatus: vi.fn(), processingRetry: vi.fn(), crop: vi.fn(),
  createRevision: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({ getAdminSession: mocks.session, getAdminSessionFromReq: mocks.session }));
vi.mock('@/lib/server/epaper/epaperEditorialService', () => ({ epaperEditorialService: {
  list: mocks.list, create: mocks.create, get: mocks.get, updateMetadata: mocks.updateMetadata,
  updateWorkflow: mocks.updateWorkflow, delete: mocks.remove, activity: mocks.activity,
} }));
vi.mock('@/lib/server/epaper/epaperArticleService', () => ({ epaperArticleService: {
  list: mocks.listArticles, create: mocks.createArticle, release: mocks.release,
} }));
vi.mock('@/lib/server/epaper/epaperPageService', () => ({ epaperPageService: { update: mocks.updatePages } }));
vi.mock('@/lib/server/epaper/epaperOcrService', () => ({ epaperOcrService: { list: mocks.listOcr, queue: mocks.queueOcr, review: mocks.reviewOcr } }));
vi.mock('@/lib/server/epaper/epaperProcessingService', () => ({ epaperProcessingService: { status: mocks.processingStatus, retry: mocks.processingRetry } }));
vi.mock('@/lib/server/epaper/epaperCropService', () => ({ epaperCropService: { crop: mocks.crop } }));
vi.mock('@/lib/server/epaper/epaperRevisionService', () => ({ epaperRevisionService: { create: mocks.createRevision } }));

const actor = { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' as const };
const id = '507f1f77bcf86cd799439011';
const articleId = '507f1f77bcf86cd799439012';

function request(path: string, method = 'GET', body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('Phase 2.4 admin E-Paper domain contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.session.mockResolvedValue(actor);
    mocks.list.mockResolvedValue({ data: [{ _id: id }], pagination: { total: 1, page: 1, limit: 20, pages: 1 } });
    mocks.create.mockResolvedValue({ message: 'E-Paper created successfully', data: { _id: id } });
    mocks.get.mockResolvedValue({ _id: id });
    mocks.updateMetadata.mockResolvedValue({ message: 'E-paper updated successfully', data: { _id: id, title: 'Updated' } });
    mocks.updateWorkflow.mockResolvedValue({ message: 'Edition updated', data: { _id: id, productionStatus: 'pages_ready' } });
    mocks.remove.mockResolvedValue({ message: 'E-paper and associated assets deleted' });
    mocks.activity.mockResolvedValue([]);
    mocks.listArticles.mockResolvedValue([]); mocks.createArticle.mockResolvedValue({ _id: articleId }); mocks.release.mockResolvedValue(2);
    mocks.updatePages.mockResolvedValue({ message: 'Page images updated', data: { _id: id } });
    mocks.listOcr.mockResolvedValue([]); mocks.queueOcr.mockResolvedValue({ message: 'OCR queued.', data: { jobIds: ['j1'], queued: 1, paused: true } });
    mocks.processingStatus.mockResolvedValue({ job: null, pageCount: 1, pages: [], productionStatus: 'hotspot_mapping', stuckWarning: '' });
    mocks.processingRetry.mockResolvedValue({ message: 'Page processing retry queued.', data: { jobId: 'j1', pageNumbers: [1] } });
    mocks.createRevision.mockResolvedValue({ message: 'Draft revision 2 created.', data: { revisionId: id, familyId: 'family-1', revisionNumber: 2 } });
  });

  it('preserves the historical revision success status and response body', async () => {
    const { POST } = await import('@/app/api/admin/epapers/[id]/revisions/route');
    const response = await POST(request(`/api/admin/epapers/${id}/revisions`, 'POST'), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Draft revision 2 created.',
      data: { revisionId: id, familyId: 'family-1', revisionNumber: 2 },
    });
    expect(mocks.createRevision).toHaveBeenCalledWith(actor, id);
  });

  it('preserves 401 when the admin session is missing', async () => {
    mocks.session.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/admin/epapers/route');
    expect((await GET(request('/api/admin/epapers'))).status).toBe(401);
  });

  it('maps list and create results without changing their envelopes', async () => {
    const route = await import('@/app/api/admin/epapers/route');
    const listed = await route.GET(request('/api/admin/epapers?publicationType=epaper'));
    expect(listed.status).toBe(200); expect((await listed.json()).pagination.total).toBe(1);
    const created = await route.POST(request('/api/admin/epapers', 'POST', { title: 'Edition' }));
    expect(created.status).toBe(201); expect((await created.json()).success).toBe(true);
  });

  it('preserves detail, metadata, workflow, and delete envelopes', async () => {
    const route = await import('@/app/api/admin/epapers/[id]/route');
    const context = { params: Promise.resolve({ id }) };
    expect((await route.GET(request(`/api/admin/epapers/${id}`), context)).status).toBe(200);
    expect((await route.PUT(request(`/api/admin/epapers/${id}`, 'PUT', { title: 'Updated' }), context)).status).toBe(200);
    expect((await route.PATCH(request(`/api/admin/epapers/${id}`, 'PATCH', { productionStatus: 'pages_ready' }), context)).status).toBe(200);
    expect((await route.DELETE(request(`/api/admin/epapers/${id}`, 'DELETE'), context)).status).toBe(200);
  });

  it.each([
    [new EpaperValidationError('Invalid e-paper ID'), 400],
    [new EpaperForbiddenError(), 403],
    [new EpaperNotFoundError(), 404],
    [new EpaperConflictError('Edition is immutable.'), 409],
  ])('maps typed domain errors to their original status', async (error, status) => {
    mocks.get.mockRejectedValueOnce(error);
    const { GET } = await import('@/app/api/admin/epapers/[id]/route');
    expect((await GET(request(`/api/admin/epapers/${id}`), { params: Promise.resolve({ id }) })).status).toBe(status);
  });

  it('delegates page and article management', async () => {
    const pages = await import('@/app/api/admin/epapers/[id]/pages/route');
    const pageResponse = await pages.PUT(request(`/api/admin/epapers/${id}/pages`, 'PUT', { pages: [{ pageNumber: 1 }] }), { params: Promise.resolve({ id }) });
    expect(pageResponse.status).toBe(200); expect(mocks.updatePages).toHaveBeenCalled();
    const articles = await import('@/app/api/admin/epapers/[id]/articles/route');
    expect((await articles.GET(request(`/api/admin/epapers/${id}/articles?pageNumber=1`), { params: Promise.resolve({ id }) })).status).toBe(200);
    expect((await articles.POST(request(`/api/admin/epapers/${id}/articles`, 'POST', { pageNumber: 1 }), { params: Promise.resolve({ id }) })).status).toBe(201);
  });

  it('preserves explicit release success and CAS conflict responses', async () => {
    const { POST } = await import('@/app/api/admin/epapers/[id]/articles/[articleId]/release/route');
    const context = { params: Promise.resolve({ id, articleId }) };
    const released = await POST(request('/release', 'POST', { expectedUpdatedAt: '2026-09-01T00:00:00.000Z' }), context);
    expect(await released.json()).toEqual({ success: true, version: 2 });
    mocks.release.mockRejectedValueOnce(new EpaperConflictError('Story changed during release. Reload before retrying.'));
    expect((await POST(request('/release', 'POST', { expectedUpdatedAt: '2026-09-01T00:00:00.000Z' }), context)).status).toBe(409);
  });

  it('preserves OCR list and 202 queued/paused contract', async () => {
    const route = await import('@/app/api/admin/epapers/[id]/ocr/route');
    const context = { params: Promise.resolve({ id }) };
    expect((await route.GET(request(`/ocr?pageNumber=1&status=pending`), context)).status).toBe(200);
    const queued = await route.POST(request('/ocr', 'POST', { pageNumbers: [1] }), context);
    expect(queued.status).toBe(202); expect((await queued.json()).data.paused).toBe(true);
  });

  it('preserves OCR queue 503 failures', async () => {
    mocks.queueOcr.mockRejectedValueOnce(new Error('queue down'));
    const { POST } = await import('@/app/api/admin/epapers/[id]/ocr/route');
    expect((await POST(request('/ocr', 'POST'), { params: Promise.resolve({ id }) })).status).toBe(503);
  });

  it('delegates processing status and retry', async () => {
    const statusRoute = await import('@/app/api/admin/epapers/[id]/processing/route');
    expect((await statusRoute.GET(request('/processing'), { params: Promise.resolve({ id }) })).status).toBe(200);
    const retryRoute = await import('@/app/api/admin/epapers/[id]/processing/retry/route');
    expect((await retryRoute.POST(request('/processing/retry', 'POST', { pageNumbers: [1] }), { params: Promise.resolve({ id }) })).status).toBe(200);
  });
});
