import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function StoriesLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('stories', '/admin/stories');
  return children;
}
