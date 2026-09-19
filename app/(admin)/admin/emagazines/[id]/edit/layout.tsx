import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function EditEmagazineLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('epaper_edit', '/admin/emagazines/edit');
  return children;
}
