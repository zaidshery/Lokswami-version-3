import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReaderError from '@/app/(reader)/main/error';
import ReaderLoading from '@/app/(reader)/main/loading';

const state = vi.hoisted(() => ({ language: 'en' as 'en' | 'hi' }));
vi.mock('@/lib/store/appStore', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href} data-client-navigation="true">{children}</a>
  ),
}));

describe('reader route boundaries', () => {
  beforeEach(() => { state.language = 'en'; });

  it('announces loading in both languages without adding a main landmark', () => {
    render(<ReaderLoading />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('Loading news');
    expect(screen.getByRole('status')).toHaveTextContent('समाचार लोड हो रहे हैं');
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it.each([
    ['en', 'Unable to load news', 'Try again', 'Go to home page'],
    ['hi', 'समाचार लोड नहीं हो सके', 'पुनः प्रयास करें', 'मुख्य पृष्ठ पर जाएँ'],
  ] as const)('provides localized recovery in %s without exposing the exception', (language, title, retry, home) => {
    state.language = language;
    const reset = vi.fn();
    const error = Object.assign(new Error('private database credentials'), { digest: 'private-digest' });
    render(<ReaderError error={error} reset={reset} />);
    expect(screen.getByRole('alert')).toHaveTextContent(title);
    expect(screen.getByRole('link', { name: home })).toHaveAttribute('href', '/main');
    expect(screen.getByRole('link', { name: home })).not.toHaveAttribute('data-client-navigation');
    fireEvent.click(screen.getByRole('button', { name: retry }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/private database|private-digest/)).not.toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });
});
