import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';

export default async function BusinessValueLayout({ children }: { children: ReactNode }) {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/analytics/business-value');
  }

  if (!canViewPage(admin.role, 'business_value')) {
    redirect('/admin/work?access=denied');
  }

  return children;
}
