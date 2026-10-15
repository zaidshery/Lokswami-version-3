import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

export default async function SocialPostsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageAccess('social_posts', '/admin/social-posts');
  return children;
}
