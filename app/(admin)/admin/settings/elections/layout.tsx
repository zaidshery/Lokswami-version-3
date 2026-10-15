import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function ElectionsSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('newsroom_settings', '/admin/settings/elections');
  return children;
}
