import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  role: 'admin' as 'super_admin' | 'admin' | 'copy_editor',
  fetch: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: mocks.role } } }),
}));

vi.mock('@/lib/auth/clientToken', () => ({
  getAuthHeader: () => ({}),
}));

import SocialPostsPage from '@/app/(admin)/admin/social-posts/page';

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: [
        {
          _id: 'social-1',
          sourceStoryId: 'story-1',
          platform: 'facebook',
          status: 'approved',
          caption: 'Approved social draft',
          hashtags: '#Lokswami',
          thumbnailUrl: '',
          videoUrl: 'https://example.com/video.mp4',
        },
      ],
      meta: {
        automation: { provider: 'n8n', enabled: true, label: 'n8n webhook automation' },
      },
    }),
  });
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Phase 3.5C social action visibility', () => {
  it('keeps ordinary social management visible to admin but hides outbound dispatch', async () => {
    mocks.role = 'admin';
    render(<SocialPostsPage />);

    expect(await screen.findByText('Approved social draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send To Automation' })).not.toBeInTheDocument();
  });

  it('offers outbound dispatch to super admin', async () => {
    mocks.role = 'super_admin';
    render(<SocialPostsPage />);

    expect(await screen.findByText('Approved social draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send To Automation' })).toBeInTheDocument();
  });

  it('preserves copy-editor read access without privileged actions', async () => {
    mocks.role = 'copy_editor';
    render(<SocialPostsPage />);

    expect(await screen.findByText('Approved social draft')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send To Automation' })).not.toBeInTheDocument();
  });
});
