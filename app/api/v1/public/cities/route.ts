import { longPublicCache } from '@/lib/api/cache';
import { apiSuccessResponse } from '@/lib/api/response';
import { publicTaxonomyService } from '@/lib/server/content/publicTaxonomyService';

const PUBLIC_CITIES_CACHE_HEADERS = longPublicCache({
  sMaxAge: 3600,
  staleWhileRevalidate: 86400,
});

export async function GET() {
  return apiSuccessResponse(
    { items: publicTaxonomyService.listPublicCities() },
    {
      headers: PUBLIC_CITIES_CACHE_HEADERS,
      meta: { source: 'static' },
    }
  );
}
