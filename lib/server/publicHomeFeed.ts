import 'server-only';

export {
  publicHomeFeedService,
  type PublicHomeFeedSource,
  type PublicHomeFeedArticle,
  type PublicHomeFeedBreakingItem,
  type PublicHomeFeedVideo,
  type PublicHomeFeedEPaper,
  type PublicHomeFeed,
  type PublicHomeFeedLimits,
  type PublicHomeFeedResult,
} from './content/publicHomeFeedService';

import {
  publicHomeFeedService,
  type PublicHomeFeedLimits,
  type PublicHomeFeedResult,
} from './content/publicHomeFeedService';

export async function getPublicHomeFeed(
  options: {
    limits?: PublicHomeFeedLimits;
    allowZeroLimits?: boolean;
    articleCandidateMinimum?: number;
  } = {}
): Promise<PublicHomeFeedResult> {
  return publicHomeFeedService.getPublicHomeFeed(options);
}

export async function getPublicHomepageInitialFeed(): Promise<PublicHomeFeedResult> {
  return publicHomeFeedService.getPublicHomepageInitialFeed();
}
