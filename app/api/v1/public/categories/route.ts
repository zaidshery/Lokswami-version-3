import { longPublicCache } from '@/lib/api/cache';
import { apiSuccessResponse } from '@/lib/api/response';
import { publicTaxonomyService } from '@/lib/server/content/publicTaxonomyService';

const PUBLIC_CATEGORIES_CACHE_HEADERS = longPublicCache({
  sMaxAge: 3600,
  staleWhileRevalidate: 86400,
});

export async function GET() {
  return apiSuccessResponse(
    { items: publicTaxonomyService.listPublicCategories() },
    {
      headers: PUBLIC_CATEGORIES_CACHE_HEADERS,
      meta: { source: 'static' },
    }
  );
}
