import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArticleReaderHeader from '@/components/article/ArticleReaderHeader';

const article = {
  title: 'इंदौर में जल आपूर्ति योजना पर विस्तृत रिपोर्ट और नागरिकों के लिए महत्वपूर्ण जानकारी',
  summary: 'An actual editorial summary.', category: 'Regional',
  author: { id: 'writer', name: 'Actual Writer', avatar: '', programName: 'City desk' },
  publishedAt: '2026-09-10T08:00:00.000Z', updatedAt: '2026-09-10T09:00:00.000Z',
};
afterEach(cleanup);
describe('article reader header', () => {
  it.each(['hi', 'en'] as const)('preserves headline, category, byline and time semantics in %s', language => {
    const click = vi.fn();
    const { container } = render(<ArticleReaderHeader article={article} language={language} readMinutes={3} onAuthorClick={click}><button>Share</button></ArticleReaderHeader>);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(article.title);
    expect(screen.getByRole('link', { name: language === 'hi' ? 'क्षेत्रीय' : 'Regional' })).toHaveAttribute('href', '/main/category/regional');
    expect(screen.getByText('Actual Writer')).toBeInTheDocument();
    expect(screen.getByText('City desk')).toBeInTheDocument();
    const authorRow = screen.getByRole('button', { name: /Actual Writer/ }).parentElement?.parentElement?.parentElement;
    expect(screen.getByRole('button', { name: 'Share' }).parentElement?.parentElement).toBe(authorRow);
    expect(container.querySelectorAll('time')).toHaveLength(2);
    expect(container.querySelector('time')).toHaveAttribute('datetime', article.publishedAt);
    expect(container.textContent).toContain(language === 'hi' ? 'प्रकाशित:' : 'Published:');
    expect(container.textContent).toContain(language === 'hi' ? 'अपडेट:' : 'Updated:');
    expect(container.textContent).toContain(language === 'hi' ? '3 मिनट में पढ़ें' : '3 min read');
    fireEvent.click(screen.getByRole('button', { name: /Actual Writer/ }));
    expect(click).toHaveBeenCalledOnce();
  });

  it.each([undefined, article.publishedAt, 'invalid', '2026-09-09T08:00:00Z'])('omits unavailable or non-meaningful update %s', updatedAt => {
    const { container } = render(<ArticleReaderHeader article={{ ...article, updatedAt }} language="en" readMinutes={1} onAuthorClick={() => {}}>{null}</ArticleReaderHeader>);
    expect(container.querySelectorAll('time')).toHaveLength(1);
    expect(screen.queryByText(/Updated:/)).not.toBeInTheDocument();
  });

  it('omits absent byline/summary and invalid dates without inventing author or taxonomy', () => {
    const { container } = render(<ArticleReaderHeader article={{ ...article, summary: '', author: { id: '', name: '', avatar: '' }, category: 'Custom desk', publishedAt: '', updatedAt: '' }} language="en" readMinutes={1} onAuthorClick={() => {}}>{null}</ArticleReaderHeader>);
    expect(container.querySelector('time')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Custom desk')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Editor|Digital News Desk|Actual Writer/);
  });
});
