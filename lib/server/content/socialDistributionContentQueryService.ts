import { Types } from 'mongoose';
import { getStoryRecordForArticleLinking } from '@/lib/server/newsroomStoryLinks';
import {
  findArticleById,
  resolveNewsroomArticleStore,
} from './newsroomArticleRepository';
import type { NewsroomArticleStore } from './newsroomArticleTypes';

export type SocialDraftStorySource = {
  _id?: unknown;
  title?: unknown;
  category?: unknown;
  author?: unknown;
  thumbnail?: unknown;
  linkedArticleId?: unknown;
  videoProduction?: unknown;
};

export type SocialDraftArticleSource = {
  _id?: unknown;
  title?: unknown;
  summary?: unknown;
  sourceStoryId?: unknown;
};

function canQueryId(id: string, store: NewsroomArticleStore) {
  return store === 'file' || Types.ObjectId.isValid(id);
}

export async function getSocialDraftContentSources(storyId: string): Promise<{
  store: NewsroomArticleStore;
  story: SocialDraftStorySource | null;
  article: SocialDraftArticleSource | null;
}> {
  const store = await resolveNewsroomArticleStore();
  if (!canQueryId(storyId, store)) return { store, story: null, article: null };

  const story = (await getStoryRecordForArticleLinking({
    useFileStore: store === 'file',
    storyId,
  })) as SocialDraftStorySource | null;
  const articleId =
    story && typeof story.linkedArticleId === 'string'
      ? story.linkedArticleId.trim()
      : '';
  const article =
    articleId && canQueryId(articleId, store)
      ? ((await findArticleById(articleId, store)) as SocialDraftArticleSource | null)
      : null;

  return { store, story, article };
}
