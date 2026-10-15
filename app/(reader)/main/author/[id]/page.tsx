import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { listPublicArticles } from '@/lib/server/publicArticles';
import { buildReaderMetadata } from '@/lib/seo/readerPageMetadata';
import { isMongoAvailable } from '@/lib/db/mongoAvailability';

export const dynamic = 'force-dynamic';

type PageContext = { params: Promise<{ id: string }> };
type PublicStaff = { id: string; name: string; role: string; image: string };

const getPublicStaff = cache(async (encodedId: string): Promise<PublicStaff | null> => {
  let id: string;
  try { id = decodeURIComponent(encodedId).trim(); } catch { return null; }
  if (!id) return null;
  try {
    if (!(await isMongoAvailable({ label: 'public author metadata' }))) return null;
    await connectDB();
    const record = await User.findOne({ _id: id, isActive: { $ne: false } })
      .select('_id name role image')
      .lean() as unknown as { _id?: unknown; name?: unknown; role?: unknown; image?: unknown } | null;
    const name = typeof record?.name === 'string' ? record.name.trim() : '';
    const role = typeof record?.role === 'string' ? record.role.trim() : '';
    if (!record || !name || role === 'reader') return null;
    return {
      id: String(record._id || id),
      name,
      role,
      image: typeof record.image === 'string' ? record.image.trim() : '',
    };
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageContext): Promise<Metadata> {
  const { id } = await params;
  const staff = await getPublicStaff(id);
  if (!staff) return { title: 'Author not found | Lokswami', robots: { index: false, follow: false } };
  return buildReaderMetadata({
    title: `${staff.name} | Lokswami`,
    description: `Published reporting by ${staff.name} at Lokswami.`,
    path: `/main/author/${encodeURIComponent(staff.id)}`,
    image: staff.image,
  });
}

export default async function AuthorProfilePage({ params }: PageContext) {
  const { id } = await params;
  const staff = await getPublicStaff(id);
  if (!staff) notFound();

  const result = await listPublicArticles({ limit: 100, query: staff.name });
  const articles = result.items.filter(
    (article) => article.author.trim().toLowerCase() === staff.name.toLowerCase()
  );

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950 sm:flex sm:items-center sm:gap-5">
        {staff.image ? (
          <Image src={staff.image} alt="" width={88} height={88} className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-2xl font-black text-spanish-red" aria-hidden="true">{staff.name.slice(0, 1).toUpperCase()}</div>
        )}
        <div className="mt-4 sm:mt-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-spanish-red">Lokswami newsroom</p>
          <h1 className="mt-1 text-3xl font-black text-zinc-950 dark:text-white">{staff.name}</h1>
          <p className="mt-2 text-sm capitalize text-zinc-600 dark:text-zinc-300">{staff.role.replace(/_/g, ' ')}</p>
        </div>
      </header>

      <section className="mt-8" aria-labelledby="author-reporting-heading">
        <div className="flex items-end justify-between gap-3">
          <h2 id="author-reporting-heading" className="text-2xl font-black text-zinc-950 dark:text-white">Published reporting</h2>
          <span className="text-sm text-zinc-500">{articles.length} article{articles.length === 1 ? '' : 's'}</span>
        </div>
        {articles.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {articles.map((article) => (
              <Link key={article.id} href={article.href} className="group overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-red-300 hover:shadow-md dark:border-white/10 dark:bg-zinc-950">
                <div className="relative aspect-video overflow-hidden bg-zinc-100"><Image src={article.image} alt="" fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" /></div>
                <div className="p-4"><p className="text-xs font-bold uppercase tracking-wide text-spanish-red">{article.category}</p><h3 className="mt-1 line-clamp-2 text-lg font-bold text-zinc-950 dark:text-white">{article.title}</h3><p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300">{article.summary}</p></div>
              </Link>
            ))}
          </div>
        ) : <p className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">No published articles are available for this author yet.</p>}
      </section>
    </main>
  );
}
