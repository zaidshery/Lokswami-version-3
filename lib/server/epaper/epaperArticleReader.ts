import 'server-only';
import { epaperService } from './epaperService';
import { EpaperNotFoundError } from './epaperTypes';
import { buildPublicationArticlePath, buildPublicationReaderPath } from '@/lib/utils/readerContentPaths';
import type { ReaderArticle } from '@/app/(reader)/main/article/[id]/ArticleDetailClient';

export type ReaderQuery = Record<string, string | string[] | undefined>;
function single(value: string | string[] | undefined) { return typeof value === 'string' ? value : ''; }

export async function loadPublicationArticleReader(token: string, query: ReaderQuery) {
  const paperId = single(query.paper);
  const publicationType: 'epaper' | 'emagazine' = single(query.publicationType) === 'emagazine' ? 'emagazine' : 'epaper';
  if (!paperId || (single(query.story) && single(query.story) !== token)) return null;
  try {
    const issue = await epaperService.getPublicEditionDetail(paperId, publicationType);
    const story = issue.articles.find((item) => item._id === token || item.slug === token);
    if (!story) return null;
    const context = { publicationType, paperId: issue._id, city: issue.citySlug, publishDate: issue.publishDate, page: story.pageNumber, storyToken: story._id };
    const article: ReaderArticle = {
      id: story._id, title: story.title, summary: story.excerpt || '', content: story.contentHtml || '',
      image: story.coverImagePath || '', category: publicationType === 'emagazine' ? 'E-Magazine' : 'E-Paper',
      author: { id: '', name: '', avatar: '' }, publishedAt: String(story.updatedAt || issue.publishDate), views: 0,
    };
    return { article, returnPath: buildPublicationReaderPath(context), articlePath: buildPublicationArticlePath(context), issueTitle: issue.title };
  } catch (error) {
    if (error instanceof EpaperNotFoundError) return null;
    throw error;
  }
}
