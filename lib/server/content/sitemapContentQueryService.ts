import { listEPapersForSitemap } from '@/lib/content/publicSitemap';
import {
  countPublicArticlesForSitemap,
  getServerArticlePath,
  listArticlesForSitemap,
  listArticlesForSitemapSlice,
  listNewsArticlesForSitemap,
} from '@/lib/content/serverArticles';
import type { PublicVideoItem } from '@/lib/content/videoPublication';
import { getPublicVideoFeedPage } from '@/lib/server/publicVideos';

const MAX_SITEMAP_VIDEOS = 10_000;
const MAX_SITEMAP_PAGES = 250;
const VIDEO_SITEMAP_PAGE_SIZE = 50;

export class SitemapContentQueryService {
  async countArticleChunks(chunkSize: number) {
    const total = await countPublicArticlesForSitemap();
    return Math.max(1, Math.ceil(total / chunkSize));
  }

  listArticles(options: {
    isChunkedRequest: boolean;
    sitemapId: number;
    chunkSize: number;
    legacyLimit: number;
  }) {
    if (options.isChunkedRequest) {
      return listArticlesForSitemapSlice({
        skip: options.sitemapId * options.chunkSize,
        limit: options.chunkSize,
      });
    }
    return listArticlesForSitemap(options.legacyLimit);
  }

  listEPapers(limit: number) {
    return listEPapersForSitemap(limit);
  }

  listNewsArticles(limit: number) {
    return listNewsArticlesForSitemap(limit);
  }

  articlePath(article: Parameters<typeof getServerArticlePath>[0]) {
    return getServerArticlePath(article);
  }

  async listVideos(): Promise<PublicVideoItem[]> {
    const allVideos: PublicVideoItem[] = [];
    const seenVideoIds = new Set<string>();
    const seenCursors = new Set<string>();
    let cursorPublishedAt: string | null | undefined = null;
    let cursorId: string | null | undefined = null;
    let pageCount = 0;

    while (pageCount < MAX_SITEMAP_PAGES && allVideos.length < MAX_SITEMAP_VIDEOS) {
      pageCount++;
      const page = await getPublicVideoFeedPage({
        limit: VIDEO_SITEMAP_PAGE_SIZE,
        cursorPublishedAt,
        cursorId,
      });

      for (const item of page.items) {
        if (!seenVideoIds.has(item._id)) {
          seenVideoIds.add(item._id);
          allVideos.push(item);
          if (allVideos.length >= MAX_SITEMAP_VIDEOS) break;
        }
      }

      if (!page.hasMore || !page.nextCursor) break;
      const cursorKey = `${page.nextCursor.publishedAt}:${page.nextCursor.id}`;
      if (seenCursors.has(cursorKey)) {
        console.warn('[video-sitemap] Loop detected in cursor pagination at:', cursorKey);
        break;
      }
      seenCursors.add(cursorKey);
      cursorPublishedAt = page.nextCursor.publishedAt;
      cursorId = page.nextCursor.id;
    }

    return allVideos;
  }
}

export const sitemapContentQueryService = new SitemapContentQueryService();
