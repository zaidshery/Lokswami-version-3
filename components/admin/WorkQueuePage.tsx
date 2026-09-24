import { redirect } from 'next/navigation';
import WorkQueueWorkbench from '@/components/admin/WorkQueueWorkbench';
import { getAdminSession } from '@/lib/auth/admin';
import { canOpenWorkQueue, getWorkQueueOverview, type WorkQueueView } from '@/lib/admin/workQueue';
import { canViewPage, type AdminPageKey } from '@/lib/auth/permissions';

type SearchParams = { [key: string]: string | string[] | undefined };

function value(params: SearchParams, key: string) {
  const current = params[key];
  return Array.isArray(current) ? current[0] : current;
}

export default async function WorkQueuePage({
  searchParams,
  defaultView,
  routePath,
  requiredPageKey = 'work_queue',
}: {
  searchParams: Promise<SearchParams>;
  defaultView: WorkQueueView;
  routePath: string;
  requiredPageKey?: AdminPageKey;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect(`/signin?redirect=${encodeURIComponent(routePath)}`);
  if (!canOpenWorkQueue(admin.role) || !canViewPage(admin.role, requiredPageKey)) {
    if (routePath === '/admin/work' && !canViewPage(admin.role, 'work_queue')) {
      redirect('/admin');
    }
    redirect('/admin/work?access=denied');
  }

  const params = await searchParams;
  const isMyWorkRoute = routePath === '/admin/my-work' || requiredPageKey === 'my_work';
  const overview = await getWorkQueueOverview(admin, {
    view: (value(params, 'view') as WorkQueueView | undefined) || defaultView,
    contentType: value(params, 'contentType') as never,
    status: value(params, 'status') as never,
    priority: value(params, 'priority') as never,
    assignee: value(params, 'assignee'),
    search: value(params, 'search'),
    sort: value(params, 'sort') as never,
    cursor: value(params, 'cursor'),
    mineOnly: isMyWorkRoute,
  });

  return <WorkQueueWorkbench role={admin.role} overview={overview} routePath={routePath} />;
}
