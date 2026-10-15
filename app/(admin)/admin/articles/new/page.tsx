import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import ArticleCreatePageClient from './ArticleCreatePageClient';
import ReporterArticleCreate from './ReporterArticleCreate';

export default async function NewArticlePage() {
  const admin = await getAdminSession();

  if (!admin) {
    redirect('/signin?redirect=/admin/articles/new');
  }

  if (!canViewPage(admin.role, 'article_create')) {
    redirect('/admin/work?access=denied');
  }

  if (admin.role === 'reporter') {
    return <ReporterArticleCreate reporterName={admin.name || admin.email || 'Reporter'} />;
  }

  return <ArticleCreatePageClient />;
}
