import 'server-only';

import { revalidatePath } from 'next/cache';
import { canEditEpaper, canPublishEpaper, canViewPage } from '@/lib/auth/permissions';
import { makeReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';
import { buildEpaperActivityMessage, recordEpaperActivity } from '@/lib/server/epaperActivity';
import { applyEpaperWorkflowAutomation } from '@/lib/server/epaperWorkflowAutomation';
import { assertEpaperDraftEditable } from '@/lib/server/epaperWorkflowPolicy';
import { buildEpaperStoryTtsText, findReadyManualTtsAsset } from '@/lib/server/ttsAssets';
import {
  buildEpaperPlaceholderTitle,
  normalizeHotspot,
  resolveUniqueSlug,
  validateHotspot,
} from '@/lib/utils/epaperArticles';
import { isAllowedAssetPath } from '@/lib/utils/epaperStorage';
import { asObject, toIsoDate, toPositiveInt } from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import {
  EpaperConflictError,
  EpaperForbiddenError,
  EpaperNotFoundError,
  EpaperValidationError,
  InvalidEpaperIdError,
  type AdminSessionIdentity,
} from './epaperTypes';

function mapIdentity(value: unknown) {
  const source = asObject(value);
  return Object.keys(source).length ? {
    id: String(source.id || ''), name: String(source.name || ''), email: String(source.email || ''), role: String(source.role || ''),
  } : null;
}

export function mapAdminEpaperArticle(value: unknown) {
  const source = asObject(value);
  const hotspot = asObject(source.hotspot);
  const workflow = asObject(source.workflow);
  return {
    _id: String(source._id || ''), epaperId: String(source.epaperId || ''), pageNumber: Number(source.pageNumber || 1),
    title: String(source.title || ''), slug: String(source.slug || ''), excerpt: String(source.excerpt || ''),
    contentHtml: String(source.contentHtml || ''), coverImagePath: String(source.coverImagePath || ''),
    hotspot: { x: Number(hotspot.x || 0), y: Number(hotspot.y || 0), w: Number(hotspot.w || 0), h: Number(hotspot.h || 0) },
    workflow: Object.keys(workflow).length ? {
      status: typeof workflow.status === 'string' ? workflow.status : 'draft',
      priority: typeof workflow.priority === 'string' ? workflow.priority : 'normal',
      createdBy: mapIdentity(workflow.createdBy), assignedTo: mapIdentity(workflow.assignedTo), reviewedBy: mapIdentity(workflow.reviewedBy),
      submittedAt: toIsoDate(workflow.submittedAt) || null, approvedAt: toIsoDate(workflow.approvedAt) || null,
      rejectedAt: toIsoDate(workflow.rejectedAt) || null, publishedAt: toIsoDate(workflow.publishedAt) || null,
      scheduledFor: toIsoDate(workflow.scheduledFor) || null, dueAt: toIsoDate(workflow.dueAt) || null,
      rejectionReason: typeof workflow.rejectionReason === 'string' ? workflow.rejectionReason : '',
      comments: Array.isArray(workflow.comments) ? workflow.comments.map((entry) => {
        const comment = asObject(entry); return { id: String(comment.id || ''), body: String(comment.body || ''),
          kind: String(comment.kind || 'comment'), author: mapIdentity(comment.author),
          createdAt: toIsoDate(comment.createdAt) || new Date(0).toISOString() };
      }) : [],
    } : undefined,
    createdAt: source.createdAt, updatedAt: source.updatedAt,
  };
}

function isHttpUrl(value: string) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export class EpaperArticleService {
  constructor(private readonly repo: EpaperRepository = epaperRepository) {}

  async list(actor: AdminSessionIdentity, id: string, pageNumber?: number) {
    if (!canViewPage(actor.role, 'epapers')) throw new EpaperForbiddenError();
    this.assertId(id); await this.repo.connect();
    return (await this.repo.listArticlesByQuery({ epaperId: id, ...(pageNumber ? { pageNumber } : {}) })).map(mapAdminEpaperArticle);
  }

  async create(actor: AdminSessionIdentity, id: string, body: unknown) {
    if (!canEditEpaper(actor.role)) throw new EpaperForbiddenError();
    this.assertId(id); await this.repo.connect();
    const paper = await this.repo.findEditionById(id, '_id pageCount pages title cityName publishDate status productionStatus');
    if (!paper) throw new EpaperNotFoundError();
    try { assertEpaperDraftEditable(paper); } catch (error) {
      throw new EpaperConflictError(error instanceof Error ? error.message : 'Edition is immutable.');
    }
    const source = asObject(body);
    const pageNumber = toPositiveInt(source.pageNumber);
    const requestedTitle = typeof source.title === 'string' ? source.title.trim() : '';
    const slugInput = typeof source.slug === 'string' ? source.slug.trim() : '';
    const excerpt = typeof source.excerpt === 'string' ? source.excerpt.trim() : '';
    const contentHtml = typeof source.contentHtml === 'string' ? source.contentHtml.trim() : '';
    const coverImagePath = typeof source.coverImagePath === 'string' ? source.coverImagePath.trim() : '';
    const hotspot = normalizeHotspot(source.hotspot);
    if (!pageNumber) throw new EpaperValidationError('pageNumber is required');
    if (pageNumber > Number(paper.pageCount || 0)) throw new EpaperValidationError(`pageNumber must be between 1 and ${paper.pageCount}`);
    if (requestedTitle.length > 220) throw new EpaperValidationError('title is too long (max 220 chars)');
    if (excerpt.length > 1000) throw new EpaperValidationError('excerpt is too long (max 1000 chars)');
    if (coverImagePath && !(coverImagePath.startsWith('/') ? isAllowedAssetPath(coverImagePath) : isHttpUrl(coverImagePath))) {
      throw new EpaperValidationError('coverImagePath must be a valid legacy upload path or an http(s) URL');
    }
    const hotspotError = validateHotspot(hotspot);
    if (hotspotError) throw new EpaperValidationError(hotspotError);
    const count = requestedTitle ? 0 : await this.repo.countArticles({ epaperId: id, pageNumber });
    const title = requestedTitle || buildEpaperPlaceholderTitle(pageNumber, count + 1);
    const slug = await resolveUniqueSlug(slugInput || title, (candidate) => this.repo.articleExists({ epaperId: id, slug: candidate }));
    const page = Array.isArray(paper.pages) ? paper.pages.map(asObject).find((entry) => Number(entry.pageNumber) === pageNumber) : undefined;
    const now = new Date();
    const created = await this.repo.createArticle({ epaperId: id, pageNumber, title, slug, excerpt, contentHtml, coverImagePath, hotspot,
      releasedSnapshot: { title, slug, pageNumber, excerpt, contentHtml, coverImagePath, pageImagePath: String(page?.imagePath || ''), hotspot: { ...hotspot },
        version: 1, releasedAt: now.toISOString(), releasedById: actor.id, sourceUpdatedAt: now.toISOString() },
      workflow: { status: 'published', publishedAt: now, reviewedBy: { id: actor.id, name: actor.name || actor.email || 'Admin', email: actor.email || '', role: actor.role } } });
    await recordEpaperActivity({ epaperId: id, actor, action: 'story_created', message: buildEpaperActivityMessage({ action: 'story_created' }),
      metadata: { articleId: String(created._id || ''), pageNumber, title } });
    const pages = Array.isArray(paper.pages) ? paper.pages.map(asObject).map((entry) => Number(entry.pageNumber) === pageNumber
      ? { ...entry, reviewStatus: 'ready', reviewedAt: now, reviewedBy: actor.id } : entry) : [];
    await this.repo.updateEdition(id, { pages });
    await applyEpaperWorkflowAutomation({ epaperId: id, actor, reason: 'A mapped e-paper story was created.' });
    return mapAdminEpaperArticle(created);
  }

  async release(actor: AdminSessionIdentity, id: string, articleId: string, expectedUpdatedAt: unknown) {
    if (!canPublishEpaper(actor.role)) throw new EpaperForbiddenError('Only admins can release reader stories.');
    if (!this.repo.isValidId(id) || !this.repo.isValidId(articleId)) throw new EpaperValidationError('Invalid publication or story ID.');
    const expected = new Date(String(expectedUpdatedAt || ''));
    if (!Number.isFinite(expected.getTime())) throw new EpaperValidationError('Save and reload the story before releasing it.');
    await this.repo.connect();
    const [paper, story] = await Promise.all([
      this.repo.findEdition({ _id: id, status: 'published', isCurrentRevision: { $ne: false } }),
      this.repo.findArticle({ _id: articleId, epaperId: id }),
    ]);
    if (!paper || !story) throw new EpaperNotFoundError('Published issue or story not found.');
    const released = asObject(story.releasedSnapshot);
    if (released.sourceUpdatedAt === expected.toISOString()) return Number(released.version || 0);
    if (new Date(String(story.updatedAt)).getTime() !== expected.getTime()) {
      throw new EpaperConflictError('Story changed. Reload and review the latest saved version.');
    }
    const pages = Array.isArray(paper.pages) ? paper.pages.map(asObject) : [];
    const page = pages.find((entry) => Number(entry.pageNumber) === Number(story.pageNumber));
    if (!page) throw new EpaperNotFoundError('Page not found.');
    const now = new Date();
    if (page.reviewStatus !== 'ready' || !page.reviewedAt || new Date(String(page.reviewedAt)).getTime() < expected.getTime()) {
      await this.repo.markPageReady(id, Number(story.pageNumber), { id: actor.id, name: actor.name || actor.email || 'Admin', email: actor.email || '', role: actor.role }, now);
      page.reviewStatus = 'ready'; page.reviewedAt = now;
    }
    let snapshot;
    try {
      snapshot = makeReleasedEpaperStory({ ...story, pageImagePath: page.imagePath }, actor.id, Number(released.version || 0) + 1);
    } catch (error) {
      throw new EpaperValidationError(error instanceof Error ? error.message : 'Invalid story.');
    }
    const audio = await findReadyManualTtsAsset({ sourceType: 'epaperArticle', sourceId: articleId, variant: 'epaper_story', expectedText: buildEpaperStoryTtsText(story) });
    if (audio) snapshot.audio = { audioUrl: audio.audioUrl, model: audio.model, voice: audio.voice, mimeType: audio.mimeType, chunkCount: audio.chunkCount };
    const updated = await this.repo.updateArticleConditional({ _id: articleId, epaperId: id, updatedAt: expected }, { $set: { releasedSnapshot: snapshot } });
    if (!updated) throw new EpaperConflictError('Story changed during release. Reload before retrying.');
    await recordEpaperActivity({ epaperId: id, actor, action: 'story_released', message: 'Reviewed story released to the public reader.', metadata: { articleId, version: snapshot.version } });
    revalidatePath('/main/epaper'); revalidatePath('/main/e-magazine');
    return snapshot.version;
  }

  private assertId(id: string) {
    if (!this.repo.isValidId(id)) throw new InvalidEpaperIdError();
  }
}

export const epaperArticleService = new EpaperArticleService();
