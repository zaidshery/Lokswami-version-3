import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function NewStoryLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('story_create', '/admin/stories/new');
  return children;
}
