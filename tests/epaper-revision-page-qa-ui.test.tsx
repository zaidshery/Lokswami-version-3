import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EpaperRevisionPageQa from '@/components/admin/EpaperRevisionPageQa';
import type { EPaperRecord } from '@/lib/types/epaper';

vi.mock('@/lib/auth/clientToken', () => ({ getAuthHeader: () => ({}) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const paper = { _id: 'revision-id', supersedesId: 'source-id', status: 'draft', version: 4,
  revisionInitializationStatus: 'ready', pages: [{ pageNumber: 1, reviewStatus: 'pending' }] } as EPaperRecord;

describe('draft revision page QA control', () => {
  it.each([
    { supersedesId: '' }, { status: 'published' }, { productionStatus: 'archived' },
  ])('hides QA on initial or immutable publications: %j', (overrides) => {
    render(<EpaperRevisionPageQa epaper={{ ...paper, ...overrides } as EPaperRecord} pageNumber={1} onReviewed={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sends the reviewed edition version and reloads after success', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal('fetch', fetch);
    const reload = vi.fn(async () => {});
    render(<EpaperRevisionPageQa epaper={paper} pageNumber={1} onReviewed={reload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark page QA complete' }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ expectedVersion: 4, pages: [{ pageNumber: 1, reviewStatus: 'ready' }] });
  });

  it('shows stale-version errors without reporting QA success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ success: false, error: 'Edition changed. Reload before reviewing.' }) })));
    const reload = vi.fn();
    render(<EpaperRevisionPageQa epaper={paper} pageNumber={1} onReviewed={reload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark page QA complete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Edition changed');
    expect(reload).not.toHaveBeenCalled();
  });

  it.each(['initializing', 'failed'])('disables QA until revision initialization is ready: %s', (state) => {
    render(<EpaperRevisionPageQa epaper={{ ...paper, revisionInitializationStatus: state } as EPaperRecord} pageNumber={1} onReviewed={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
