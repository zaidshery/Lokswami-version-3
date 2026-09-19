import { redirect } from 'next/navigation';
import WorkQueuePage from '@/components/admin/WorkQueuePage';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminWorkQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect('/signin?redirect=/admin/work');
  if (!canViewPage(admin.role, 'work_queue')) redirect('/admin/work?access=denied');

  return <WorkQueuePage searchParams={searchParams} defaultView="mine" routePath="/admin/work" />;
}
