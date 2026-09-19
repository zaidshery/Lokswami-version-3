import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function CategoriesLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('categories', '/admin/categories');
  return children;
}
