import 'server-only';
import { listPublicArticles } from '@/lib/server/publicArticles';
import { mapPublicArticlesToUiArticles } from '@/lib/content/publicArticles';
import { videoService } from '@/lib/server/video/videoService';
import { HOMEPAGE_CATEGORY_MODULES, selectHomepageMedia, type HomepageDiscovery } from '@/lib/content/homepageDiscovery';

export async function getHomepageDiscovery(): Promise<HomepageDiscovery> {
  // 9 top-package IDs + up to 4 category cards. Existing public services own
  // Mongo probing, publication filtering and compatible file-store fallback.
  const categories = HOMEPAGE_CATEGORY_MODULES.map(async (slug) => {
    try {
      const result = await listPublicArticles({ category: slug, limit: 13 });
      return [slug, mapPublicArticlesToUiArticles(result.items)] as const;
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
