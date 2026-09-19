import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function EpapersLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('epapers', '/admin/epapers');
  return children;
}
