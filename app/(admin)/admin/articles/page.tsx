import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import ArticlesManagementClient from './ArticlesManagementClient';

export default async function ArticlesPage() {
  const admin = await getAdminSession();

  if (!admin) {
    redirect('/signin?redirect=/admin/articles');
  }

  if (!canViewPage(admin.role, 'articles')) {
    redirect('/admin/work?access=denied');
  }

  return <ArticlesManagementClient />;
}
