import { redirect } from 'next/navigation';
import ActionFirstDashboard from '@/components/admin/ActionFirstDashboard';
import { getWorkQueueOverview } from '@/lib/admin/workQueue';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const admin = await getAdminSession();
  if (!admin) redirect('/signin?redirect=/admin');
  if (!canViewPage(admin.role, 'dashboard')) redirect('/admin/work');

  const overview = await getWorkQueueOverview(admin, {
    view: 'all',
    sort: 'priority_desc',
    limit: 100,
  });

  return (
    <ActionFirstDashboard
      overview={overview}
      role={admin.role}
      userName={admin.name || admin.email || null}
    />
  );
}
