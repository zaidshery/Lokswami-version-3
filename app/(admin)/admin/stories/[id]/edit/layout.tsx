import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function EditStoryLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('story_edit', '/admin/stories/edit');
  return children;
}
