import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { canEditContent, canViewPage, canReadContent } from '@/lib/auth/permissions';
import {
  buildArticleActivityMessage,
  recordArticleActivity,
} from '@/lib/server/articleActivity';
import {
  normalizeArticleSlug,
  readArticleCanonicalEdit,
  validateEditedArticleCanonicalOverride,
} from '@/lib/seo/articleSeo';
import { normalizeArticleDocument } from '@/lib/content/articleDocument';
import {
  normalizeCopyEditorMeta,
  normalizeReporterMeta,
} from '@/lib/content/newsroomMetadata';
import { normalizeArticleEditorialMeta } from '@/lib/content/articleEditorial';
import { normalizeArticleMediaMetadata } from '@/lib/content/articleMediaMetadata';
import { resolveArticleWorkflow } from '@/lib/workflow/article';
import {
  ArticleNotFoundError,
  ArticleVersionConflictError,
  EditorialForbiddenError,
  EditorialValidationError,
} from './newsroomArticleTypes';
import {
  checkSlugConflict,
  findArticleById,
  getArticleRevisions,
  hasPersistedArticleVersion,
  resolveArticleVersion,
  restoreRevisionInStore,
} from './newsroomArticleRepository';
import {
  buildRevisionSnapshot,
  normalizeSeo,
} from './newsroomArticleValidation';

export class EditorialRevisionService {
  /**
   * Fetches revision history for an article.
   */
  static async getRevisions(
    id: string,
    actor: AdminSessionIdentity
  ): Promise<Array<Record<string, unknown>>> {
    if (!canViewPage(actor.role, 'articles')) {
      throw new EditorialForbiddenError();
    }

    const { article, revisions } = await getArticleRevisions(id);
    if (!article) {
      throw new ArticleNotFoundError();
    }

    if (
      !canReadContent(
        actor,
        {
          legacyAuthorName: typeof article.author === 'string' ? article.author : '',
          workflow: resolveArticleWorkflow(article),
        },
        { allowViewerRead: true }
      )
    ) {
      throw new EditorialForbiddenError();
    }

    return revisions;
  }

  /**
   * Restores a previously saved revision snapshot.
   */
  static async restoreRevision(
    id: string,
    revisionId: string,
    actor: AdminSessionIdentity
  ): Promise<Record<string, unknown>> {
    if (!canViewPage(actor.role, 'article_edit')) {
      throw new EditorialForbiddenError();
    }

    const current = await findArticleById(id);
    if (!current) {
      throw new ArticleNotFoundError('Article or revision not found');
    }

    if (
      !canEditContent(actor, {
        legacyAuthorName: typeof current.author === 'string' ? current.author : '',
        workflow: resolveArticleWorkflow(current),
      })
    ) {
      throw new EditorialForbiddenError();
    }

    const revisions = Array.isArray(current.revisions) ? current.revisions : [];
    const targetRevision = revisions.find(
      (r) =>
        String((r as { _id?: unknown })._id || '') === revisionId ||
        String((r as { id?: unknown }).id || '') === revisionId
    );

    if (!targetRevision) {
      throw new ArticleNotFoundError('Revision not found');
    }

    const snapshot = buildRevisionSnapshot(current);
    const restoredContent =
      typeof targetRevision.content === 'string' ? targetRevision.content : '';
    const currentSlug = normalizeArticleSlug(String(current.slug || ''));
    const revisionSlug = normalizeArticleSlug(String(targetRevision.slug || ''));
    const currentPreviousSlugs = Array.isArray(current.previousSlugs)
      ? current.previousSlugs.map((s) => normalizeArticleSlug(String(s || ''))).filter(Boolean)
      : [];

    let restoredSlug = currentSlug;
    let restoredPreviousSlugs = currentPreviousSlugs;

    if (revisionSlug) {
      const slugConflict =
        revisionSlug !== currentSlug && (await checkSlugConflict(revisionSlug, id));
      if (!slugConflict) {
        restoredSlug = revisionSlug;
        const slugHistory = new Set([
          ...currentPreviousSlugs,
          ...(Array.isArray(targetRevision.previousSlugs)
            ? targetRevision.previousSlugs
                .map((s) => normalizeArticleSlug(String(s || '')))
                .filter(Boolean)
            : []),
        ]);
        if (currentSlug && currentSlug !== restoredSlug) slugHistory.add(currentSlug);
        slugHistory.delete(restoredSlug);
        restoredPreviousSlugs = Array.from(slugHistory);
      }
    }

    const canonicalEdit = readArticleCanonicalEdit(targetRevision.seo);
    const currentCanonicalUrl = normalizeSeo(current.seo).canonicalUrl;
    const canonicalError = validateEditedArticleCanonicalOverride(
      canonicalEdit,
      currentCanonicalUrl,
      { id, slug: restoredSlug }
    );
    if (canonicalError) {
      throw new EditorialValidationError(canonicalError, 400);
    }

    const restoredSeo = normalizeSeo(targetRevision.seo);
    if (canonicalEdit.kind === 'omitted') {
      restoredSeo.canonicalUrl = currentCanonicalUrl;
    }

    const hasStoredVersion = hasPersistedArticleVersion(current.version);
    const currentVersion = resolveArticleVersion(current.version);

    const updates: Record<string, unknown> = {
      title: typeof targetRevision.title === 'string' ? targetRevision.title : '',
      summary: typeof targetRevision.summary === 'string' ? targetRevision.summary : '',
      content: restoredContent,
      contentJson: normalizeArticleDocument(targetRevision.contentJson, restoredContent),
      image: typeof targetRevision.image === 'string' ? targetRevision.image : '',
      category: typeof targetRevision.category === 'string' ? targetRevision.category : '',
      author: typeof targetRevision.author === 'string' ? targetRevision.author : '',
      slug: restoredSlug,
      previousSlugs: restoredPreviousSlugs,
      isBreaking: Boolean(targetRevision.isBreaking),
      isTrending: Boolean(targetRevision.isTrending),
      seo: restoredSeo,
      reporterMeta: normalizeReporterMeta(targetRevision.reporterMeta),
      copyEditorMeta: normalizeCopyEditorMeta(targetRevision.copyEditorMeta),
      editorial: normalizeArticleEditorialMeta(targetRevision.editorial),
      media: normalizeArticleMediaMetadata(targetRevision.media),
      updatedAt: new Date(),
    };

    const restored = await restoreRevisionInStore(
      id,
      revisionId,
      updates,
      snapshot,
      hasStoredVersion,
      currentVersion
    );

    if (!restored) {
      throw new ArticleVersionConflictError(currentVersion, current.updatedAt);
    }

    await recordArticleActivity({
      articleId: id,
      actor,
      action: 'restore_revision',
      toStatus: resolveArticleWorkflow(restored).status,
      message: buildArticleActivityMessage({ action: 'restore_revision' }),
      metadata: {
        revisionId,
        revisionTitle: typeof targetRevision.title === 'string' ? targetRevision.title : '',
      },
    });

    return restored;
  }
}
