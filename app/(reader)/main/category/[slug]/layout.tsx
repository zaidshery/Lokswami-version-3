import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildCategoryPageMetadata } from '@/lib/seo/readerPageMetadata';

type LayoutContext = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(context: LayoutContext): Promise<Metadata> {
  const { slug } = await context.params;
  try {
    return buildCategoryPageMetadata(decodeURIComponent(slug));
  } catch {
    notFound();
  }
}

export default function CategoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
