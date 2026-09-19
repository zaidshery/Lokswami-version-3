import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function NewVideoLayout({ children }: { children: ReactNode }) {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/videos/new');
  }
  if (!canViewPage(admin.role, 'video_create')) {
    redirect('/admin/work?access=denied');
  }
  return children;
}
