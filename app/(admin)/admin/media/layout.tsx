import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function MediaLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('media', '/admin/media');
  return children;
}
