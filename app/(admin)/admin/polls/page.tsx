import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import PollManagementClient from './PollManagementClient';

export default async function PollsPage() {
  const admin = await getAdminSession();

  if (!admin || !canViewPage(admin.role, 'polls')) {
    redirect('/admin/work?access=denied');
  }

  return <PollManagementClient />;
}

