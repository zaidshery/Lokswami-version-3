import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArticleClippingModal from '@/components/epaper/reader/modals/ArticleClippingModal';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} data-testid="mock-clipping-image" />
  ),
}));

describe('ArticleClippingModal', () => {
  const sampleArticle: EPaperArticleRecord = {
    _id: 'art-1',
    epaperId: 'epaper-123',
    pageNumber: 3,
    title: 'इंदौर में मेट्रो का विस्तार, नए स्टेशनों को मिली मंजूरी',
    slug: 'indore-metro-expansion',
    excerpt: 'इंदौर शहर में मेट्रो परियोजना के दूसरे चरण की शुरुआत जल्द होगी।',
    coverImagePath: '/clipping-1.jpg',
    hotspot: { x: 0, y: 0, w: 100, h: 100 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('offers only image sharing and downloading in the reader panel', () => {
    render(<ArticleClippingModal embedded isOpen article={sampleArticle} onClose={vi.fn()} language="en" />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button',{name:'Share image'})).toBeEnabled();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link',{name:'Download image'})).toBeVisible();
    expect(screen.queryByRole('button', {name:'Share link'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'Close clipping tools'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'Copy Link'})).not.toBeInTheDocument();
  });

  it('embeds clipping tools without opening another image reader or fetching a preview', () => {
    render(<ArticleClippingModal embedded isOpen article={sampleArticle} onClose={vi.fn()} publicationType="emagazine" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-clipping-image')).not.toBeInTheDocument();
    expect(screen.getByRole('link', {name:'Download image'})).toHaveAttribute('href', expect.stringContaining('publicationType=emagazine'));
    expect(screen.getByRole('button', {name:'Share image'})).toBeEnabled();
  });

  it('renders null when isOpen is false', () => {
    const { container } = render(
      <ArticleClippingModal
        isOpen={false}
        onClose={vi.fn()}
        article={sampleArticle}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders branded newspaper header, masthead, edition details, and title', () => {
    render(
      <ArticleClippingModal
        isOpen={true}
        onClose={vi.fn()}
        article={sampleArticle}
        editionName="इंदौर संस्करण"
        publishDate="2026-09-05"
        shareUrl="https://lokswami.com/main/epaper?paper=epaper-123&page=3&story=art-1"
        shareText="इंदौर में मेट्रो का विस्तार"
        language="hi"
      />
    );

    expect(screen.getByText('दैनिक लोकस्वामी')).toBeInTheDocument();
    expect(screen.getByText('ई-पेपर')).toBeInTheDocument();
    expect(screen.getByText(/इंदौर संस्करण • 2026-09-05 • पृष्ठ 3/)).toBeInTheDocument();
    expect(screen.getByText('इंदौर में मेट्रो का विस्तार, नए स्टेशनों को मिली मंजूरी')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Link/i })).toBeInTheDocument();
  });

  it('copies shareUrl to clipboard on click', async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextSpy,
      },
      configurable: true,
      writable: true,
    });

    render(
      <ArticleClippingModal
        isOpen={true}
        onClose={vi.fn()}
        article={sampleArticle}
        shareUrl="https://lokswami.com/main/epaper?paper=epaper-123&page=3&story=art-1"
        language="hi"
      />
    );

    const copyBtn = screen.getByRole('button', { name: /Copy Link/i });
    await user.click(copyBtn);

    expect(writeTextSpy).toHaveBeenCalledWith('https://lokswami.com/main/epaper?paper=epaper-123&page=3&story=art-1');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('opens WhatsApp share URL on click', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <ArticleClippingModal
        isOpen={true}
        onClose={vi.fn()}
        article={sampleArticle}
        shareUrl="https://lokswami.com/main/epaper?paper=epaper-123&page=3&story=art-1"
        shareText="मेट्रो समाचार"
        language="hi"
      />
    );

    const whatsappBtn = screen.getByRole('button', { name: 'WhatsApp' });
    await user.click(whatsappBtn);

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/?text='),
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });
});
