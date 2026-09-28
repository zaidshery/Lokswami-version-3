import { render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import HomepageTopPackage from '@/components/home/HomepageTopPackage';
import type { Article } from '@/lib/mock/data';

vi.mock('next/image', () => ({
  default: ({ alt, priority }: { alt: string; priority?: boolean }) => <img alt={alt} data-priority={String(Boolean(priority))} />,
}));

const articles: Article[] = Array.from({ length: 9 }, (_, i) => ({
  id: `story-${i}`, slug: `story-${i}`, title: `हिन्दी समाचार शीर्षक ${i}`,
  summary: 'समाचार का सारांश', image: '/placeholders/news-16x9.svg', category: 'National',
  publishedAt: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z`, views: i,
  author: { id: 'desk', name: 'Desk', avatar: '/logo-icon-final.png' },
}));

describe('homepage top package', () => {
  it('server renders real headline links, all sections and only one image preload', () => {
    const html = renderToString(<HomepageTopPackage articles={articles} language="hi" />);
    expect(html).toContain('मुख्य खबर');
    expect(html).toContain('ताज़ा खबरें');
    expect(html).toContain('लोकप्रिय खबरें');
    expect(html).toContain('href="/main/article/story-8"');
    expect(html).toContain('<h1');
    expect((html.match(/data-priority="true"/g) || []).length).toBe(1);
    expect(html).not.toContain('carousel');
  });
  it('has editorial DOM order and distinct IDs when alternatives exist', () => {
    const { container } = render(<HomepageTopPackage articles={articles} language="en" />);
    const sections = container.querySelectorAll('[data-testid="homepage-top-package"] > section');
    expect(Array.from(sections).map((section) => section.getAttribute('data-testid'))).toEqual([
      'lead-story', 'latest-news-rail', 'popular-news-rail',
    ]);
    expect(within(screen.getByTestId('latest-news-rail')).getAllByRole('link')).toHaveLength(4);
    expect(within(screen.getByTestId('popular-news-rail')).getAllByRole('link')).toHaveLength(4);
    expect(new Set(Array.from(container.querySelectorAll('[data-story-id]')).map((item) => item.getAttribute('data-story-id'))).size).toBe(9);
  });
});
