import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function VideosLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('videos', '/admin/videos');
  return children;
}
