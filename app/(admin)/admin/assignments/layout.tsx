import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function AssignmentsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('assignments', '/admin/assignments');
  return children;
}
