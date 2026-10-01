import 'server-only';
import { listPublicArticles } from '@/lib/server/publicArticles';
import { mapPublicArticlesToUiArticles } from '@/lib/content/publicArticles';
import { videoService } from '@/lib/server/video/videoService';
import { HOMEPAGE_CATEGORY_MODULES, HOMEPAGE_CATEGORY_CANDIDATE_LIMIT, selectHomepageMedia, type HomepageDiscovery } from '@/lib/content/homepageDiscovery';

export async function getHomepageDiscovery(): Promise<HomepageDiscovery> {
  // Bounded public candidates support four initial cards and progressive reveal.
  // Existing public services own
  // Mongo probing, publication filtering and compatible file-store fallback.
  const categories = HOMEPAGE_CATEGORY_MODULES.map(async (slug) => {
    try {
      const result = await listPublicArticles({ category: slug, limit: HOMEPAGE_CATEGORY_CANDIDATE_LIMIT });
      // Cards use preview metadata; article bodies stay on the detail route.
      const previews = mapPublicArticlesToUiArticles(result.items).map((article) => {
        const preview = { ...article };
        delete preview.content;
        return preview;
      });
      return [slug, previews] as const;
    } catch {
      return [slug, []] as const;
    }
  });
  const media = (async () => {
    try {
      const result = await videoService.getHomeFeedVideos({ videos: 12, shorts: 12 });
      return { videos: selectHomepageMedia(result.rawVideos, 'videos'), shorts: selectHomepageMedia(result.rawShorts, 'shorts'), videoError: false };
    } catch {
      return { videos: [], shorts: [], videoError: true };
    }
  })();
  const [categoryRows, mediaResult] = await Promise.all([Promise.all(categories), media]);
  return { categoryArticles: Object.fromEntries(categoryRows), ...mediaResult };
}
