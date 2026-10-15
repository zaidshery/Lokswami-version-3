import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function MyWorkLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('my_work', '/admin/my-work');
  return children;
}
