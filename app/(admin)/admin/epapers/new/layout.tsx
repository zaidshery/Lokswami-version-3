import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function NewEpaperLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('epaper_create', '/admin/epapers/new');
  return children;
}
