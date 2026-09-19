import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function ContactMessagesLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('contact_messages', '/admin/contact-messages');
  return children;
}
