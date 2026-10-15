import { redirect } from 'next/navigation';
import BulkTriageClient from './BulkTriageClient';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageWorkflowAssignments } from '@/lib/auth/permissions';
import { getWorkQueueOverview } from '@/lib/admin/workQueue';

export const dynamic = 'force-dynamic';

export default async function BulkTriagePage({ searchParams }: { searchParams: Promise<{ items?: string }> }) {
  const admin = await getAdminSession();
  if (!admin) redirect('/signin?redirect=/admin/work/bulk');
  if (!canManageWorkflowAssignments(admin.role)) redirect('/admin/work?access=denied');
  const params = await searchParams;
  const selected = new Set(String(params.items || '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 25));
  const overview = await getWorkQueueOverview(admin, { view: 'all', limit: 100 });
  const items = overview.items.filter((item) => selected.has(`${item.contentType}:${item.id}`));
  return <BulkTriageClient items={items} />;
}
