import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function EmagazinePageEditorLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('epaper_page_edit', '/admin/emagazines/page');
  return children;
}
