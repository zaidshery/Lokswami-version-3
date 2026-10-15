import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceAuthorizationService } from '@/lib/server/distribution/sourceAuthorizationService';
import type { DistributionActor } from '@/lib/server/distribution/distributionTypes';

const getSocialDraftContentSourcesMock = vi.fn();

vi.mock('@/lib/server/content/socialDistributionContentQueryService', () => ({
  getSocialDraftContentSources: (...args: unknown[]) => getSocialDraftContentSourcesMock(...args),
}));

describe('Phase 3.8C Source Authorization & Pre-dispatch Eligibility', () => {
  const service = new SourceAuthorizationService();

  const superAdminActor: DistributionActor = {
    id: 'super-1',
    name: 'Super Admin',
    email: 'super@example.com',
    role: 'super_admin',
  };

  const adminActor: DistributionActor = {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@example.com',
    role: 'admin',
  };

  const copyEditorActor: DistributionActor = {
    id: 'copy-1',
    name: 'Copy Editor',
    email: 'copy@example.com',
    role: 'copy_editor',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects actors without super_admin social dispatch permissions', async () => {
    const resultAdmin = await service.validateSourceEligibility({
      sourceStoryId: 'story-1',
      actor: adminActor,
    });
    expect(resultAdmin.eligible).toBe(false);
    if (!resultAdmin.eligible) {
      expect(resultAdmin.category).toBe('authorization');
    }

    const resultCopy = await service.validateSourceEligibility({
      sourceStoryId: 'story-1',
      actor: copyEditorActor,
    });
    expect(resultCopy.eligible).toBe(false);
    if (!resultCopy.eligible) {
      expect(resultCopy.category).toBe('authorization');
    }
  });

  it('rejects dispatch if the source Story does not exist', async () => {
    getSocialDraftContentSourcesMock.mockResolvedValue({
      store: 'file',
      story: null,
      article: null,
    });

    const result = await service.validateSourceEligibility({
      sourceStoryId: 'nonexistent-story',
      actor: superAdminActor,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain('SOURCE_STORY_NOT_FOUND');
    }
  });

  it('rejects dispatch if the Story workflow status is rejected or archived', async () => {
    getSocialDraftContentSourcesMock.mockResolvedValue({
      store: 'file',
      story: {
        _id: 'story-1',
        title: 'Story 1',
        workflow: { status: 'rejected' },
        videoUrl: 'https://cdn.example.com/video.mp4',
        linkedArticleId: 'article-1',
      },
      article: {
        _id: 'article-1',
        status: 'published',
      },
    });

    const result = await service.validateSourceEligibility({
      sourceStoryId: 'story-1',
      actor: superAdminActor,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain('SOURCE_STORY_INELIGIBLE');
    }
  });

  it('rejects dispatch if Story video production is marked failed', async () => {
    getSocialDraftContentSourcesMock.mockResolvedValue({
      store: 'file',
      story: {
        _id: 'story-1',
        title: 'Story 1',
        workflow: { status: 'approved' },
        videoProduction: { status: 'failed' },
        videoUrl: 'https://cdn.example.com/video.mp4',
        linkedArticleId: 'article-1',
      },
      article: {
        _id: 'article-1',
        status: 'published',
      },
    });

    const result = await service.validateSourceEligibility({
      sourceStoryId: 'story-1',
      actor: superAdminActor,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain('SOURCE_MEDIA_INELIGIBLE');
    }
  });

  it('rejects dispatch if linked Article is not published', async () => {
    getSocialDraftContentSourcesMock.mockResolvedValue({
      store: 'file',
      story: {
        _id: 'story-1',
        title: 'Story 1',
        workflow: { status: 'approved' },
        videoUrl: 'https://cdn.example.com/video.mp4',
        linkedArticleId: 'article-1',
      },
      article: {
        _id: 'article-1',
        status: 'draft',
      },
    });

    const result = await service.validateSourceEligibility({
      sourceStoryId: 'story-1',
      actor: superAdminActor,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain('SOURCE_ARTICLE_NOT_PUBLISHED');
    }
  });

  it('rejects dispatch if linked Article is withdrawn or archived', async () => {
    getSocialDraftContentSourcesMock.mockResolvedValue({
      store: 'file',
      story: {
        _id: 'story-1',
        title: 'Story 1',
        workflow: { status: 'approved' },
        videoUrl: 'https://cdn.example.com/video.mp4',
        linkedArticleId: 'article-1',
      },
      article: {
        _id: 'article-1',
        status: 'withdrawn',
      },
    });

    const result = await service.validateSourceEligibility({
      sourceStoryId: 'story-1',
      actor: superAdminActor,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain('SOURCE_ARTICLE_WITHDRAWN');
    }
  });

  it('rejects dispatch if linked Article is scheduled for the future', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    getSocialDraftContentSourcesMock.mockResolvedValue({
      store: 'file',
      story: {
        _id: 'story-1',
        title: 'Story 1',
        workflow: { status: 'approved' },
        videoUrl: 'https://cdn.example.com/video.mp4',
        linkedArticleId: 'article-1',
      },
      article: {
        _id: 'article-1',
        status: 'published',
        scheduledFor: futureDate,
      },
    });

    const result = await service.validateSourceEligibility({
      sourceStoryId: 'story-1',
      actor: superAdminActor,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain('SOURCE_ARTICLE_SCHEDULED_FUTURE');
    }
  });

  it('rejects dispatch if video URL is missing', async () => {
    getSocialDraftContentSourcesMock.mockResolvedValue({
      store: 'file',
      story: {
        _id: 'story-1',
        title: 'Story 1',
        workflow: { status: 'approved' },
        videoUrl: '',
        linkedArticleId: 'article-1',
      },
      article: {
        _id: 'article-1',
        status: 'published',
      },
    });

    const result = await service.validateSourceEligibility({
      sourceStoryId: 'story-1',
      actor: superAdminActor,
      payloadSnapshot: {
        caption: 'Caption',
        hashtags: '#Tag',
        thumbnailUrl: '',
        videoUrl: '',
      },
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain('SOURCE_MEDIA_MISSING');
    }
  });

  it('detects and rejects stale revisions', async () => {
    getSocialDraftContentSourcesMock.mockResolvedValue({
      store: 'file',
      story: {
        _id: 'story-1',
        title: 'Story 1',
        workflow: { status: 'approved' },
        videoUrl: 'https://cdn.example.com/video.mp4',
        linkedArticleId: 'article-1',
      },
      article: {
        _id: 'article-1',
        status: 'published',
        version: 5,
      },
    });

    const result = await service.validateSourceEligibility({
      sourceStoryId: 'story-1',
      actor: superAdminActor,
      payloadSnapshot: {
        caption: 'Caption',
        hashtags: '#Tag',
        thumbnailUrl: '',
        videoUrl: 'https://cdn.example.com/video.mp4',
      },
      expectedRevision: 4, // stale
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain('STALE_REVISION');
    }
  });

  it('authorizes dispatch when Story and Article satisfy all criteria', async () => {
    getSocialDraftContentSourcesMock.mockResolvedValue({
      store: 'file',
      story: {
        _id: 'story-1',
        title: 'Story 1',
        workflow: { status: 'approved' },
        videoUrl: 'https://cdn.example.com/video.mp4',
        linkedArticleId: 'article-1',
      },
      article: {
        _id: 'article-1',
        status: 'published',
        version: 2,
      },
    });

    const result = await service.validateSourceEligibility({
      sourceStoryId: 'story-1',
      actor: superAdminActor,
      payloadSnapshot: {
        caption: 'Caption',
        hashtags: '#Tag',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        videoUrl: 'https://cdn.example.com/video.mp4',
      },
      expectedRevision: 2,
    });
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.sourceRevision).toBe(2);
      expect(result.story).toBeDefined();
      expect(result.article).toBeDefined();
    }
  });
});
