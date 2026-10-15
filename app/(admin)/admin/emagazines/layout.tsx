import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function EmagazinesLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('epapers', '/admin/emagazines');
  return children;
}
