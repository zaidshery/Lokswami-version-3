import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function EpaperPageEditorLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('epaper_page_edit', '/admin/epapers/page');
  return children;
}
