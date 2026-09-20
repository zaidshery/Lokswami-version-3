import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function ReviewQueueLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('review_queue', '/admin/review-queue');
  return children;
}
