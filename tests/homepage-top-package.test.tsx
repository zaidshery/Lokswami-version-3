import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import HomepageTopPackage, { IndoreEpaper } from '@/components/home/HomepageTopPackage';
import type { Article } from '@/lib/mock/data';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/trackClient', () => ({ trackClientEvent: trackEvent }));

vi.mock('next/image', () => ({
  // Test double records the image loading contract without loading assets.
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, priority }: { alt: string; priority?: boolean }) => <img alt={alt} data-priority={String(Boolean(priority))} />,
}));

const articles: Article[] = Array.from({ length: 9 }, (_, i) => ({
  id: `story-${i}`, slug: `story-${i}`, title: `Hindi news headline ${i}`,
  summary: 'Long lead summary that should not appear in the top package', image: '/placeholders/news-16x9.svg', category: 'National',
  publishedAt: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z`, views: i,
  author: { id: 'desk', name: 'Desk', avatar: '/logo-icon-final.png' },
}));

const epaper = { _id:'paper-1', publicationType:'epaper' as const, citySlug:'indore', cityName:'Indore', title:'Indore', publishDate:'2026-09-30', thumbnailPath:'/cover.jpg', pageCount:12 };

describe('homepage top package', () => {
  it('server renders the clean lead and only one priority image', () => {
    const html = renderToString(<HomepageTopPackage articles={articles} language="hi" />);
    expect(html).toContain('मुख्य खबर');
    expect(html).toContain('ताज़ा खबरें');
    expect(html).not.toContain('indore-epaper');
    expect(html).toContain('href="/main/article/story-8"');
    expect(html).not.toContain(articles[8].summary);
    expect((html.match(/data-priority="true"/g) || []).length).toBe(1);
  });
  it('renders four compact image cards with metadata, share links, and distinct stories', () => {
    const { container } = render(<HomepageTopPackage articles={articles} language="en" />);
    expect(screen.getByTestId('homepage-top-package').className).toContain('xl:grid-cols-');
    expect(screen.getByTestId('homepage-top-package').className).toContain('items-stretch');
    expect(Array.from(container.querySelectorAll('[data-testid="homepage-top-package"] > section')).map(section => section.getAttribute('data-testid'))).toEqual(['lead-story','latest-news-rail']);
    expect(screen.queryByTestId('indore-epaper')).not.toBeInTheDocument();
    const latest = within(screen.getByTestId('latest-news-rail'));
    expect(latest.getAllByRole('listitem')).toHaveLength(4);
    expect(latest.getAllByRole('img')).toHaveLength(4);
    expect(latest.getAllByRole('link',{name:'Share on WhatsApp'})).toHaveLength(4);
    expect(latest.getAllByRole('link',{name:'Share on WhatsApp'}).every(link =>
      link.getAttribute('title') === 'Share on WhatsApp' &&
      link.className.includes('sm:h-8') &&
      link.className.includes('h-9') &&
      !link.className.includes('border') &&
      !link.className.includes('rounded-full') &&
      Boolean(link.querySelector('[data-brand-icon="whatsapp"]'))
    )).toBe(true);
    expect(latest.getByRole('link',{name:'View all latest news'})).toHaveAttribute('href','/main/latest');
    expect(latest.getAllByText('National', { exact:false })).toHaveLength(4);
    expect(latest.getByRole('list').className).toContain('divide-y');
    expect(latest.getAllByRole('listitem').every(item => !item.className.includes('border border-'))).toBe(true);
    expect(new Set(Array.from(container.querySelectorAll('[data-story-id]')).map(item => item.getAttribute('data-story-id'))).size).toBe(5);
  });
  it('shares encoded headline and canonical public story URL', () => {
    const rowClick = vi.fn();
    render(<div onClick={rowClick}><HomepageTopPackage articles={articles} language="en" /></div>);
    const share = within(screen.getByTestId('latest-news-rail')).getAllByRole('link',{name:'Share on WhatsApp'})[0];
    const url = new URL(share.getAttribute('href')!);
    expect(url.host).toBe('wa.me');
    expect(url.searchParams.get('text')).toContain('/main/article/story-7');
    expect(url.searchParams.get('text')).toContain(articles[7].title);
    expect(url.searchParams.get('text')).toContain('https://lokswami.com/main/article/story-7');
    expect(share.querySelector('[data-brand-icon="whatsapp"]')).toBeInTheDocument();
    expect(share.querySelector('[data-brand-icon="whatsapp"]')).toHaveClass('sm:h-[18px]');
    expect(share.closest('a')).toBe(share);
    share.addEventListener('click', event => event.preventDefault());
    fireEvent.click(share);
    expect(rowClick).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({ event:'share_click', source:'homepage_top' }));
  });
  it('places published date and WhatsApp after the lead headline in both languages', () => {
    const {rerender}=render(<HomepageTopPackage articles={articles} language="en" />);
    const lead=screen.getByTestId('lead-story');
    const headline=within(lead).getByRole('heading',{level:1});
    const metadata=screen.getByTestId('lead-metadata');
    expect(headline.compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(lead).getAllByText('National')).toHaveLength(1);
    expect(within(lead).queryByRole('link',{name:'National'})).not.toBeInTheDocument();
    expect(within(metadata).getByText('National')).toHaveClass('font-semibold');
    expect(metadata.textContent).toContain('National·09/09/26');
    expect(within(metadata).getByText('09/09/26')).toHaveAttribute('datetime',articles[8].publishedAt);
    expect(within(lead).queryByText('Desk')).not.toBeInTheDocument();
    const share=within(metadata).getByRole('link',{name:'Share on WhatsApp'});
    expect(share.querySelector('[data-brand-icon="whatsapp"]')).toBeInTheDocument();
    expect(share).toHaveClass('bg-transparent');
    expect(share.className).not.toContain('border');
    expect(share).toHaveAttribute('title','Share on WhatsApp');
    expect(new URL(share.getAttribute('href')!).searchParams.get('text')).toContain('https://lokswami.com/main/article/story-8');
    rerender(<HomepageTopPackage articles={articles} language="hi" />);
    expect(screen.getByTestId('lead-metadata').textContent).toContain('राष्ट्रीय·09/09/26');
    expect(within(screen.getByTestId('lead-metadata')).getByRole('link',{name:'व्हाट्सऐप पर साझा करें'})).toHaveAttribute('title','व्हाट्सऐप पर साझा करें');
    expect(within(screen.getByTestId('latest-news-rail')).getByRole('link',{name:'सभी ताज़ा खबरें देखें'})).toHaveAttribute('href','/main/latest');
  });
  it('shows the Indore cover and existing date-filtered reader link', () => {
    render(<IndoreEpaper epaper={epaper} language="en" />);
    const section=within(screen.getByTestId('indore-epaper'));
    expect(section.getByRole('img',{name:'Indore E-Paper front page'})).toBeInTheDocument();
    expect(section.getByText('Latest Edition')).toBeInTheDocument();
    expect(section.getByText('Indore Edition')).toBeInTheDocument();
    expect(section.getByText('30/09/26')).toHaveAttribute('datetime',epaper.publishDate);
    expect(screen.getByTestId('indore-epaper').className).not.toMatch(/sticky|fixed|col-start|row-span/);
    const read=section.getByRole('link',{name:'Read E-Paper'});
    const share=section.getByRole('link',{name:'Share Indore E-Paper on WhatsApp'});
    expect(read).toHaveAttribute('href','/main/epaper?city=indore&date=2026-09-30');
    expect(read.parentElement).toBe(share.parentElement);
    expect(read.parentElement?.children).toHaveLength(2);
    expect(read.parentElement).toHaveClass('mt-auto','w-full','gap-1.5');
    expect(read.parentElement).not.toHaveClass('bg-brand-600','overflow-hidden');
    expect(read).toHaveClass('h-10','flex-1','rounded-full','bg-brand-600','text-white');
    expect(share).toHaveAttribute('title','Share Indore E-Paper on WhatsApp');
    expect(share).toHaveAttribute('target','_blank');
    expect(share).toHaveAttribute('rel','noopener noreferrer');
    expect(share).toHaveClass('h-10','w-10','rounded-xl','bg-[#25D366]','text-white');
    expect(share).not.toHaveClass('border-l','bg-brand-600');
    expect(share.querySelector('[data-brand-icon="whatsapp"]')).toHaveClass('h-[18px]','w-[18px]');
    const shareUrl=new URL(share.getAttribute('href')!);
    expect(shareUrl.host).toBe('wa.me');
    expect(shareUrl.searchParams.get('text')).toContain('Indore E-Paper');
    expect(shareUrl.searchParams.get('text')).toContain(epaper.publishDate);
    expect(shareUrl.searchParams.get('text')).toContain('https://lokswami.com/main/epaper?city=indore&date=2026-09-30');
  });
  it('preserves legacy Indore city-name fallback and rejects a conflicting city slug', () => {
    const { rerender } = render(<IndoreEpaper epaper={{ ...epaper, citySlug: '' }} language="en" />);
    expect(screen.getByRole('link', { name: 'Read E-Paper' })).toHaveAttribute('href', '/main/epaper?city=indore&date=2026-09-30');
    rerender(<IndoreEpaper epaper={{ ...epaper, citySlug: 'mumbai' }} language="en" />);
    expect(screen.queryByRole('link', { name: 'Read E-Paper' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse E-Paper' })).toHaveAttribute('href', '/main/epaper');
  });

  it('localizes the published Indore WhatsApp action', () => {
    render(<IndoreEpaper epaper={epaper} language="hi" />);
    const share=within(screen.getByTestId('indore-epaper')).getByRole('link',{name:'इंदौर ई-पेपर व्हाट्सऐप पर साझा करें'});
    expect(share).toHaveAttribute('title','इंदौर ई-पेपर व्हाट्सऐप पर साझा करें');
    expect(new URL(share.getAttribute('href')!).searchParams.get('text')).toContain('इंदौर ई-पेपर');
  });
  it('shows localized empty state for missing or wrong-publication issues', () => {
    const {rerender}=render(<IndoreEpaper language="hi" />);
    expect(screen.getByText('आज का इंदौर ई-पेपर अभी उपलब्ध नहीं है')).toBeInTheDocument();
    rerender(<IndoreEpaper epaper={{...epaper,publicationType:'emagazine'}} language="hi" />);
    const section=within(screen.getByTestId('indore-epaper'));
    expect(section.getByRole('link',{name:'ई-पेपर देखें'})).toHaveAttribute('href','/main/epaper');
    expect(section.queryByRole('link',{name:'इंदौर ई-पेपर व्हाट्सऐप पर साझा करें'})).not.toBeInTheDocument();
  });
});
