import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function EditEpaperLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('epaper_edit', '/admin/epapers/edit');
  return children;
}
