import 'server-only';
import { listPublicCategoryArticles } from '@/lib/server/publicArticles';
import { mapPublicArticlesToUiArticles } from '@/lib/content/publicArticles';
import { videoService } from '@/lib/server/video/videoService';
import { HOMEPAGE_CATEGORY_MODULES, HOMEPAGE_CATEGORY_CANDIDATE_LIMIT, selectHomepageMedia, type HomepageDiscovery } from '@/lib/content/homepageDiscovery';

export async function getHomepageDiscovery(): Promise<HomepageDiscovery> {
  // Bounded public candidates support four initial cards and progressive reveal.
  // Existing public services own Mongo probing, publication filtering and compatible file-store fallback.
  const categoriesPromise = (async () => {
    try {
      const results = await listPublicCategoryArticles(HOMEPAGE_CATEGORY_MODULES, {
        limit: HOMEPAGE_CATEGORY_CANDIDATE_LIMIT,
      });
      const rows = HOMEPAGE_CATEGORY_MODULES.map((slug) => {
        const items = results[slug]?.items || [];
        // Cards use preview metadata; article bodies stay on the detail route.
        const previews = mapPublicArticlesToUiArticles(items).map((article) => {
          const preview = { ...article };
          delete preview.content;
          return preview;
        });
        return [slug, previews] as const;
      });
      return Object.fromEntries(rows);
    } catch {
      return Object.fromEntries(HOMEPAGE_CATEGORY_MODULES.map((slug) => [slug, []]));
    }
  })();
  const media = (async () => {
    try {
      const result = await videoService.getHomeFeedVideos({ videos: 12, shorts: 12 });
      return { videos: selectHomepageMedia(result.rawVideos, 'videos'), shorts: selectHomepageMedia(result.rawShorts, 'shorts'), videoError: false };
    } catch {
      return { videos: [], shorts: [], videoError: true };
    }
  })();
  const [categoryArticles, mediaResult] = await Promise.all([categoriesPromise, media]);
  return { categoryArticles, ...mediaResult };
}
