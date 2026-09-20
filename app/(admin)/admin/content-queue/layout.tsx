import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function ContentQueueLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('content_queue', '/admin/content-queue');
  return children;
}
