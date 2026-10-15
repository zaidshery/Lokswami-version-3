import 'server-only';

import { canEditEpaper } from '@/lib/auth/permissions';
import { resolveReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';
import { buildEpaperStoryTtsText, findReadyManualTtsAsset } from '@/lib/server/ttsAssets';
import { asObject, toPositiveInt } from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import { EpaperForbiddenError, EpaperNotFoundError, EpaperStoreUnavailableError, EpaperValidationError, type AdminSessionIdentity } from './epaperTypes';

function serializeAsset(value: unknown) {
  const source = asObject(value);
  return {
    id: String(source._id || ''), status: String(source.status || ''), provider: String(source.provider || ''),
    audioUrl: String(source.audioUrl || ''), voice: String(source.voice || ''), model: String(source.model || ''),
    languageCode: String(source.languageCode || ''), mimeType: String(source.mimeType || ''),
    generatedAt: source.generatedAt instanceof Date ? source.generatedAt.toISOString() : String(source.generatedAt || ''),
    updatedAt: source.updatedAt instanceof Date ? source.updatedAt.toISOString() : String(source.updatedAt || ''),
    lastVerifiedAt: source.lastVerifiedAt instanceof Date ? source.lastVerifiedAt.toISOString() : String(source.lastVerifiedAt || ''),
    lastError: String(source.lastError || ''), chunkCount: Number(source.chunkCount || 0), charCount: Number(source.charCount || 0),
  };
}

export class EpaperTtsService {
  constructor(private readonly repo: EpaperRepository = epaperRepository) {}

  async publicStory(paperId: string, storyId: string) {
    if (!paperId.trim() || !storyId.trim()) throw new EpaperValidationError('Invalid e-paper story ID');
    const store = await this.repo.resolveAdminStore('e-paper TTS route');
    if (store === 'file') {
      const paper = asObject(await this.repo.getStoredById(paperId));
      const hotspots = Array.isArray(paper.articleHotspots) ? paper.articleHotspots.map(asObject) : [];
      const index = hotspots.findIndex((hotspot, offset) => `${String(paper._id)}-${String(hotspot.id || offset + 1)}` === storyId);
      if (index < 0) throw new EpaperNotFoundError('Story not found');
      const hotspot = hotspots[index];
      return this.publicAudioResult({ title: String(hotspot.title || '').trim() || `Story ${index + 1}`, excerpt: String(hotspot.text || '').trim(), contentHtml: '' });
    }
    if (!this.repo.isValidId(paperId) || !this.repo.isValidId(storyId)) throw new EpaperNotFoundError('Story not found');
    const paper = await this.repo.findEditionById(paperId, '_id title cityName publishDate status isCurrentRevision');
    if (!paper || paper.status !== 'published' || paper.isCurrentRevision === false) throw new EpaperNotFoundError('Story not found');
    const record = await this.repo.findArticle({ _id: storyId, epaperId: paperId }, '_id epaperId releasedSnapshot');
    const story = resolveReleasedEpaperStory(record);
    if (!story) throw new EpaperNotFoundError('Story not found');
    const audio = asObject(story.audio);
    if (audio.audioUrl) return { provider: 'manual', model: audio.model, voice: audio.voice, mimeType: audio.mimeType, chunkCount: audio.chunkCount, audioUrl: audio.audioUrl };
    return this.publicAudioResult(story);
  }

  disabledAutoGeneration(actor: AdminSessionIdentity) {
    this.authorize(actor);
    return 'Auto-TTS generation has been removed. Upload audio files manually via the e-paper asset upload.';
  }

  async adminStoryStatus(actor: AdminSessionIdentity, paperId: string, storyId: string) {
    this.authorize(actor);
    if (!process.env.MONGODB_URI?.trim()) throw new EpaperStoreUnavailableError('Shared admin TTS controls require MongoDB.');
    try { await this.repo.connect(); } catch {
      throw new EpaperStoreUnavailableError('Shared admin TTS controls are unavailable right now.');
    }
    if (!this.repo.isValidId(paperId) || !this.repo.isValidId(storyId)) throw new EpaperNotFoundError('Story not found');
    const [paper, story] = await Promise.all([
      this.repo.findEditionById(paperId, '_id title cityName publishDate'),
      this.repo.findArticle({ _id: storyId, epaperId: paperId }, '_id epaperId pageNumber title excerpt contentHtml'),
    ]);
    if (!paper || !story) throw new EpaperNotFoundError('Story not found');
    const asset = await findReadyManualTtsAsset({ sourceType: 'epaperArticle', sourceId: storyId, variant: 'epaper_story', actor });
    if (asset?.audioUrl) return { variant: 'epaper_story', eligible: true, ready: true, asset: serializeAsset(asset), message: 'Manual story listen audio is ready.' };
    const eligible = Boolean(buildEpaperStoryTtsText(story));
    return { variant: 'epaper_story', eligible, ready: false, asset: null,
      message: eligible ? 'No manual listen audio has been uploaded for this story yet.' : 'Save readable text for this story before uploading listen audio.' };
  }

  async bulkDisabled(actor: AdminSessionIdentity, paperId: string, body: unknown) {
    this.authorize(actor); if (!this.repo.isValidId(paperId)) throw new EpaperValidationError('Invalid e-paper ID');
    await this.repo.connect();
    const paper = await this.repo.findEditionById(paperId, '_id title cityName publishDate');
    if (!paper) throw new EpaperNotFoundError();
    const pageNumber = toPositiveInt(asObject(body).pageNumber);
    const stories = await this.repo.listArticlesByQuery({ epaperId: paperId, ...(pageNumber ? { pageNumber } : {}) });
    const result = { processed: stories.length, ready: 0, failed: 0, skipped: 0,
      message: 'Auto-TTS generation is disabled. Upload audio files manually for each story via the e-paper editor.' };
    for (const story of stories) {
      if (buildEpaperStoryTtsText(story)) result.skipped += 1;
      else result.failed += 1;
    }
    await this.repo.createTtsAuditEvent({ action: 'generate', result: 'skipped', actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
      message: 'Admin e-paper bulk TTS requested but auto-generation is disabled.', metadata: { epaperId: paperId, pageNumber: pageNumber || null, result } });
    return result;
  }

  private authorize(actor: AdminSessionIdentity) {
    if (!canEditEpaper(actor.role)) throw new EpaperForbiddenError();
  }

  private publicAudioResult(story: { title?: unknown; excerpt?: unknown; contentHtml?: unknown }) {
    if (!buildEpaperStoryTtsText({ title: String(story.title || ''), excerpt: String(story.excerpt || ''), contentHtml: String(story.contentHtml || '') })) throw new EpaperValidationError('Readable text is not available for this story yet.');
    throw new EpaperNotFoundError('No manual audio has been uploaded for this story yet. Upload audio from the admin e-paper editor.');
  }
}

export const epaperTtsService = new EpaperTtsService();
