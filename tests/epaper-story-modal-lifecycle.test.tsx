import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ArticleStoryModal from '@/components/epaper/reader/modals/ArticleStoryModal';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

const article: EPaperArticleRecord = {
  _id: 'story-1', epaperId: 'paper-1', pageNumber: 1, title: 'First story',
  slug: 'first-story', excerpt: 'First story text', hotspot: { x: 0, y: 0, w: 10, h: 10 },
};

describe('E-paper story modal lifecycle', () => {
  it('can open, close and reopen without changing hook order', () => {
    const { rerender } = render(<ArticleStoryModal article={null} isOpen={false} onClose={() => {}} language="en" />);
    rerender(<ArticleStoryModal article={article} isOpen onClose={() => {}} language="en" />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Text$/ }));
    expect(screen.getByText('First story text')).toBeInTheDocument();
    rerender(<ArticleStoryModal article={article} isOpen={false} onClose={() => {}} language="en" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<ArticleStoryModal article={article} isOpen onClose={() => {}} language="en" />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('resets the reading mode when selecting a different story', () => {
    const { rerender } = render(<ArticleStoryModal article={article} isOpen onClose={() => {}} language="en" />);
    fireEvent.click(screen.getByRole('button', { name: /^Text$/ }));
    rerender(<ArticleStoryModal article={{ ...article, _id: 'story-2', title: 'Second story', excerpt: 'Second text' }} isOpen onClose={() => {}} language="en" />);
    expect(screen.queryByText('First story text')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Visual$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Text$/ })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: /^Text$/ }));
    expect(screen.getByText('Second text')).toBeInTheDocument();
  });
});
