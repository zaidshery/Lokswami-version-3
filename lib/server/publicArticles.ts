import 'server-only';

export {
  PublicArticleResolutionError,
  type PublicArticleSource,
  type PublicArticleCursor,
  type PublicArticleListFilters,
  type PublicArticleListOptions,
  type PublicArticleItem,
  type PublicArticleDetail,
  type PublicArticleListResult,
  type PublicArticleDetailResult,
  type PublicArticleAuthority,
  type PublicArticleResolution,
  type PublicRelatedArticlesResult,
  type ResolvedPublicArticleToken,
} from './content/articleTypes';

export { normalizePublicArticleLimit } from './content/articleRepository';

import {
  publicArticleService,
  PUBLIC_ARTICLE_FILTER_FIELDS,
} from './content/publicArticleService';
import type {
  PublicArticleDetail,
  PublicArticleDetailResult,
  PublicArticleListOptions,
  PublicArticleListResult,
  PublicArticleResolution,
  PublicArticleSource,
  PublicRelatedArticlesResult,
  ResolvedPublicArticleToken,
} from './content/articleTypes';

export { PUBLIC_ARTICLE_FILTER_FIELDS };

export async function listPublicArticles(
  options: PublicArticleListOptions = {}
): Promise<PublicArticleListResult> {
  return publicArticleService.listPublicArticles(options);
}

export async function listRelatedPublicArticles(
  current: Pick<PublicArticleDetail, 'id' | 'href' | 'category'>,
  options: { limit?: number; source?: PublicArticleSource } = {}
): Promise<PublicRelatedArticlesResult> {
  return publicArticleService.listRelatedPublicArticles(current, options);
}

export async function resolvePublicArticleToken(
  requestToken: string
): Promise<PublicArticleResolution> {
  return publicArticleService.resolvePublicArticleToken(requestToken);
}

export async function getPublicArticleByResolution(
  resolution: ResolvedPublicArticleToken
): Promise<PublicArticleDetailResult> {
  return publicArticleService.getPublicArticleByResolution(resolution);
}

export async function getPublicArticleBySlug(
  slugOrId: string
): Promise<PublicArticleDetailResult | null> {
  return publicArticleService.getPublicArticleBySlug(slugOrId);
}
