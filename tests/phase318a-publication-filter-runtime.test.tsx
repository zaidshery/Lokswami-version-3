import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaperPageClient, { type PublicEPaperListItem } from '@/app/(reader)/main/epaper/EPaperPageClient';
import { useAppStore } from '@/lib/store/appStore';

const initialStore = useAppStore.getState();

function paper(id: string, title: string, publicationType: 'epaper' | 'emagazine'): PublicEPaperListItem {
  return {
    _id: id,
    publicationType,
    citySlug: publicationType === 'epaper' ? 'indore' : 'all',
    cityName: publicationType === 'epaper' ? 'Indore' : 'Monthly',
    title,
    publishDate: publicationType === 'epaper' ? '2026-10-09' : '2026-10',
    thumbnailPath: '',
    pdfPath: '',
    status: 'published',
    pageCount: 1,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useAppStore.setState(initialStore);
  window.history.replaceState({}, '', '/');
});

describe('Phase 3.18A publication archive first-load and filter behavior', () => {
  it('uses the E-Paper server list first, then fetches and renders a changed city', async () => {
    window.history.replaceState({}, '', '/main/epaper');
    useAppStore.setState({ language: 'en' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [paper('filtered-paper', 'Filtered Indore Paper', 'epaper')], hasMore: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<EPaperPageClient
      initialItems={[paper('initial-paper', 'Server E-Paper', 'epaper')]}
      initialLimit={12}
      initialHasMore={false}
      initialNextCursor={null}
      initialCity="all"
      initialPublishDate=""
      publicationType="epaper"
    />);

    expect(screen.getByText('Server E-Paper')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /All editions/i }));
    fireEvent.click(screen.getByRole('option', { name: /Indore Edition/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain('publicationType=epaper');
    expect(fetchMock.mock.calls[0][0]).toContain('citySlug=indore');
    expect(await screen.findByText('Filtered Indore Paper')).toBeInTheDocument();
    expect(screen.queryByText('Server E-Paper')).not.toBeInTheDocument();
  });

  it('uses the E-Magazine server list first, then fetches and renders a changed month', async () => {
    window.history.replaceState({}, '', '/main/e-magazine');
    useAppStore.setState({ language: 'en' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [paper('filtered-magazine', 'Filtered October Magazine', 'emagazine')], hasMore: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<EPaperPageClient
      initialItems={[paper('initial-magazine', 'Server E-Magazine', 'emagazine')]}
      initialLimit={12}
      initialHasMore={false}
      initialNextCursor={null}
      initialCity="all"
      initialPublishDate=""
      publicationType="emagazine"
      publicBasePath="/main/e-magazine"
    />);

    expect(screen.getByText('Server E-Magazine')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Choose issue month'), { target: { value: '2026-10' } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain('publicationType=emagazine');
    expect(fetchMock.mock.calls[0][0]).toContain('month=2026-10');
    expect(await screen.findByText('Filtered October Magazine')).toBeInTheDocument();
    expect(screen.queryByText('Server E-Magazine')).not.toBeInTheDocument();
  });
});
