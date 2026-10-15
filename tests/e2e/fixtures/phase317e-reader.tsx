'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import EPaperToolbar from '@/components/epaper/reader/EPaperToolbar';
import EPaperStoryPreview from '@/components/epaper/reader/EPaperStoryPreview';
import EPaperStoryImageViewport from '@/components/epaper/reader/EPaperStoryImageViewport';
import VideoDetailHero from '@/components/video/VideoDetailHero';
import ShareMenu from '@/components/ui/ShareMenu';
import QuickArticleSheet from '@/components/swipe/QuickArticleSheet';
import SwipeSettingsSheet from '@/components/swipe/SwipeSettingsSheet';
import { useAppStore } from '@/lib/store/appStore';
import type { VideoPlayerHandle } from '@/components/ui/VideoPlayer';
import type { VideoItem } from '@/components/video/types';
import type { EPaperArticleRecord } from '@/lib/types/epaper';
import shorts from '@/tests/fixtures/content-snapshot/shorts.json';
import ArticleDetailClient from '@/app/(reader)/main/article/[id]/ArticleDetailClient';
import { articles } from '@/lib/mock/data';
import NewsCard from '@/components/ui/NewsCard';

// Component mechanics only: these existing test records never enter persistence.
const story: EPaperArticleRecord = { _id: 'story-rec-1', slug: 'story-rec-1', epaperId: 'epaper-1', pageNumber: 1, title: 'Front Page Lead Story', excerpt: 'Front page excerpt text content for accessibility testing.', contentHtml: '<p>Front page excerpt text content for accessibility testing.</p>', hotspot: { x: 10, y: 10, w: 200, h: 200 } };
const video = { ...shorts.items[0], id: shorts.items[0].id, videoUrl: shorts.items[0].playbackUrl, thumbnail: '/placeholders/video-16x9.svg', isShort: true, isPublished: true } as unknown as VideoItem;
const noop = () => {};

export default function Phase317EReaderFixture() {
  const { language, theme } = useAppStore();
  const player = useRef<VideoPlayerHandle | null>(null);
  const [preview, setPreview] = useState(false);
  const [page, setPage] = useState(2);
  const [motionActive, setMotionActive] = useState(false);
  const [boundary, setBoundary] = useState(false);
  const [articleOnly, setArticleOnly] = useState(false);
  const [cardsOnly, setCardsOnly] = useState(false);
  const [quick, setQuick] = useState(false);
  const [settings, setSettings] = useState(false);
  const quickTrigger = useRef<HTMLButtonElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const params = new URL(location.href).searchParams;
    setBoundary(params.has('boundary'));
    setArticleOnly(params.has('article'));
    setCardsOnly(params.has('cards'));
  }, []);
  if (articleOnly) return <main className="bg-white p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"><ArticleDetailClient article={articles[0]} relatedArticles={[]} /></main>;
  if (cardsOnly) return <main className="min-h-screen bg-white p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"><h1>Existing article card fixture</h1><h2>Trending stories</h2><div className="grid gap-4 md:grid-cols-3">{articles.filter(article => article.isTrending).slice(0, 3).map((article, index) => <NewsCard key={article.id} article={article} index={index} />)}</div></main>;
  if (boundary) return <main className="p-8"><h1>Share boundary fixture</h1><ShareMenu title={story.title} url="/main/article/story-rec-1" contentType="article" language={language} ariaLabel="Boundary share" /></main>;
  return <main className="min-h-screen bg-white p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <h1>Phase 3.17E component mechanics fixture</h1>
    <section data-fixture="toolbar">
      <EPaperToolbar title="Reader fixture" editionLabel="Publication fixture" issueDateLabel="October 2026" currentPage={page} pageCount={6} zoom={1.5} canGoPrevious canGoNext canUseSpreadMode onPreviousPage={() => setPage(value => value - 1)} onNextPage={() => setPage(value => value + 1)} onPageSelect={setPage} onZoomIn={noop} onZoomOut={noop} onResetZoom={noop} onToggleFullscreen={noop} onToggleSave={noop} onToggleSpreadMode={noop} onToggleTheme={noop} onToggleThumbnails={noop} onOpenDownload={noop} onClose={noop} shareUrl="/main/epaper" shareText="Reader fixture" publicationType="epaper" language={language} theme={theme} />
    </section>
    <section data-fixture="hero" className="mx-auto mt-8 max-w-lg"><VideoDetailHero selectedVideo={video} playerRef={player} isPaused isMuted autoAdvance={false} captionsEnabled={false} playbackRate={1} onPausedChange={noop} onMutedChange={noop} onCaptionsChange={noop} onPlaybackRateChange={noop} onAdvanceToNext={noop} onBackToList={noop} /></section>
    <section data-fixture="image" className="mt-8 flex h-96 flex-col"><EPaperStoryImageViewport story={story} pageImagePath="/placeholders/news-16x9.svg" language={language} /></section>
    <section data-fixture="article-share" className="mt-8 flex gap-4">
      <button type="button">Before article share</button><ShareMenu title={story.title} url="/main/article/story-rec-1" contentType="article" language={language} ariaLabel="Article fixture share" /><button type="button">After article share</button>
    </section>
    <section data-fixture="video-share" className="mt-8 flex gap-4">
      <button type="button">Before video share</button><ShareMenu title={video.title} url="/main/videos" contentType="video" language={language} ariaLabel="Video fixture share" /><button type="button">After video share</button>
    </section>
    <button type="button" onClick={() => setPreview(true)} className="reader-focus-ring mt-8 min-h-11">Open story fixture</button>
    <button ref={quickTrigger} type="button" onClick={() => setQuick(true)} className="reader-focus-ring mt-8 min-h-11">Open quick article fixture</button>
    <button ref={settingsTrigger} type="button" onClick={() => setSettings(true)} className="reader-focus-ring mt-8 min-h-11">Open settings fixture</button>
    <QuickArticleSheet article={{ id: story._id, slug: story.slug!, title: story.title, summary: story.excerpt!, category: 'National', author: 'Editorial Desk', publishedAt: '2026-10-01T10:00:00Z', href: '/main/article/story-rec-1' }} open={quick} onClose={() => setQuick(false)} returnFocusRef={quickTrigger} />
    <SwipeSettingsSheet open={settings} dataSaver onDataSaverChange={noop} onClose={() => setSettings(false)} returnFocusRef={settingsTrigger} />
    {preview ? <EPaperStoryPreview story={story} articlePath="/main/article/story-rec-1" pageImagePath="/placeholders/news-16x9.svg" issueTitle="Publication fixture" language={language} onClose={() => setPreview(false)} onOpenClipping={noop} /> : null}
    <section data-fixture="motion" className="mt-8">
      <button type="button" onClick={() => setMotionActive(value => !value)}>Toggle motion fixture</button>
      <motion.div data-motion-probe animate={{ x: motionActive ? 100 : 0 }} transition={{ duration: 1 }} className="h-12 w-12 bg-red-700" />
    </section>
  </main>;
}
