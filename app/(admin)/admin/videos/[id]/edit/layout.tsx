import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function EditVideoLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('video_edit', '/admin/videos/edit');
  return children;
}
