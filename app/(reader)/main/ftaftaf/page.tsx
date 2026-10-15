'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import type { Article } from '@/lib/mock/data';
import { fetchMergedLiveArticles } from '@/lib/content/liveArticles';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import { buildArticleImageVariantUrl } from '@/lib/utils/articleMedia';
import ArticleMetaRow from '@/components/ui/ArticleMetaRow';

const VIEWPORT_HEIGHT_CLASS = 'h-[calc(100svh-12.8rem)] md:h-[calc(100svh-13rem)]';

export default function FtaftafPage() {
  const { language } = useAppStore();
  const feedRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const isAnimatingRef = useRef(false);

  const [activeIndex, setActiveIndex] = useState(0);
  const [ftaftafArticles, setFtaftafArticles] = useState<Article[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const merged = await fetchMergedLiveArticles(30);
      if (active) {
        setFtaftafArticles(merged.slice(0, 10));
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diff < 60) {
      return language === 'hi' ? `${diff} \u092e\u093f\u0928\u091f \u092a\u0939\u0932\u0947` : `${diff} min ago`;
    } else if (diff < 1440) {
      const hours = Math.floor(diff / 60);
      return language === 'hi' ? `${hours} \u0918\u0902\u091f\u0947 \u092a\u0939\u0932\u0947` : `${hours} hours ago`;
    }

    const days = Math.floor(diff / 1440);
    return language === 'hi' ? `${days} \u0926\u093f\u0928 \u092a\u0939\u0932\u0947` : `${days} days ago`;
  };

  const renderTime = (dateString: string) =>
    isHydrated ? formatTime(dateString) : language === 'hi' ? '\u0939\u093e\u0932 \u0939\u0940 \u092e\u0947\u0902' : 'recently';

  const scrollToIndex = useCallback((index: number) => {
    const bounded = Math.max(0, Math.min(index, ftaftafArticles.length - 1));
    const target = cardRefs.current[bounded];
    const container = feedRef.current;
    if (!target || !container) return;

    const targetTop = target.offsetTop;
    const start = container.scrollTop;
    const distance = targetTop - start;
    const duration = 520;
    const startedAt = performance.now();

    isAnimatingRef.current = true;

    const easeInOut = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      container.scrollTop = start + distance * easeInOut(progress);

      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }

      isAnimatingRef.current = false;
    };

    requestAnimationFrame(step);
  }, [ftaftafArticles.length]);

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index ?? 0);
            setActiveIndex(idx);
          }
        }
      },
      { root, threshold: 0.65 }
    );

    cardRefs.current.forEach((card) => {
      if (card) observer.observe(card);
    });

    return () => observer.disconnect();
  }, [ftaftafArticles.length]);

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;

    const onWheel = (event: WheelEvent) => {
      if (isAnimatingRef.current) return;
      if (Math.abs(event.deltaY) < 8) return;

      event.preventDefault();
      scrollToIndex(activeIndex + (event.deltaY > 0 ? 1 : -1));
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [activeIndex, scrollToIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!ftaftafArticles.length) return;
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      if (event.key === 'ArrowDown') scrollToIndex(activeIndex + 1);
      if (event.key === 'ArrowUp') scrollToIndex(activeIndex - 1);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, scrollToIndex, ftaftafArticles.length]);


  if (!ftaftafArticles.length) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        {language === 'hi' ? 'अभी कोई खबर उपलब्ध नहीं है।' : 'No stories available right now.'}
      </section>
    );
  }

  return (
    <section className="relative">
      <div className="relative mx-auto w-full max-w-[420px] md:max-w-[470px]">
        <div
          ref={feedRef}
          className={`scrollbar-hide ${VIEWPORT_HEIGHT_CLASS} snap-y snap-mandatory overflow-y-auto overscroll-y-contain rounded-[26px] bg-zinc-100 shadow-[0_24px_70px_rgba(0,0,0,0.28)] dark:bg-zinc-900`}
        >
          {ftaftafArticles.map((article, index) => {
            const readHref = buildArticlePublicPath({ id: article.id, slug: article.slug });
            return (
              <article
                key={article.id}
                data-index={index}
                ref={(el) => {
                  cardRefs.current[index] = el;
                }}
                className={`relative ${VIEWPORT_HEIGHT_CLASS} snap-start snap-always overflow-hidden bg-white dark:bg-zinc-950`}
              >
                <div className="relative h-[48%] w-full">
                  <Image
                    src={buildArticleImageVariantUrl(article.image, 'story')}
                    alt={article.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 470px"
                    priority={index < 2}
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

                  <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                    {article.category}
                  </div>
                </div>

                <div className="flex h-[52%] flex-col p-4 md:p-5">
                  <h2 className="line-clamp-3 text-xl font-black leading-tight text-zinc-900 dark:text-zinc-100">
                    {article.title}
                  </h2>

                  <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 md:text-base">
                    {article.summary}
                  </p>

                  <ArticleMetaRow
                    article={article}
                    timeText={renderTime(article.publishedAt)}
                    language={language}
                    className="mt-auto pt-3"
                    compact
                    withBorder
                    showWhatsAppText
                    readHref={readHref}
                    sharePath={readHref}
                  />
                </div>
              </article>
            );
          })}
        </div>

        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full bg-black/35 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
          {activeIndex + 1} / {ftaftafArticles.length}
        </div>

        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur md:bottom-4">
          Swipe Up
        </div>

        <div className="absolute right-2 top-2 z-20 hidden flex-col gap-2 md:flex">
          <button
            onClick={() => scrollToIndex(activeIndex - 1)}
            className="rounded-full bg-black/45 p-2 text-white shadow-lg backdrop-blur transition hover:bg-black/60"
            aria-label="Previous story"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => scrollToIndex(activeIndex + 1)}
            className="rounded-full bg-black/45 p-2 text-white shadow-lg backdrop-blur transition hover:bg-black/60"
            aria-label="Next story"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
