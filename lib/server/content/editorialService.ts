import type { AdminSessionIdentity } from '@/lib/auth/admin';
import {
  canCreateContent,
  canDeleteContent,
  canEditContent,
  canEditEpaper,
  canReadContent,
  canTransitionContent,
  canViewPage,
} from '@/lib/auth/permissions';
import { isReporterDeskRole } from '@/lib/auth/roles';
import { isWorkflowPriority, isWorkflowStatus } from '@/lib/workflow/types';
import {
  deleteStoredBreakingAudio,
  ensureBreakingTtsForArticle,
} from '@/lib/server/breakingTts';
import {
  buildArticleActivityMessage,
  recordArticleActivity,
} from '@/lib/server/articleActivity';
import { notifyWorkflowEvent } from '@/lib/server/workflowNotificationEvents';
import {
  clearStoryLinkedArticle,
  getPrimaryArticleForStory,
  getStoryRecordForArticleLinking,
  syncStoryLinkedArticle,
  validateStoryForArticleCreation,
} from '@/lib/server/newsroomStoryLinks';
import {
  normalizeArticleSlug,
  readArticleCanonicalEdit,
  resolveUniqueArticleSlug,
  validateArticleCanonicalOverride,
  validateEditedArticleCanonicalOverride,
} from '@/lib/seo/articleSeo';
import {
  applyArticleWorkflowAction,
  resolveArticleWorkflow,
} from '@/lib/workflow/article';
import { validateFastPublish } from '@/lib/workflow/fastPublish';
import {
  ArticleNotFoundError,
  ArticleVersionConflictError,
  EditorialForbiddenError,
  EditorialValidationError,
  type NewsroomListQuery,
  type NewsroomListResult,
  type WorkflowActionBody,
} from './newsroomArticleTypes';
import {
  checkSlugConflict,
  createNewsroomArticle,
  deleteNewsroomArticleWithCas,
  findArticleById,
  listAllNewsroomArticles,
  resolveArticleVersion,
  resolveAssignee,
  shouldUseFileStore,
  updateNewsroomArticleWithCas,
} from './newsroomArticleRepository';
import {
  BREAKING_AUDIO_REQUIRED_ERROR,
  applyEditorialFlagApproval,
  buildArticlePermissionRecord,
  buildInitialWorkflow,
  buildRevisionSnapshot,
  compactMetadata,
  isBreakingArticleMissingAudio,
  isWorkflowAction,
  matchesListFilters,
  normalizeFullInput,
  normalizePartialInput,
  normalizeSeo,
  parseExpectedVersion,
  parseOptionalDate,
  resolveArticleResponse,
  resolveBreakingAudioUrl,
  resolveNextBreakingTts,
  sanitizeReporterArticleInput,
  toStoredWorkflowUpdate,
  validateArticleCreationReadiness,
  validateLengths,
  validateRequired,
  validateWorkflowReadiness,
} from './newsroomArticleValidation';
import { findEpaperArticle, mapEpaperArticle } from '../epaper/adminArticleCompat';
import { EditorialRevisionService } from './editorialRevisionService';

export class EditorialService {
  /**
   * Retrieves an article for newsroom detail view, enforcing RBAC read checks.
   */
  static async getArticleForNewsroom(
    id: string,
    actor: AdminSessionIdentity
  ): Promise<{ kind: 'article'; data: Record<string, unknown> } | { kind: 'epaper'; data: Record<string, unknown> }> {
    if (!canViewPage(actor.role, 'articles')) {
      throw new EditorialForbiddenError();
    }

    const article = await findArticleById(id);
    if (article) {
      if (
        !canReadContent(actor, buildArticlePermissionRecord(article), {
          allowViewerRead: true,
        })
      ) {
        throw new EditorialForbiddenError();
      }
      return { kind: 'article', data: resolveArticleResponse(article) };
    }

    // Fallback: Check if this was an E-Paper article
    const epaperArticle = await findEpaperArticle(id);
    if (epaperArticle) {
      if (!canEditEpaper(actor.role)) {
        throw new EditorialForbiddenError();
      }
      return { kind: 'epaper', data: mapEpaperArticle(epaperArticle) };
    }

    throw new ArticleNotFoundError();
  }

  /**
   * Lists newsroom articles with RBAC filtering, search scopes, and pagination.
   */
  static async listArticlesForNewsroom(
    query: NewsroomListQuery,
    actor: AdminSessionIdentity
  ): Promise<NewsroomListResult> {
    if (!canViewPage(actor.role, 'articles')) {
      throw new EditorialForbiddenError();
    }

    const category = query.category || null;
    const requestedScope = query.scope || 'all';
    const effectiveScope =
      isReporterDeskRole(actor.role) && requestedScope === 'all' ? 'mine' : requestedScope;
    const workflowStatus = String(query.workflowStatus || '').trim().toLowerCase();
    const assignedTo = String(query.assignedTo || '').trim() || null;
    const createdBy = String(query.createdBy || '').trim() || null;
    const page = Math.max(1, query.page || 1);
    const isUnbounded = query.limit === null || query.limit === undefined || query.limit <= 0;
    const effectiveLimit = isUnbounded ? 1000 : Math.min(100, query.limit || 10);

    const { articles } = await listAllNewsroomArticles({ category });

    const filtered = articles
      .map((article) => resolveArticleResponse(article))
      .filter((article) => (category && category !== 'all' ? article.category === category : true))
      .filter((article) =>
        matchesListFilters(article, actor, {
          scope: effectiveScope,
          workflowStatus: isWorkflowStatus(workflowStatus) ? workflowStatus : '',
          assignedTo,
          createdBy,
        })
      )
      .sort(
        (left, right) =>
          new Date(String(right.updatedAt || right.publishedAt || 0)).getTime() -
          new Date(String(left.updatedAt || left.publishedAt || 0)).getTime()
      );

    const total = filtered.length;
    const paginated = isUnbounded
      ? filtered
      : filtered.slice((page - 1) * effectiveLimit, (page - 1) * effectiveLimit + effectiveLimit);

    return {
      data: paginated,
      pagination: {
        total,
        page: isUnbounded ? 1 : page,
        limit: isUnbounded ? total : effectiveLimit,
        pages: isUnbounded ? 1 : Math.ceil(total / effectiveLimit),
      },
    };
  }

  /**
   * Creates a new newsroom article draft, handling validation, initial workflow, and story links.
   */
  static async createDraft(
    body: unknown,
    actor: AdminSessionIdentity
  ): Promise<Record<string, unknown>> {
    if (!canViewPage(actor.role, 'article_create') || !canCreateContent(actor.role, 'article')) {
      throw new EditorialForbiddenError();
    }

    const bodyRecord = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
    const intentRaw = String(bodyRecord.intent || 'draft').toLowerCase();
    const intent: 'draft' | 'submit' | 'publish' =
      intentRaw === 'draft' || intentRaw === 'submit' ? intentRaw : 'publish';

    const normalizedInput = normalizeFullInput(body);
    const input = isReporterDeskRole(actor.role)
      ? sanitizeReporterArticleInput(normalizedInput, actor)
      : normalizedInput;

    if (input.isBreaking || input.isTrending) {
      input.editorial.flagApprovedBy = actor.name || actor.email;
    } else {
      input.editorial.flagApprovedBy = '';
    }

    const breakingAudioUploadPending = Boolean(bodyRecord.breakingAudioUploadPending);
    const validationError = validateLengths(input as unknown as Record<string, unknown>);

    const workflow = buildInitialWorkflow(intent, actor, {
      deferPublish: intent === 'publish' && input.isBreaking && breakingAudioUploadPending,
    });

    if (
      intent === 'publish' &&
      !canTransitionContent(
        actor,
        { workflow: { status: 'approved' } },
        'publish'
      )
    ) {
      throw new EditorialForbiddenError('You do not have permission to publish articles directly.');
    }

    if (intent === 'publish' && input.isBreaking && !breakingAudioUploadPending) {
      throw new EditorialValidationError(BREAKING_AUDIO_REQUIRED_ERROR, 400);
    }

    if (validationError) {
      throw new EditorialValidationError(validationError, 400);
    }

    if (intent !== 'draft' && !isReporterDeskRole(actor.role)) {
      const readinessError = validateArticleCreationReadiness(input, {
        breakingAudioReady:
          breakingAudioUploadPending || Boolean(bodyRecord.breakingAudioReady),
        requireBreakingAudio: intent === 'publish' && input.isBreaking,
      });
      if (readinessError) {
        throw new EditorialValidationError(readinessError, 400);
      }
    }

    let sourceStoryTitle = '';
    if (input.sourceStoryId) {
      if (actor.role === 'reporter') {
        throw new EditorialForbiddenError(
          'Reporters cannot create linked articles directly from story packages.'
        );
      }

      const useFileStore = await shouldUseFileStore();
      const sourceStory = await getStoryRecordForArticleLinking({
        useFileStore,
        storyId: input.sourceStoryId,
      });
      const storyValidationError = validateStoryForArticleCreation(sourceStory);
      if (storyValidationError) {
        throw new EditorialValidationError(storyValidationError, 400);
      }

      const existingLinked = await getPrimaryArticleForStory({
        useFileStore,
        storyId: input.sourceStoryId,
      });
      if (existingLinked) {
        throw new EditorialValidationError(
          'A primary linked article already exists for this story.',
          409
        );
      }

      sourceStoryTitle =
        sourceStory && typeof sourceStory.title === 'string'
          ? sourceStory.title.trim()
          : '';
    }

    const uniqueSlug = await resolveUniqueArticleSlug(
      input.slug || input.seo.metaTitle || input.title,
      (candidate) => checkSlugConflict(candidate)
    );
    input.slug = uniqueSlug;

    const canonicalError = validateArticleCanonicalOverride(
      input.seo.canonicalUrl,
      { id: 'new-article', slug: uniqueSlug }
    );
    if (canonicalError) {
      throw new EditorialValidationError(canonicalError, 400);
    }

    const articleDoc = {
      ...input,
      previousSlugs: [],
      sourceType: input.sourceStoryId ? 'story' : input.sourceType,
      sourceStoryTitle: sourceStoryTitle || input.sourceStoryTitle || '',
      views: 0,
      workflow: toStoredWorkflowUpdate(workflow),
      publishedAt: workflow.publishedAt ? workflow.publishedAt.toISOString() : null,
    };

    const created = await createNewsroomArticle(articleDoc);
    const articleId = String(created._id || created.id || '');

    await recordArticleActivity({
      articleId,
      actor,
      action: 'created',
      toStatus: workflow.status,
      message: buildArticleActivityMessage({ action: 'created', toStatus: workflow.status }),
      metadata: {
        intent,
        priority: workflow.priority,
        createdById: workflow.createdBy?.id || '',
      },
    });

    const useFileStore = await shouldUseFileStore();
    if (input.sourceStoryId) {
      await syncStoryLinkedArticle({
        useFileStore,
        storyId: input.sourceStoryId,
        articleId,
        articleStatus: workflow.status,
      });
    }

    if (workflow.status === 'published') {
      try {
        const breakingTts = await ensureBreakingTtsForArticle(created);
        if (breakingTts) {
          await updateNewsroomArticleWithCas(
            articleId,
            { breakingTts },
            { skipRevision: true }
          );
        }
      } catch (ttsError) {
        console.error('Failed to cache breaking TTS after article create:', ttsError);
      }
    }

    return resolveArticleResponse(created);
  }

  /**
   * Performs a full update on an existing article, enforcing CAS versioning and creating revision snapshots.
   */
  static async fullUpdate(
    id: string,
    body: unknown,
    actor: AdminSessionIdentity
  ): Promise<Record<string, unknown>> {
    if (!canViewPage(actor.role, 'article_edit')) {
      throw new EditorialForbiddenError();
    }

    const current = await findArticleById(id);
    if (!current) {
      throw new ArticleNotFoundError();
    }

    if (!canEditContent(actor, buildArticlePermissionRecord(current))) {
      throw new EditorialForbiddenError();
    }

    const bodyRecord = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
    const expectedVersion = parseExpectedVersion(bodyRecord.expectedVersion);
    const input = normalizeFullInput(body);

    const validationError = validateRequired(input);
    if (validationError) {
      throw new EditorialValidationError(validationError, 400);
    }

    const currentCanonicalUrl = normalizeSeo(current.seo).canonicalUrl;
    const canonicalEdit = readArticleCanonicalEdit(bodyRecord.seo);
    const canonicalError = validateEditedArticleCanonicalOverride(
      canonicalEdit,
      currentCanonicalUrl,
      { id, slug: input.slug || normalizeArticleSlug(current.slug) }
    );
    if (canonicalError) {
      throw new EditorialValidationError(canonicalError, 400);
    }
    if (canonicalEdit.kind === 'omitted') {
      input.seo.canonicalUrl = currentCanonicalUrl;
    }

    const updates: Record<string, unknown> = { ...input };
    applyEditorialFlagApproval(updates, current, actor.name || actor.email);

    const currentSlug = normalizeArticleSlug(String(current.slug || ''));
    const nextSlugSource = input.slug || currentSlug || input.title;
    const requestedSlug = normalizeArticleSlug(nextSlugSource);

    if (requestedSlug && requestedSlug !== currentSlug) {
      const resolvedSlug = await resolveUniqueArticleSlug(
        requestedSlug,
        (candidate) => checkSlugConflict(candidate, id)
      );
      updates.slug = resolvedSlug;

      const previousSlugsSet = new Set(
        Array.isArray(current.previousSlugs)
          ? current.previousSlugs.map((item) => normalizeArticleSlug(String(item || ''))).filter(Boolean)
          : []
      );
      if (currentSlug) previousSlugsSet.add(currentSlug);
      previousSlugsSet.delete(resolvedSlug);
      updates.previousSlugs = Array.from(previousSlugsSet);
    } else {
      updates.slug = currentSlug;
    }

    const previousBreakingAudioUrl = resolveBreakingAudioUrl(
      current as Record<string, unknown>
    );
    const nextBreakingTts = resolveNextBreakingTts(
      current as Record<string, unknown>,
      updates
    );
    updates.breakingTts = nextBreakingTts;

    const snapshot = buildRevisionSnapshot(current);
    const updated = await updateNewsroomArticleWithCas(id, updates, {
      expectedVersion,
      forceCas: false,
      skipRevision: false,
      revisionSnapshot: snapshot,
      currentRecord: current,
    });

    if (
      previousBreakingAudioUrl &&
      previousBreakingAudioUrl !== nextBreakingTts?.audioUrl
    ) {
      await deleteStoredBreakingAudio(previousBreakingAudioUrl).catch(() => undefined);
    }

    await recordArticleActivity({
      articleId: id,
      actor,
      action: 'full_edit',
      toStatus: resolveArticleWorkflow(updated).status,
      message: buildArticleActivityMessage({ action: 'full_edit' }),
    });

    if (updated.sourceStoryId) {
      await syncStoryLinkedArticle({
        useFileStore: await shouldUseFileStore(),
        storyId: String(updated.sourceStoryId),
        articleId: id,
        articleStatus: resolveArticleWorkflow(updated).status,
      });
    }

    return resolveArticleResponse(updated);
  }

  /**
   * Performs partial updates or draft autosaves without creating revision snapshots on autosaves.
   */
  static async partialUpdate(
    id: string,
    body: unknown,
    actor: AdminSessionIdentity
  ): Promise<Record<string, unknown>> {
    if (!canViewPage(actor.role, 'article_edit')) {
      throw new EditorialForbiddenError();
    }

    const current = await findArticleById(id);
    if (!current) {
      throw new ArticleNotFoundError();
    }

    if (!canEditContent(actor, buildArticlePermissionRecord(current))) {
      throw new EditorialForbiddenError();
    }

    const bodyRecord = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
    const expectedVersion = parseExpectedVersion(bodyRecord.expectedVersion);
    const isAutosave = bodyRecord.autosave === true;
    const updates = normalizePartialInput(body);

    const lengthError = validateLengths(updates);
    if (lengthError) {
      throw new EditorialValidationError(lengthError, 400);
    }

    if (bodyRecord.seo !== undefined) {
      const currentCanonicalUrl = normalizeSeo(current.seo).canonicalUrl;
      const canonicalEdit = readArticleCanonicalEdit(bodyRecord.seo);
      const canonicalError = validateEditedArticleCanonicalOverride(
        canonicalEdit,
        currentCanonicalUrl,
        {
          id,
          slug: typeof updates.slug === 'string' && updates.slug ? updates.slug : normalizeArticleSlug(current.slug),
        }
      );
      if (canonicalError) {
        throw new EditorialValidationError(canonicalError, 400);
      }
      if (canonicalEdit.kind === 'omitted' && updates.seo && typeof updates.seo === 'object') {
        (updates.seo as Record<string, unknown>).canonicalUrl = currentCanonicalUrl;
      }
    }

    applyEditorialFlagApproval(updates, current, actor.name || actor.email);

    if (typeof updates.slug === 'string' && updates.slug) {
      const currentSlug = normalizeArticleSlug(String(current.slug || ''));
      const requestedSlug = normalizeArticleSlug(updates.slug);
      if (requestedSlug && requestedSlug !== currentSlug) {
        const resolvedSlug = await resolveUniqueArticleSlug(
          requestedSlug,
          (candidate) => checkSlugConflict(candidate, id)
        );
        updates.slug = resolvedSlug;

        const previousSlugsSet = new Set(
          Array.isArray(current.previousSlugs)
            ? current.previousSlugs.map((item) => normalizeArticleSlug(String(item || ''))).filter(Boolean)
            : []
        );
        if (currentSlug) previousSlugsSet.add(currentSlug);
        previousSlugsSet.delete(resolvedSlug);
        updates.previousSlugs = Array.from(previousSlugsSet);
      } else {
        updates.slug = currentSlug;
      }
    }

    const previousBreakingAudioUrl = resolveBreakingAudioUrl(
      current as Record<string, unknown>
    );
    const nextBreakingTts = resolveNextBreakingTts(
      current as Record<string, unknown>,
      updates
    );
    updates.breakingTts = nextBreakingTts;

    const snapshot = isAutosave ? null : buildRevisionSnapshot(current);
    const updated = await updateNewsroomArticleWithCas(id, updates, {
      expectedVersion,
      forceCas: false,
      skipRevision: isAutosave,
      revisionSnapshot: snapshot,
      currentRecord: current,
    });

    if (
      previousBreakingAudioUrl &&
      previousBreakingAudioUrl !== nextBreakingTts?.audioUrl
    ) {
      await deleteStoredBreakingAudio(previousBreakingAudioUrl).catch(() => undefined);
    }

    if (!isAutosave) {
      await recordArticleActivity({
        articleId: id,
        actor,
        action: 'partial_edit',
        toStatus: resolveArticleWorkflow(updated).status,
        message: buildArticleActivityMessage({ action: 'partial_edit' }),
      });

      if (updated.sourceStoryId) {
        await syncStoryLinkedArticle({
          useFileStore: await shouldUseFileStore(),
          storyId: String(updated.sourceStoryId),
          articleId: id,
          articleStatus: resolveArticleWorkflow(updated).status,
        });
      }
    }

    return resolveArticleResponse(updated);
  }

  /**
   * Applies an editorial workflow state machine action (submit, assign, approve, publish, etc.).
   */
  static async applyWorkflowAction(
    id: string,
    actionBody: WorkflowActionBody,
    actor: AdminSessionIdentity
  ): Promise<Record<string, unknown>> {
    if (!canViewPage(actor.role, 'article_edit')) {
      throw new EditorialForbiddenError();
    }

    const action = actionBody.action;
    if (!action || !isWorkflowAction(action)) {
      throw new EditorialValidationError('Invalid workflow action', 400);
    }

    const current = await findArticleById(id);
    if (!current) {
      throw new ArticleNotFoundError();
    }

    const permissionRecord = buildArticlePermissionRecord(current);
    if (!canTransitionContent(actor, permissionRecord, action)) {
      throw new EditorialForbiddenError();
    }

    const currentVersion = resolveArticleVersion(current.version);
    const expectedVersion = actionBody.expectedVersion ?? null;
    if (expectedVersion !== null && expectedVersion !== currentVersion) {
      throw new ArticleVersionConflictError(currentVersion, current.updatedAt);
    }

    if ((action === 'publish' || action === 'fast_publish') && isBreakingArticleMissingAudio(current)) {
      throw new EditorialValidationError(BREAKING_AUDIO_REQUIRED_ERROR, 400);
    }

    const readinessError = validateWorkflowReadiness(current, action);
    if (readinessError) {
      throw new EditorialValidationError(readinessError, 400);
    }

    if (action === 'fast_publish') {
      const urgentError = validateFastPublish({
        role: actor.role,
        workflow: resolveArticleWorkflow(current),
        isBreaking: Boolean(current.isBreaking),
        reason: actionBody.comment,
      });
      if (urgentError) {
        throw new EditorialValidationError(urgentError, 400);
      }
    }

    let assignedTo = null;
    if (action === 'assign') {
      assignedTo = await resolveAssignee(String(actionBody.assignedToId || ''));
      if (!assignedTo) {
        throw new EditorialValidationError('Valid assignedToId is required', 400);
      }
    }

    const { fromStatus, toStatus, nextWorkflow } = applyArticleWorkflowAction({
      action,
      actor,
      currentWorkflow: resolveArticleWorkflow(current),
      assignedTo,
      scheduledFor: parseOptionalDate(actionBody.scheduledFor),
      dueAt: parseOptionalDate(actionBody.dueAt),
      priority: isWorkflowPriority(actionBody.priority) ? actionBody.priority : undefined,
      comment: actionBody.comment,
      rejectionReason: actionBody.rejectionReason,
    });

    if (toStatus === 'published' && isBreakingArticleMissingAudio(current)) {
      throw new EditorialValidationError(BREAKING_AUDIO_REQUIRED_ERROR, 400);
    }

    const updates: Record<string, unknown> = {
      workflow: toStoredWorkflowUpdate(nextWorkflow),
      ...(toStatus === 'published' ? { publishedAt: new Date().toISOString() } : {}),
    };

    const updated = await updateNewsroomArticleWithCas(id, updates, {
      expectedVersion,
      forceCas: true,
      skipRevision: true,
      currentRecord: current,
    });

    // Authoritative state write has succeeded; execute side-effects in sequence
    await recordArticleActivity({
      articleId: id,
      actor,
      action,
      fromStatus,
      toStatus,
      message: buildArticleActivityMessage({
        action,
        toStatus,
        assignedTo: nextWorkflow.assignedTo,
        rejectionReason: nextWorkflow.rejectionReason,
      }),
      metadata: compactMetadata({
        assignedToId: nextWorkflow.assignedTo?.id || '',
        assignedToName: nextWorkflow.assignedTo?.name || '',
        priority: nextWorkflow.priority,
        dueAt: nextWorkflow.dueAt?.toISOString() || '',
        scheduledFor: nextWorkflow.scheduledFor?.toISOString() || '',
        rejectionReason: nextWorkflow.rejectionReason || '',
        comment: actionBody.comment?.trim() || '',
      }),
    });

    await notifyWorkflowEvent({
      contentType: 'article',
      contentId: id,
      title: String(updated.title || 'Article'),
      href: `/admin/articles/${encodeURIComponent(id)}/edit`,
      action,
      workflow: nextWorkflow,
      actor,
    });

    if (updated.sourceStoryId) {
      const useFileStore = await shouldUseFileStore();
      await syncStoryLinkedArticle({
        useFileStore,
        storyId: String(updated.sourceStoryId),
        articleId: id,
        articleStatus: toStatus,
      });
    }

    return {
      article: resolveArticleResponse(updated),
      toStatus,
    };
  }

  /**
   * Deletes an article, cleaning up associated audio assets and story links.
   */
  static async deleteArticle(
    id: string,
    expectedVersion: number | null,
    actor: AdminSessionIdentity
  ): Promise<void> {
    if (!canDeleteContent(actor)) {
      throw new EditorialForbiddenError();
    }

    const deleted = await deleteNewsroomArticleWithCas(id, expectedVersion);

    const breakingTts = deleted.breakingTts && typeof deleted.breakingTts === 'object'
      ? (deleted.breakingTts as Record<string, unknown>)
      : null;
    const audioUrl = typeof breakingTts?.audioUrl === 'string' ? breakingTts.audioUrl : '';
    if (audioUrl) {
      await deleteStoredBreakingAudio(audioUrl);
    }

    if (deleted.sourceStoryId) {
      const useFileStore = await shouldUseFileStore();
      await clearStoryLinkedArticle({
        useFileStore,
        storyId: String(deleted.sourceStoryId),
        articleId: id,
      });
    }

    await recordArticleActivity({
      articleId: id,
      actor,
      action: 'delete',
      fromStatus: resolveArticleWorkflow(deleted).status,
      toStatus: 'archived',
      message: buildArticleActivityMessage({ action: 'delete' }),
    });
  }

  /**
   * Revisions delegation.
   */
  static async getRevisions(id: string, actor: AdminSessionIdentity) {
    return EditorialRevisionService.getRevisions(id, actor);
  }

  static async restoreRevision(id: string, revisionId: string, actor: AdminSessionIdentity) {
    return EditorialRevisionService.restoreRevision(id, revisionId, actor);
  }
}
