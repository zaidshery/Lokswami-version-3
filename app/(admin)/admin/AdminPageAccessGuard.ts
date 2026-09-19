import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage, type AdminPageKey } from '@/lib/auth/permissions';

export async function requireAdminPageAccess(
  pageKey: AdminPageKey,
  redirectPath: string
) {
  const admin = await getAdminSession();

  if (!admin) {
    redirect(`/signin?redirect=${encodeURIComponent(redirectPath)}`);
  }

  if (!canViewPage(admin.role, pageKey)) {
    redirect('/admin/work?access=denied');
  }
}
