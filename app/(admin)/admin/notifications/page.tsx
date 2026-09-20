import { redirect } from 'next/navigation';
import NotificationsPageClient from './NotificationsPageClient';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage() {
  const admin = await getAdminSession();
  if (!admin) redirect('/signin?redirect=/admin/notifications');
  if (!canViewPage(admin.role, 'notifications')) redirect('/admin/work?access=denied');
  return <NotificationsPageClient />;
}
