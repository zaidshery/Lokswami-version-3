import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function AiLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('ai_ops', '/admin/ai');
  return children;
}
