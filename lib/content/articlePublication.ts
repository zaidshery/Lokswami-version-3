import { resolveArticleWorkflow } from '@/lib/workflow/article';

type ArticlePublicationSource = {
  workflow?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
};

export function isPubliclyPublishedArticle(
  article: unknown,
  referenceDate: Date = new Date()
) {
  if (!article || typeof article !== 'object') {
    return false;
  }

  const source = article as ArticlePublicationSource;
  const workflow = resolveArticleWorkflow(source);
  if (workflow.status === 'published') {
    return true;
  }

  if (
    workflow.status === 'scheduled' &&
    workflow.scheduledFor &&
    new Date(workflow.scheduledFor).getTime() <= referenceDate.getTime()
  ) {
    return true;
  }

  return false;
}
