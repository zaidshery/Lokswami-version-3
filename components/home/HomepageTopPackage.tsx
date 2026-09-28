import Link from 'next/link';
import ReaderImage from '@/components/ui/ReaderImage';
import { Badge } from '@/components/ui/Badge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { Article } from '@/lib/mock/data';
import { selectHomepageSections } from '@/lib/content/homepageSections';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import { getNewsCategoryHref, resolveNewsCategory } from '@/lib/constants/newsCategories';
import { formatUiDate } from '@/lib/utils/dateFormat';

type Props = { articles: Article[]; language: 'hi' | 'en'; loading?: boolean };
const panel = 'min-w-0 rounded-editorial-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900';

function categoryName(article: Article, language: Props['language']) {
  const category = resolveNewsCategory(article.category);
  return category ? language === 'hi' ? category.name : category.nameEn : article.category;
}

function NewsRail({ articles, language, kind }: Pick<Props, 'articles' | 'language'> & { kind: 'latest' | 'popular' }) {
  return (
    <section className={`${panel} ${kind === 'latest' ? 'xl:order-1' : 'xl:order-3'}`} data-testid={`${kind}-news-rail`}>
      <SectionHeader title={kind === 'latest' ? language === 'hi' ? 'ताज़ा खबरें' : 'Latest' : language === 'hi' ? 'लोकप्रिय खबरें' : 'Popular'} />
      {articles.length ? <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {articles.map((article) => <li key={article.id} className="py-3 first:pt-0 last:pb-0" data-story-id={article.id}>
          <Link href={buildArticlePublicPath(article)} className="editorial-focus-ring block rounded-editorial-sm hover:text-brand-600 dark:hover:text-brand-400">
            <h3 className="hindi-headline break-words text-base font-semibold leading-relaxed">{article.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {categoryName(article, language)} · <time dateTime={article.publishedAt}>{formatUiDate(article.publishedAt)}</time>
            </p>
          </Link>
        </li>)}
      </ol> : <p className="text-sm text-zinc-600 dark:text-zinc-400">{language === 'hi' ? 'अभी खबरें उपलब्ध नहीं हैं।' : 'No stories available yet.'}</p>}
    </section>
  );
}

/** Plain editorial markup is also rendered during SSR; no mount gate or rotation. */
export default function HomepageTopPackage({ articles, language, loading }: Props) {
  const { lead, latest, popular } = selectHomepageSections(articles);
  const category = lead ? resolveNewsCategory(lead.category) : undefined;
  return (
    <div data-testid="homepage-top-package" className="grid min-w-0 grid-cols-1 gap-4 text-zinc-900 dark:text-zinc-100 md:grid-cols-2 xl:grid-cols-[minmax(0,3fr)_minmax(0,6fr)_minmax(0,3fr)]">
      <section className={`${panel} md:col-span-2 xl:order-2 xl:col-span-1`} data-testid="lead-story" data-story-id={lead?.id}>
        <SectionHeader title={language === 'hi' ? 'मुख्य खबर' : 'Lead Story'} />
        {lead ? <article>
          <Link href={buildArticlePublicPath(lead)} className="editorial-focus-ring relative mb-4 block aspect-video overflow-hidden rounded-editorial-sm">
            <ReaderImage src={lead.image} alt={lead.title} fill priority sizes="(min-width: 1280px) 50vw, 100vw" className="object-cover" />
          </Link>
          {category ? <Link href={getNewsCategoryHref(category.slug)} className="editorial-focus-ring inline-flex"><Badge size="md">{categoryName(lead, language)}</Badge></Link> : <Badge size="md">{lead.category}</Badge>}
          <h1 className="hindi-headline mt-3 break-words text-2xl font-bold leading-relaxed md:text-3xl">
            <Link href={buildArticlePublicPath(lead)} className="editorial-focus-ring hover:text-brand-600 dark:hover:text-brand-400">{lead.title}</Link>
          </h1>
          <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{lead.author.name} · <time dateTime={lead.publishedAt}>{formatUiDate(lead.publishedAt)}</time></p>
          {lead.summary ? <p className="mt-3 hidden text-base leading-relaxed text-zinc-700 dark:text-zinc-300 md:block">{lead.summary}</p> : null}
        </article> : <p role="status" className="py-8 text-sm text-zinc-600 dark:text-zinc-400">{loading ? language === 'hi' ? 'खबरें लोड हो रही हैं…' : 'Loading stories…' : language === 'hi' ? 'अभी खबरें उपलब्ध नहीं हैं।' : 'No stories available yet.'}</p>}
      </section>
      <NewsRail articles={latest} language={language} kind="latest" />
      <NewsRail articles={popular} language={language} kind="popular" />
    </div>
  );
}
