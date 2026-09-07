import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import UsersManagementClient from './UsersManagementClient';

export default async function AdminUsersPage() {
  const admin = await getAdminSession();

  if (!admin || !canViewPage(admin.role, 'users')) {
    redirect('/admin');
  }

  return <UsersManagementClient viewerRole={admin.role} />;
}
