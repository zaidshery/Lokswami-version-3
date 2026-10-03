import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShareMenu from '@/components/ui/ShareMenu';

const mocks = vi.hoisted(() => ({
  trackClientEvent: vi.fn(),
}));

vi.mock('@/lib/analytics/trackClient', () => ({
  trackClientEvent: mocks.trackClientEvent,
}));

describe('ShareMenu', () => {
  const nativeShare = vi.fn();
  const writeText = vi.fn();
  const openWindow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    nativeShare.mockResolvedValue(undefined);
    writeText.mockResolvedValue(undefined);

    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: nativeShare,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal('open', openWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderMenu() {
    return render(
      <ShareMenu
        title="City services improve"
        url="/main/article/city-services"
        text="The latest public service update."
        whatsappText={'Lokswami | Regional\nCity services improve'}
        contentType="article"
        contentId="article-7"
        placement="article_detail_header"
        triggerLabel="Share"
        ariaLabel="Share article"
      />
    );
  }

  it('shares directly to WhatsApp without opening a menu when requested', () => {
    render(<ShareMenu title="City services" url="https://lokswami.com/main/article/city-services" contentType="article" contentId="article-7" triggerIcon="whatsapp" directWhatsApp ariaLabel="Share on WhatsApp" />);
    const button = screen.getByRole('button', { name: 'Share on WhatsApp' });
    expect(button).not.toHaveAttribute('aria-haspopup');
    fireEvent.click(button);
    expect(openWindow).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/'), '_blank', 'noopener,noreferrer');
    expect(openWindow).toHaveBeenCalledOnce();
    const payload = new URL(openWindow.mock.calls[0][0]).searchParams.get('text')!;
    expect(payload).toContain('https://lokswami.com/main/article/city-services');
    expect(payload.match(/https:\/\/lokswami\.com/g)).toHaveLength(1);
    expect(mocks.trackClientEvent.mock.calls.map(([payload]) => payload.event)).toEqual(['share_click']);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers native, social, and copy choices in an accessible menu', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Share article' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(await screen.findByRole('menu', { name: 'Share article' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitem')).toHaveLength(7);
    for (const name of [
      'Share with device',
      'WhatsApp',
      'Facebook',
      'X',
      'LinkedIn',
      'Telegram',
      'Copy link',
    ]) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
    }
  });

  it('opens a branded WhatsApp destination and records its click', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Share article' }));
    await user.click(await screen.findByRole('menuitem', { name: 'WhatsApp' }));

    expect(openWindow).toHaveBeenCalledTimes(1);
    const destination = String(openWindow.mock.calls[0][0]);
    expect(destination).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(new URL(destination).searchParams.get('text')).toContain('Lokswami | Regional');
    expect(decodeURIComponent(destination)).toContain('/main/article/city-services');
    expect(openWindow).toHaveBeenCalledWith(
      destination,
      '_blank',
      'noopener,noreferrer'
    );
    expect(mocks.trackClientEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: 'share_click',
        source: 'share_menu',
        metadata: expect.objectContaining({
          platform: 'whatsapp',
          contentType: 'article',
          contentId: 'article-7',
          placement: 'article_detail_header',
        }),
      })
    );

  });

  it.each([
    ['Facebook', 'https://www.facebook.com/sharer/sharer.php?u='],
    ['X', 'https://x.com/intent/tweet?'],
    ['Telegram', 'https://t.me/share/url?'],
    ['LinkedIn', 'https://www.linkedin.com/sharing/share-offsite/?url='],
  ])('opens the %s share destination', async (platform, expectedPrefix) => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Share article' }));
    await user.click(await screen.findByRole('menuitem', { name: platform }));

    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(String(openWindow.mock.calls[0][0])).toMatch(
      new RegExp(`^${expectedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    );
  });

  it('uses native sharing when available and copies the canonical link on request', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Share article' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Share with device' }));

    await waitFor(() => {
      expect(nativeShare).toHaveBeenCalledWith({
        title: 'City services improve',
        text: 'The latest public service update.',
        url: expect.stringContaining('/main/article/city-services'),
      });
    });

    await user.click(screen.getByRole('button', { name: 'Share article' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Copy link' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/main/article/city-services'));
      expect(screen.getByRole('menuitem', { name: 'Link copied' })).toBeInTheDocument();
    });
    expect(mocks.trackClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'share_complete',
        metadata: expect.objectContaining({ platform: 'copy' }),
      })
    );
  });

  it.each(['AbortError', 'NotAllowedError'])('keeps fallbacks after native %s', async name => {
    nativeShare.mockRejectedValue({ name });
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Share article' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Share with device' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Choose a sharing option below.');
    expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeInTheDocument();
    expect(mocks.trackClientEvent).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'share_complete' }));
  });

  it('offers social/copy when native sharing is unavailable', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Share article' }));
    expect(await screen.findByRole('menuitem', { name: 'Telegram' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Share with device' })).toBeNull();
  });

  it('reports actual copy failure and retains retry controls', async () => {
    writeText.mockRejectedValue(new Error('Denied'));
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Share article' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    expect(await screen.findByRole('menuitem', { name: 'Could not copy link' })).toBeInTheDocument();
    expect(screen.queryByText('Link copied')).toBeNull();
    expect(mocks.trackClientEvent).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'share_complete' }));
  });

  it('disables unsafe share sources', () => {
    render(<ShareMenu title="Internal" url="https://cms.example.com/admin" contentType="article" ariaLabel="Share unsafe" />);
    expect(screen.getByRole('button', { name: 'Share unsafe' })).toBeDisabled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('does not claim completed sharing when a popup is blocked', async () => {
    openWindow.mockReturnValue(null);
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Share article' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Telegram' }));
    expect(screen.getByRole('status')).toHaveTextContent('If no window opens, use Copy link.');
    expect(mocks.trackClientEvent).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'share_complete' }));
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Share article' });

    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
