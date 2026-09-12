/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * Scenario Definitions & Composition
 */

import { DEMO_ARTICLES, type DemoArticleFixture } from './fixtures/articles';
import { DEMO_VIDEOS, type DemoVideoFixture } from './fixtures/videos';
import { DEMO_SHORTS, type DemoShortFixture } from './fixtures/shorts';
import { DEMO_EPAPERS, type DemoEpaperFixture } from './fixtures/epaper';
import { DEMO_MAGAZINES, type DemoMagazineFixture } from './fixtures/magazine';

export const SUPPORTED_SCENARIOS = [
  'full',
  'shell',
  'homepage',
  'article',
  'video',
  'epaper',
  'breaking-short',
  'breaking-long',
] as const;

export type DemoScenarioName = (typeof SUPPORTED_SCENARIOS)[number];

export function isSupportedScenario(name: string): name is DemoScenarioName {
  return (SUPPORTED_SCENARIOS as readonly string[]).includes(name);
}

export interface ScenarioFixturePlan {
  name: DemoScenarioName;
  description: string;
  articles: DemoArticleFixture[];
  videos: DemoVideoFixture[];
  shorts: DemoShortFixture[];
  epapers: DemoEpaperFixture[];
  magazines: DemoMagazineFixture[];
}

export function resolveScenarioPlan(name: string = 'full'): ScenarioFixturePlan {
  const normalized = name.trim().toLowerCase();
  if (!isSupportedScenario(normalized)) {
    throw new Error(
      `Unknown demo scenario "${name}". Supported scenarios: ${SUPPORTED_SCENARIOS.join(', ')}`
    );
  }

  switch (normalized) {
    case 'shell':
      return {
        name: 'shell',
        description: 'Shell QA scenario: 20 articles, 1 active short breaking news, 6 videos, 6 shorts, 1 released E-Paper, 1 magazine',
        articles: DEMO_ARTICLES.map((a) => {
          // Keep only short breaking news active in shell scenario
          if (a.slug === 'demo-breaking-indore-traffic-diversion-morning') {
            return { ...a, isBreaking: true };
          }
          if (a.slug === 'demo-breaking-weather-alert-madhya-pradesh-long') {
            return { ...a, isBreaking: false };
          }
          return a;
        }),
        videos: DEMO_VIDEOS.slice(0, 6),
        shorts: DEMO_SHORTS.slice(0, 6),
        epapers: [DEMO_EPAPERS[0]], // Only released Indore edition
        magazines: DEMO_MAGAZINES,
      };

    case 'homepage':
      return {
        name: 'homepage',
        description: 'Homepage QA scenario: 16 articles, 6 videos, 6 shorts, 1 released E-Paper edition',
        articles: DEMO_ARTICLES.slice(0, 16),
        videos: DEMO_VIDEOS.slice(0, 6),
        shorts: DEMO_SHORTS.slice(0, 6),
        epapers: [DEMO_EPAPERS[0]],
        magazines: DEMO_MAGAZINES,
      };

    case 'article':
      return {
        name: 'article',
        description: 'Article QA scenario: 20 articles with typographic edge cases (short, long, long summary, no image, long body, 0 views, large views, mixed script)',
        articles: DEMO_ARTICLES,
        videos: [],
        shorts: [],
        epapers: [],
        magazines: [],
      };

    case 'video':
      return {
        name: 'video',
        description: 'Video & Shorts QA scenario: 7 landscape videos and 8 vertical shorts',
        articles: DEMO_ARTICLES.slice(0, 10), // Base articles for short linkages
        videos: DEMO_VIDEOS,
        shorts: DEMO_SHORTS,
        epapers: [],
        magazines: [],
      };

    case 'epaper':
      return {
        name: 'epaper',
        description: 'E-Paper QA scenario: 2 editions (Indore released with releasedSnapshot, Ujjain draft) and 1 magazine',
        articles: [],
        videos: [],
        shorts: [],
        epapers: DEMO_EPAPERS,
        magazines: DEMO_MAGAZINES,
      };

    case 'breaking-short':
      return {
        name: 'breaking-short',
        description: 'Short Breaking News scenario: single short active breaking news alert',
        articles: DEMO_ARTICLES.map((a) => ({
          ...a,
          isBreaking: a.slug === 'demo-breaking-indore-traffic-diversion-morning',
        })),
        videos: [],
        shorts: [],
        epapers: [],
        magazines: [],
      };

    case 'breaking-long':
      return {
        name: 'breaking-long',
        description: 'Long Devanagari Breaking News scenario: multi-line wrapping breaking news alert',
        articles: DEMO_ARTICLES.map((a) => ({
          ...a,
          isBreaking: a.slug === 'demo-breaking-weather-alert-madhya-pradesh-long',
        })),
        videos: [],
        shorts: [],
        epapers: [],
        magazines: [],
      };

    case 'full':
    default:
      return {
        name: 'full',
        description: 'Full comprehensive QA scenario combining all fixture groups without duplicates',
        articles: DEMO_ARTICLES,
        videos: DEMO_VIDEOS,
        shorts: DEMO_SHORTS,
        epapers: DEMO_EPAPERS,
        magazines: DEMO_MAGAZINES,
      };
  }
}
