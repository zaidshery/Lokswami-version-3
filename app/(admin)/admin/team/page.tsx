import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { getAssignableAdminRoles } from '@/lib/auth/permissions';
import TeamManagementClient from './TeamManagementClient';

export default async function TeamPage() {
  const admin = await getAdminSession();

  if (!admin || !canViewPage(admin.role, 'team')) {
    redirect('/admin/work?access=denied');
  }

  return (
    <TeamManagementClient
      viewerRole={admin.role}
      assignableRoles={getAssignableAdminRoles(admin.role)}
    />
  );
}
