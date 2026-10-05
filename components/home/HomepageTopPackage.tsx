import Link from 'next/link';
import { ArrowRight, Newspaper } from 'lucide-react';
import ReaderImage from '@/components/ui/ReaderImage';
import WhatsAppBrandIcon from '@/components/home/WhatsAppBrandIcon';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { Article } from '@/lib/mock/data';
import type { HomePageEpaperPreview } from '@/lib/content/homeFeed';
import { selectHomepageSections } from '@/lib/content/homepageSections';
import { buildArticlePublicPath, buildArticlePublicUrl, toAbsoluteArticleUrl } from '@/lib/seo/articleSeo';
import { resolveNewsCategory } from '@/lib/constants/newsCategories';
import { buildArticleWhatsAppShareUrl, buildEpaperIssueWhatsAppShareUrl } from '@/lib/utils/articleShare';
import { trackClientEvent } from '@/lib/analytics/trackClient';
import { buildArticleImageVariantUrl } from '@/lib/utils/articleMedia';
import { formatUiDate } from '@/lib/utils/dateFormat';
import { buildEPaperReaderPath } from '@/lib/utils/readerContentPaths';

type Props = { articles: Article[]; epaper?: HomePageEpaperPreview | null; language: 'hi' | 'en'; loading?: boolean };
const panel = 'min-w-0 rounded-editorial-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 md:p-3.5 xl:p-4';

function categoryName(article: Article, language: Props['language']) {
  const category = resolveNewsCategory(article.category);
  return category ? language === 'hi' ? category.name : category.nameEn : article.category;
}

export function WhatsAppShareLink({ article, language, placement }: { article: Article; language: Props['language']; placement: 'lead_story' | 'latest_news' | 'popular_news' | 'live_updates' | 'national' | 'homepage_category' }) {
  const shareLabel = language === 'hi' ? 'व्हाट्सऐप पर साझा करें' : 'Share on WhatsApp';
  const shareHref = buildArticleWhatsAppShareUrl({
    title: article.title,
    articleUrl: buildArticlePublicUrl(article),
    category: categoryName(article, language),
  });
  return <a href={shareHref} target="_blank" rel="noopener noreferrer"
    aria-label={shareLabel} title={shareLabel}
    onClick={(event) => {
      event.stopPropagation();
      trackClientEvent({ event: 'share_click', source: 'homepage_top', metadata: { platform: 'whatsapp', contentType: 'article', contentId: article.id, placement } });
    }}
    className="editorial-focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center bg-transparent text-[#25D366] transition-opacity hover:opacity-80 active:opacity-70 motion-reduce:transition-none sm:h-8 sm:w-8">
    <WhatsAppBrandIcon className="h-[19px] w-[19px] sm:h-[18px] sm:w-[18px]" />
  </a>;
}

function NewsRail({ articles, language, popular = false }: Pick<Props, 'articles' | 'language'> & { popular?: boolean }) {
  return <section className={`${panel} flex flex-col ${popular ? 'xl:col-span-2 xl:row-start-2' : 'xl:col-start-1 xl:row-start-1'}`} data-testid={popular ? 'popular-news-rail' : 'latest-news-rail'}>
    <SectionHeader title={popular ? language === 'hi' ? 'लोकप्रिय खबरें' : 'Popular News' : language === 'hi' ? 'ताज़ा खबरें' : 'Latest News'} className="!mb-2" />
    {articles.length ? <ol className={`divide-y divide-zinc-200 dark:divide-zinc-800 ${popular ? 'grid gap-x-4 sm:grid-cols-2' : 'xl:flex xl:flex-1 xl:flex-col xl:justify-between'}`}>
      {articles.map(article => {
        const href = buildArticlePublicPath(article);
        return <li key={article.id} data-story-id={article.id} className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-editorial-sm py-2.5 transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30 sm:grid-cols-[96px_minmax(0,1fr)] xl:grid-cols-[100px_minmax(0,1fr)] 2xl:grid-cols-[104px_minmax(0,1fr)]">
          <Link href={href} tabIndex={-1} aria-hidden="true" className="editorial-focus-ring relative block aspect-[10/7] overflow-hidden rounded-editorial-sm bg-zinc-100 dark:bg-zinc-950">
            <ReaderImage src={buildArticleImageVariantUrl(article.image, 'thumb')} alt={article.title} fill sizes="(min-width: 1536px) 104px, (min-width: 1280px) 100px, (min-width: 640px) 96px, 88px" className="object-cover" />
          </Link>
          <div className="flex min-w-0 flex-col justify-between gap-1.5">
            <Link href={href} className="editorial-focus-ring hindi-headline line-clamp-2 break-words text-[15px] font-semibold leading-[1.35] hover:text-brand-600 dark:hover:text-brand-400">{article.title}</Link>
            <div className="flex min-w-0 items-center justify-between gap-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1">
                <span className="max-w-full truncate font-medium text-brand-600 dark:text-brand-400">{categoryName(article, language)}</span>
                <span aria-hidden="true">·</span><time className="whitespace-nowrap" dateTime={article.publishedAt}>{formatUiDate(article.publishedAt)}</time>
              </span>
              <WhatsAppShareLink article={article} language={language} placement={popular ? 'popular_news' : 'latest_news'} />
            </div>
          </div>
        </li>;
      })}
    </ol> : <p className="text-sm text-zinc-600 dark:text-zinc-400">{language === 'hi' ? 'अभी खबरें उपलब्ध नहीं हैं।' : 'No stories available yet.'}</p>}
    <Link href="/main/latest" className="editorial-focus-ring mt-auto inline-flex min-h-10 items-center justify-center gap-1.5 border-t border-zinc-200 pt-2 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:border-zinc-800 dark:text-brand-400 dark:hover:text-brand-300 xl:justify-start">
      {popular ? language === 'hi' ? 'सभी देखें' : 'View All' : language === 'hi' ? 'सभी ताज़ा खबरें देखें' : 'View all latest news'}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
    </Link>
  </section>;
}

export function IndoreEpaper({ epaper, language }: Pick<Props, 'epaper' | 'language'>) {
  const citySlug = String(epaper?.citySlug || '').trim().toLowerCase();
  const cityName = String(epaper?.cityName || '').trim().toLowerCase();
  const publishedIndore = epaper?.publicationType === 'epaper' && (citySlug === 'indore' || (!citySlug && cityName === 'indore')) ? epaper : null;
  const href = buildEPaperReaderPath(publishedIndore ? { city: 'indore', publishDate: publishedIndore.publishDate } : {});
  const shareLabel = language === 'hi' ? 'इंदौर ई-पेपर व्हाट्सऐप पर साझा करें' : 'Share Indore E-Paper on WhatsApp';
  const shareHref = publishedIndore ? buildEpaperIssueWhatsAppShareUrl({
    title: language === 'hi' ? 'इंदौर ई-पेपर' : 'Indore E-Paper',
    issueUrl: toAbsoluteArticleUrl(href),
    cityLabel: language === 'hi' ? 'इंदौर' : 'Indore',
    dateLabel: publishedIndore.publishDate,
  }) : '';
  return <section className={`${panel} flex flex-col`} data-testid="indore-epaper">
    <SectionHeader title={language === 'hi' ? 'इंदौर ई-पेपर' : 'Indore E-Paper'} className="!mb-2" />
    {publishedIndore ? <div className="flex flex-1 flex-col items-center gap-2.5">
      <span className="self-start rounded-editorial-sm bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">{language === 'hi' ? 'नवीनतम संस्करण' : 'Latest Edition'}</span>
      <Link href={href} className="editorial-focus-ring relative block aspect-[3/4] w-[min(78%,280px)] overflow-hidden rounded-editorial-sm border border-zinc-200 bg-zinc-100 p-0.5 shadow-editorial-lg transition-shadow hover:shadow-xl dark:border-zinc-700 dark:bg-zinc-950 md:w-[min(84%,290px)] xl:w-[min(88%,290px)]" aria-label={language === 'hi' ? 'इंदौर ई-पेपर पढ़ें' : 'Read Indore E-Paper'}>
        {publishedIndore.thumbnailPath ? <ReaderImage src={publishedIndore.thumbnailPath} alt={language === 'hi' ? 'इंदौर ई-पेपर का पहला पृष्ठ' : 'Indore E-Paper front page'} fill sizes="(min-width: 1280px) 290px, (min-width: 768px) 40vw, 78vw" className="object-contain p-1" /> : <span className="flex h-full items-center justify-center p-4 text-center text-sm text-zinc-500">{language === 'hi' ? 'इंदौर ई-पेपर' : 'Indore E-Paper'}</span>}
      </Link>
      <p className="flex items-center justify-center gap-x-2 whitespace-nowrap text-center text-[11px] text-zinc-600 dark:text-zinc-400"><span className="font-semibold text-zinc-700 dark:text-zinc-300">{language === 'hi' ? 'इंदौर संस्करण' : 'Indore Edition'}</span><span aria-hidden="true">·</span><time dateTime={publishedIndore.publishDate}>{formatUiDate(publishedIndore.publishDate)}</time></p>
      <div className="mt-auto flex w-full items-center gap-1.5">
        <Link href={href} className="editorial-focus-ring inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-600 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"><Newspaper aria-hidden="true" className="h-4 w-4 shrink-0" />{language === 'hi' ? 'ई-पेपर पढ़ें' : 'Read E-Paper'}</Link>
        <a href={shareHref} target="_blank" rel="noopener noreferrer" aria-label={shareLabel} title={shareLabel}
          className="editorial-focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white transition-colors hover:bg-[#1fad53] active:bg-[#199c49] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#128c3e]">
          <WhatsAppBrandIcon className="h-[18px] w-[18px]" />
        </a>
      </div>
    </div> : <div className="flex min-h-52 flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{language === 'hi' ? 'आज का इंदौर ई-पेपर अभी उपलब्ध नहीं है' : 'The Indore E-Paper is not available yet.'}</p>
      <Link href="/main/epaper" className="editorial-focus-ring text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">{language === 'hi' ? 'ई-पेपर देखें' : 'Browse E-Paper'}</Link>
    </div>}
  </section>;
}

/** Plain editorial markup is also rendered during SSR; no mount gate or rotation. */
export default function HomepageTopPackage({ articles, language, loading }: Omit<Props, 'epaper'>) {
  const { lead, latest, popular } = selectHomepageSections(articles);
  return <div data-testid="homepage-top-package" className="grid min-w-0 grid-cols-1 items-stretch gap-4 text-zinc-900 dark:text-zinc-100 xl:grid-cols-[minmax(0,29fr)_minmax(0,44fr)] xl:col-start-1 xl:row-start-1">
    <section className={`${panel} xl:col-start-2 xl:row-start-1`} data-testid="lead-story" data-story-id={lead?.id}>
      <SectionHeader title={language === 'hi' ? 'मुख्य खबर' : 'Lead Story'} level={lead ? 'div' : 'h1'} className="!mb-2" />
      {lead ? <article>
        <Link href={buildArticlePublicPath(lead)} tabIndex={-1} aria-hidden="true" className="editorial-focus-ring relative mb-3 block aspect-video overflow-hidden rounded-editorial-sm">
          <ReaderImage src={buildArticleImageVariantUrl(lead.image, 'hero')} alt={lead.title} fill priority sizes="(min-width: 1440px) 532px, (min-width: 1280px) 40vw, 100vw" className="object-cover" />
        </Link>
        <h1 className="hindi-headline line-clamp-3 break-words text-[clamp(1.3125rem,5.5vw,1.5rem)] font-bold leading-[1.23] tracking-[-0.01em] md:text-[clamp(1.5rem,2.4vw,1.75rem)]">
          <Link href={buildArticlePublicPath(lead)} className="editorial-focus-ring hover:text-brand-600 dark:hover:text-brand-400">{lead.title}</Link>
        </h1>
        <div data-testid="lead-metadata" className="mt-3 flex min-w-0 items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="min-w-0 truncate font-semibold text-brand-600 dark:text-brand-400">{categoryName(lead, language)}</span>
            <span aria-hidden="true">·</span>
            <time className="whitespace-nowrap" dateTime={lead.publishedAt}>{formatUiDate(lead.publishedAt)}</time>
          </div>
          <WhatsAppShareLink article={lead} language={language} placement="lead_story" />
        </div>
      </article> : <p role="status" className="py-8 text-sm text-zinc-600 dark:text-zinc-400">{loading ? language === 'hi' ? 'खबरें लोड हो रही हैं…' : 'Loading stories…' : language === 'hi' ? 'अभी खबरें उपलब्ध नहीं हैं।' : 'No stories available yet.'}</p>}
    </section>
    <NewsRail articles={latest} language={language} />
    <NewsRail articles={popular} language={language} popular />
  </div>;
}
