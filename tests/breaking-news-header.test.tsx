import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ loading: false, populated: true, toggle: vi.fn() }));
vi.mock('@/lib/store/appStore', () => ({ useAppStore: () => ({ language: 'en' }) }));
vi.mock('@/components/ui/useBreakingNewsController', () => ({
  useBreakingNewsController: () => {
    const item = { id: 'published', title: 'Published update', href: '/main/article/published' };
    return { currentIndex: 0, isLoading: state.loading, isPlaying: false,
      isPreparingAudio: false, queue: state.populated ? [item] : [], soundEnabled: false,
      toggleSound: state.toggle, ttsAvailable: true, visibleItem: state.populated ? item : null };
  },
}));
import BreakingNews from '@/components/ui/BreakingNews';
describe('persistent live header layer', () => {
  beforeEach(() => { state.loading = false; state.populated = true; });
  it('renders supplied headlines and an accessible opt-in audio control', () => {
    render(<BreakingNews />);
    expect(screen.getByRole('region', { name: 'Breaking News' })).toBeInTheDocument();
    expect(screen.getAllByText('Published update').length).toBeGreaterThan(0);
    const control = screen.getByRole('button', { name: 'Enable breaking news voice' });
    expect(control).toHaveAttribute('aria-pressed', 'false');
    expect(control).toBeEnabled();
  });
  it('excludes repeated decorative ticker links from keyboard traversal', () => {
    const { container } = render(<BreakingNews />);
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0]).not.toHaveAttribute('tabindex', '-1');
    expect(links[1]).toHaveAttribute('tabindex', '-1');
  });
  it('reserves the same live layer while loading', () => {
    state.populated = false; state.loading = true;
    render(<BreakingNews />);
    expect(screen.getByText('Loading latest updates...')).toBeInTheDocument();
    expect(screen.getByTestId('reader-live-bar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /breaking news voice/ })).toBeDisabled();
  });
});
