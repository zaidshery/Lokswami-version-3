import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function NewEmagazineLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('epaper_create', '/admin/emagazines/new');
  return children;
}
