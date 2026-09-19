import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import EditArticlePageClient from './EditArticlePageClient';

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdminSession();
  const { id } = await params;

  if (!admin) {
    redirect(`/signin?redirect=/admin/articles/${encodeURIComponent(id)}/edit`);
  }

  if (!canViewPage(admin.role, 'article_edit')) {
    redirect('/admin/work?access=denied');
  }

  return <EditArticlePageClient />;
}
