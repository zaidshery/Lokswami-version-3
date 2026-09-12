import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  Badge,
  BreakingBadge,
  SectionHeader,
  ReaderPageShell,
  EmptyState,
  ErrorState,
  Skeleton,
  MetadataRow,
} from '@/components/ui';
import Container from '@/components/layout/Container';

describe('LokSwami B3 Design System Primitives', () => {
  describe('Button primitive', () => {
    it('renders with children text and default type button', () => {
      render(<Button>पढ़ें</Button>);
      const button = screen.getByRole('button', { name: 'पढ़ें' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'button');
    });

    it('applies variant styling classes properly', () => {
      const { rerender } = render(<Button variant="primary">मुख्य</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-brand-500');

      rerender(<Button variant="secondary">सहायक</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-zinc-100');

      rerender(<Button variant="outline">आउटलाइन</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-transparent');

      rerender(<Button variant="breaking">ब्रेकिंग</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-breaking');
    });

    it('handles loading state with spinner and aria-busy', () => {
      render(<Button isLoading loadingText="लोड हो रहा है...">क्लिक करें</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toBeDisabled();
      expect(screen.getByText('लोड हो रहा है...')).toBeInTheDocument();
    });

    it('renders left and right icons', () => {
      render(
        <Button
          leftIcon={<span data-testid="left-icon">←</span>}
          rightIcon={<span data-testid="right-icon">→</span>}
        >
          नेविगेट करें
        </Button>
      );
      expect(screen.getByTestId('left-icon')).toBeInTheDocument();
      expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });
  });

  describe('Badge & BreakingBadge primitives', () => {
    it('renders Badge with various variants', () => {
      const { rerender } = render(<Badge variant="brand">मध्य प्रदेश</Badge>);
      expect(screen.getByText('मध्य प्रदेश')).toHaveClass('bg-brand-500');

      rerender(<Badge variant="breaking">लाइव</Badge>);
      expect(screen.getByText('लाइव')).toHaveClass('bg-breaking');

      rerender(<Badge variant="neutral">संपादकीय</Badge>);
      expect(screen.getByText('संपादकीय')).toHaveClass('bg-zinc-100');
    });

    it('renders BreakingBadge with role status and pulsing indicator', () => {
      render(<BreakingBadge label="ब्रेकिंग न्यूज" pulse />);
      const badge = screen.getByRole('status', { name: 'ब्रेकिंग न्यूज' });
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-breaking');
    });
  });

  describe('SectionHeader primitive', () => {
    it('renders editorial title with red accent bar and semantic heading level', () => {
      render(<SectionHeader title="ताज़ा समाचार" level="h2" />);
      const heading = screen.getByRole('heading', { level: 2, name: 'ताज़ा समाचार' });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveClass('hindi-headline');
    });

    it('renders CTA link when href and ctaText are passed', () => {
      render(
        <SectionHeader
          title="राजनीति"
          href="/main/category/politics"
          ctaText="सभी देखें"
        />
      );
      const link = screen.getByRole('link', { name: /सभी देखें/ });
      expect(link).toHaveAttribute('href', '/main/category/politics');
    });
  });

  describe('Container & ReaderPageShell primitives', () => {
    it('supports container variants: reading, article, standard, wide', () => {
      const { rerender, container } = render(<Container variant="reading">Content</Container>);
      expect(container.firstChild).toHaveClass('max-w-reading');

      rerender(<Container variant="article">Content</Container>);
      expect(container.firstChild).toHaveClass('max-w-article-container');

      rerender(<Container variant="standard">Content</Container>);
      expect(container.firstChild).toHaveClass('max-w-page-standard');

      rerender(<Container variant="wide">Content</Container>);
      expect(container.firstChild).toHaveClass('max-w-page-wide');
    });

    it('renders ReaderPageShell with header, title, and children', () => {
      render(
        <ReaderPageShell
          title="ई-पेपर संस्करण"
          eyebrow="डिजिटल न्यूज़"
          description="आज का ताज़ा अख़बार पढ़ें"
        >
          <div data-testid="page-content">पृष्ठ सामग्री</div>
        </ReaderPageShell>
      );
      expect(screen.getByRole('heading', { level: 1, name: 'ई-पेपर संस्करण' })).toBeInTheDocument();
      expect(screen.getByText('डिजिटल न्यूज़')).toBeInTheDocument();
      expect(screen.getByText('आज का ताज़ा अख़बार पढ़ें')).toBeInTheDocument();
      expect(screen.getByTestId('page-content')).toBeInTheDocument();
    });
  });

  describe('EmptyState & ErrorState primitives', () => {
    it('renders EmptyState with title, description, and action button', () => {
      render(
        <EmptyState
          title="कोई खबर नहीं मिली"
          description="कृपया अपनी खोज सुधारें।"
          action={<Button>होम जाएं</Button>}
        />
      );
      expect(screen.getByRole('heading', { level: 3, name: 'कोई खबर नहीं मिली' })).toBeInTheDocument();
      expect(screen.getByText('कृपया अपनी खोज सुधारें।')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'होम जाएं' })).toBeInTheDocument();
    });

    it('renders ErrorState with role=alert and calls onRetry on button click', () => {
      const onRetry = vi.fn();
      render(
        <ErrorState
          title="सर्वर त्रुटि"
          description="पुनः प्रयास करें"
          onRetry={onRetry}
          retryText="रीलोड"
        />
      );
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'सर्वर त्रुटि' })).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: 'रीलोड' });
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Skeleton primitive', () => {
    it('renders with aria-hidden="true" and animate-pulse', () => {
      const { container } = render(<Skeleton variant="text" width={200} height={20} />);
      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
      expect(skeleton).toHaveClass('animate-pulse');
      expect(skeleton.style.width).toBe('200px');
      expect(skeleton.style.height).toBe('20px');
    });

    it('supports circular and rounded variants', () => {
      const { container, rerender } = render(<Skeleton variant="circular" />);
      expect(container.firstChild).toHaveClass('rounded-full');

      rerender(<Skeleton variant="rounded" />);
      expect(container.firstChild).toHaveClass('rounded-editorial-md');
    });
  });

  describe('MetadataRow primitive', () => {
    it('renders category, author name, published text, and read time', () => {
      render(
        <MetadataRow
          category="व्यापार"
          authorName="राजेश शर्मा"
          publishedText="10 मिनट पहले"
          readMinutes={4}
          language="hi"
        />
      );
      expect(screen.getByText('व्यापार')).toBeInTheDocument();
      expect(screen.getByText('राजेश शर्मा')).toBeInTheDocument();
      expect(screen.getByText('10 मिनट पहले')).toBeInTheDocument();
      expect(screen.getByText('4 मिनट')).toBeInTheDocument();
    });
  });
});
