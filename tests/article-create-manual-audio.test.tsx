import { createElement, type ChangeEvent, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleCreatePageClient from '@/app/(admin)/admin/articles/new/ArticleCreatePageClient';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  uploadArticleTtsAudioDirect: vi.fn(),
  uploadBreakingTtsAudioDirect: vi.fn(),
  prepareArticleImageFile: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => createElement('a', { href, ...props }, children),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: {
      user: {
        name: 'Parvez Khan',
        email: 'parvez@example.com',
        role: 'admin',
      },
    },
  }),
}));

vi.mock('framer-motion', () => {
  const MotionDiv = ({
    children,
    ...props
  }: Record<string, unknown> & { children?: ReactNode }) => {
    const forwardedProps = { ...props };
    delete forwardedProps.initial;
    delete forwardedProps.animate;
    delete forwardedProps.transition;
    return createElement('div', forwardedProps, children);
  };

  return {
    motion: {
      div: MotionDiv,
    },
  };
});

vi.mock('@/components/admin/CmsEditorLayout', () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return {
    CmsEditorCanvas: Wrapper,
    CmsEditorColumns: Wrapper,
    CmsEditorMain: Wrapper,
    CmsEditorSidebar: Wrapper,
  };
});

vi.mock('@/components/forms/ArticleEditorStudio', () => ({
  default: ({
    content,
    onContentChange,
  }: {
    content: string;
    onContentChange: (value: string) => void;
  }) =>
    createElement('textarea', {
      'aria-label': 'Article editor content',
      value: content,
      onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
        onContentChange(event.currentTarget.value),
    }),
  ArticleEditorSidebar: () => createElement('div', { 'data-testid': 'article-editor-sidebar' }),
}));

vi.mock('@/lib/auth/clientToken', () => ({
  getAuthHeader: () => ({ Authorization: 'Bearer test-token' }),
}));

vi.mock('@/lib/utils/articleImageUpload', () => ({
  ARTICLE_IMAGE_UPLOAD_GUIDE: 'Upload a clear image.',
  getArticleImageHints: () => [],
  prepareArticleImageFile: mocks.prepareArticleImageFile,
}));

vi.mock('@/lib/utils/articleMedia', () => ({
  resolveArticleOgImageUrl: ({ image }: { image: string }) => image,
}));

vi.mock('@/lib/utils/articleTtsUploadClient', () => ({
  uploadArticleTtsAudioDirect: mocks.uploadArticleTtsAudioDirect,
}));

vi.mock('@/lib/utils/breakingTtsUploadClient', () => ({
  uploadBreakingTtsAudioDirect: mocks.uploadBreakingTtsAudioDirect,
}));

function jsonResponse(payload: unknown, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response);
}

function createFetchMock() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    void init;

    if (url === '/api/admin/categories') {
      return jsonResponse({
        success: true,
        data: [{ name: 'National' }, { name: 'City' }],
      });
    }

    if (url === '/api/articles/latest?limit=50') {
      return jsonResponse({ items: [] });
    }

    if (url === '/api/admin/upload') {
      return jsonResponse({
        success: true,
        data: { url: '/uploads/article-featured.jpg' },
      });
    }

    if (url === '/api/admin/articles/assist') {
      return jsonResponse({
        success: true,
        data: {
          suggestions: [
            {
              id: 'social-copy',
              label: 'Social post starter',
              value: 'Manual Audio Story - Short article summary',
              reason: 'Useful for social packaging.',
            },
          ],
          readiness: {
            score: 55,
            items: [
              {
                id: 'summary',
                label: 'Summary',
                status: 'todo',
                detail: 'Add a reader summary.',
                field: 'summary',
              },
            ],
          },
          patches: [
            {
              field: 'summary',
              currentValue: '',
              suggestedValue: 'Suggested desk summary for the article.',
              reason: 'Use the lead paragraphs to fill a concise reader summary.',
            },
          ],
        },
      });
    }

    if (url === '/api/admin/articles') {
      return jsonResponse({
        success: true,
        data: { _id: '665000000000000000000001' },
      }, true, 201);
    }

    if (url === '/api/admin/articles/665000000000000000000001') {
      return jsonResponse({
        success: true,
        message: 'Article moved to published.',
      });
    }

    return jsonResponse({ success: false, error: 'Unexpected request' }, false, 404);
  });
}

function renderCreatePage() {
  return render(createElement(ArticleCreatePageClient));
}

function getAudioInput(container: HTMLElement) {
  const input = container.querySelector(
    'input[accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"]'
  );
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Audio input not found');
  }
  return input;
}

function getAudioInputs(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll(
      'input[accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"]'
    )
  ).filter((input): input is HTMLInputElement => input instanceof HTMLInputElement);
}

function getBreakingAudioInput(container: HTMLElement) {
  const input = getAudioInputs(container)[1];
  if (!input) {
    throw new Error('Breaking audio input not found');
  }
  return input;
}

function getImageInput(container: HTMLElement) {
  const input = container.querySelector('input[accept="image/*"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Image input not found');
  }
  return input;
}

const READY_SUMMARY =
  'This summary gives readers the key point, location, and publication context for the desk article.';
const READY_CONTENT =
  'This article body has enough verified newsroom copy for publication readiness checks, including context, background, and the next steps readers need before the story moves through the desk.';

async function fillRequiredArticleFields(container: HTMLElement) {
  fireEvent.change(screen.getByPlaceholderText('Enter an engaging title'), {
    target: { value: 'Manual Audio Story' },
  });
  fireEvent.change(screen.getByPlaceholderText(/brief summary of the article/i), {
    target: { value: READY_SUMMARY },
  });
  fireEvent.change(screen.getByLabelText('Article editor content'), {
    target: { value: READY_CONTENT },
  });

  const image = new File(['image-bytes'], 'featured.jpg', { type: 'image/jpeg' });
  fireEvent.change(getImageInput(container), { target: { files: [image] } });

  await waitFor(() => {
    expect(screen.getByAltText('Manual Audio Story')).toBeInTheDocument();
  });
}

function uploadAudio(container: HTMLElement, file: File) {
  fireEvent.change(getAudioInput(container), { target: { files: [file] } });
}

function uploadBreakingAudio(container: HTMLElement, file: File) {
  fireEvent.change(getBreakingAudioInput(container), { target: { files: [file] } });
}

function fillBreakingEditorialControl() {
  const start = new Date(Date.now() - 60_000).toISOString().slice(0, 16);
  const expiry = new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 16);
  const reasonInput = screen.getByLabelText(/breaking reason/i);
  const startInput = screen.getByLabelText(/starts at/i);
  const expiryInput = screen.getByLabelText(/expires at/i);
  fireEvent.change(reasonInput, {
    target: { value: 'Fast-moving public-interest update confirmed by the desk.' },
  });
  fireEvent.change(startInput, {
    target: { value: start },
  });
  fireEvent.change(expiryInput, {
    target: { value: expiry },
  });
  expect(reasonInput).toHaveValue('Fast-moving public-interest update confirmed by the desk.');
  expect(startInput).toHaveValue(start);
  expect(expiryInput).toHaveValue(expiry);
}

function hasArticleCreateFetchCall(fetchMock: ReturnType<typeof createFetchMock>) {
  return fetchMock.mock.calls.some(([input]) => String(input) === '/api/admin/articles');
}

describe('Article create manual listen audio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.prepareArticleImageFile.mockImplementation(async (file: File) => ({
      file,
      previewDataUrl: 'data:image/jpeg;base64,preview',
      wasResized: false,
      width: 1200,
      height: 675,
    }));
    mocks.uploadArticleTtsAudioDirect.mockResolvedValue({
      asset: {
        mediaUrl: 'https://cdn.example.com/lokswami/tts/article/665/manual/listen.mp3',
        mediaKey: 'lokswami/tts/article/665/manual/listen.mp3',
        mediaSizeBytes: 1024,
        mediaMimeType: 'audio/mpeg',
        storageProvider: 'do-spaces',
      },
    });
    mocks.uploadBreakingTtsAudioDirect.mockResolvedValue({
      asset: {
        mediaUrl: 'https://cdn.example.com/lokswami/tts/article/665/breaking/headline.mp3',
        mediaKey: 'lokswami/tts/article/665/breaking/headline.mp3',
        mediaSizeBytes: 1024,
        mediaMimeType: 'audio/mpeg',
        storageProvider: 'do-spaces',
      },
      breakingTts: {
        audioUrl: 'https://cdn.example.com/lokswami/tts/article/665/breaking/headline.mp3',
        textHash: 'hash',
        languageCode: 'hi-IN',
        voice: 'manual',
        model: 'manual',
        mimeType: 'audio/mpeg',
        generatedAt: '2026-05-23T08:00:00.000Z',
      },
      script: 'Manual Audio Story',
      version: 2,
      updatedAt: '2026-05-23T08:00:00.000Z',
    });
    vi.stubGlobal('fetch', createFetchMock());
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:article-listen-audio'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('offers browser recovery inline without a repeated native confirmation', async () => {
    const draftKey = 'lokswami:article-draft:v2:parvez@example.com:direct';
    const confirmSpy = vi.spyOn(window, 'confirm');
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({
        savedAt: '2026-07-13T08:00:00.000Z',
        editorSessionId: 'another-tab',
        formData: { title: 'Recovered newsroom draft' },
      })
    );

    await renderCreatePage();

    expect(
      await screen.findByRole('heading', { name: 'Browser recovery copy available' })
    ).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Discard old copy' }));
    expect(
      screen.queryByRole('heading', { name: 'Browser recovery copy available' })
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(draftKey)).toBeNull();
  });

  it('silently resumes a recovery copy owned by the current editor tab', async () => {
    const draftKey = 'lokswami:article-draft:v2:parvez@example.com:direct';
    const editorSessionId = 'current-editor-tab';
    window.sessionStorage.setItem(`${draftKey}:editor-session`, editorSessionId);
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({
        savedAt: '2026-07-13T08:00:00.000Z',
        editorSessionId,
        formData: { title: 'Continue without interruption' },
      })
    );

    await renderCreatePage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter an engaging title')).toHaveValue(
        'Continue without interruption'
      );
    });
    expect(
      screen.queryByRole('heading', { name: 'Browser recovery copy available' })
    ).not.toBeInTheDocument();
  });

  it('shows staged status for a valid article listen audio file', async () => {
    const { container } = await renderCreatePage();

    uploadAudio(
      container,
      new File(['audio-bytes'], 'listen.mp3', { type: 'audio/mpeg' })
    );

    expect(screen.getByText('listen.mp3')).toBeInTheDocument();
    expect(screen.getByText(/ready to attach after article creation/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Remove article listen audio')).toBeInTheDocument();
  });

  it('starts with publishing disabled while readiness blockers exist', async () => {
    await renderCreatePage();

    expect(screen.getByRole('button', { name: /publish article/i })).toBeDisabled();
    expect(screen.getByText(/Resolve blockers:/i)).toHaveTextContent('Headline');
    expect(screen.getByText(/Resolve blockers:/i)).toHaveTextContent('Featured image');
  });

  it('enables publishing after critical fields pass even with SEO warnings', async () => {
    const { container } = await renderCreatePage();
    await fillRequiredArticleFields(container);

    expect(screen.getByRole('button', { name: /publish article/i })).not.toBeDisabled();
    expect(screen.getByText('Warnings')).toBeInTheDocument();
  });

  it('shows readiness blockers on blocked form submit and does not create the article', async () => {
    const { container } = await renderCreatePage();
    fireEvent.change(screen.getByPlaceholderText('Enter an engaging title'), {
      target: { value: 'Short story' },
    });
    fireEvent.change(screen.getByPlaceholderText(/brief summary of the article/i), {
      target: { value: 'Too short' },
    });
    fireEvent.change(screen.getByLabelText('Article editor content'), {
      target: { value: 'Too short.' },
    });
    const image = new File(['image-bytes'], 'featured.jpg', { type: 'image/jpeg' });
    fireEvent.change(getImageInput(container), { target: { files: [image] } });

    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form as HTMLFormElement);

    await screen.findAllByText(/Resolve blockers:/i);
    expect(screen.getAllByText(/Resolve blockers:/i).some((node) => node.textContent?.includes('Summary'))).toBe(true);
    expect(hasArticleCreateFetchCall(fetch as ReturnType<typeof createFetchMock>)).toBe(false);
  });

  it('blocks submit while the staged audio file is invalid', async () => {
    const { container } = await renderCreatePage();
    await fillRequiredArticleFields(container);

    uploadAudio(
      container,
      new File(['not-audio'], 'listen.txt', { type: 'text/plain' })
    );

    await userEvent.click(screen.getByRole('button', { name: /publish article/i }));

    expect(screen.getAllByText('Article audio must be MP3, WAV, or M4A.').length).toBeGreaterThan(0);
    expect(hasArticleCreateFetchCall(fetch as ReturnType<typeof createFetchMock>)).toBe(false);
    expect(mocks.uploadArticleTtsAudioDirect).not.toHaveBeenCalled();
  });

  it('shows the recording script and upload control when marked as breaking news', async () => {
    const { container } = await renderCreatePage();

    await userEvent.click(screen.getByLabelText(/breaking news \/ live updates/i));

    expect(screen.getByText('Breaking News Audio')).toBeInTheDocument();
    expect(screen.getByText('Recording Script')).toBeInTheDocument();
    expect(screen.getByText('Untitled breaking headline')).toBeInTheDocument();
    expect(getBreakingAudioInput(container)).toBeInstanceOf(HTMLInputElement);
  });

  it('applies assistant suggestions only after editor approval', async () => {
    await renderCreatePage();

    await userEvent.click(screen.getByRole('button', { name: /^assist$/i }));

    await waitFor(() => {
      expect(screen.getByText('Suggested field updates')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/brief summary of the article/i)).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: /apply suggestion/i }));

    expect(screen.getByPlaceholderText(/brief summary of the article/i)).toHaveValue(
      'Suggested desk summary for the article.'
    );
  });

  it('does not send featured image data URLs to the assistant endpoint', async () => {
    const { container } = await renderCreatePage();

    await fillRequiredArticleFields(container);
    await userEvent.click(screen.getByRole('button', { name: /^assist$/i }));

    await waitFor(() => {
      expect(screen.getByText('Suggested field updates')).toBeInTheDocument();
    });

    const fetchMock = fetch as ReturnType<typeof createFetchMock>;
    const assistCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === '/api/admin/articles/assist'
    );
    const body = JSON.parse(String((assistCall?.[1] as RequestInit | undefined)?.body || '{}')) as {
      image?: string;
    };

    expect(body.image).toBe('featured-image-ready');
    expect(body.image).not.toContain('data:image');
  });

  it('can apply all visible assistant suggestions together', async () => {
    await renderCreatePage();

    await userEvent.click(screen.getByRole('button', { name: /^assist$/i }));

    await waitFor(() => {
      expect(screen.getByText('Suggested field updates')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/brief summary of the article/i)).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: /apply all safe/i }));

    expect(screen.getByPlaceholderText(/brief summary of the article/i)).toHaveValue(
      'Suggested desk summary for the article.'
    );
    expect(screen.getByText('No pending field suggestions. The current package is already well-filled.')).toBeInTheDocument();
  });

  it('does not overwrite a manually edited SEO slug when the headline changes', async () => {
    await renderCreatePage();
    const user = userEvent.setup();
    const titleInput = screen.getByPlaceholderText('Enter an engaging title');
    fireEvent.click(screen.getByText('SEO Settings'));
    const slugInput = screen.getByPlaceholderText('article-public-url-slug');

    await user.type(titleInput, 'First headline');
    expect(slugInput).toHaveValue('first-headline');

    await user.clear(slugInput);
    await user.type(slugInput, 'manual-slug');
    await user.clear(titleInput);
    await user.type(titleInput, 'Second headline');

    expect(slugInput).toHaveValue('manual-slug');
  });

  it('blocks publishing a breaking article until breaking audio is staged', async () => {
    const { container } = await renderCreatePage();
    await fillRequiredArticleFields(container);
    await userEvent.click(screen.getByLabelText(/breaking news \/ live updates/i));

    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form as HTMLFormElement);

    expect(screen.getAllByText(/Breaking audio/i).length).toBeGreaterThan(0);
    await screen.findAllByText(/Resolve blockers: Breaking audio/i);
    expect(hasArticleCreateFetchCall(fetch as ReturnType<typeof createFetchMock>)).toBe(false);
    expect(mocks.uploadBreakingTtsAudioDirect).not.toHaveBeenCalled();
  });

  it('creates a server draft, uploads breaking audio, then publishes the same article', async () => {
    const fetchMock = fetch as ReturnType<typeof createFetchMock>;
    const { container } = await renderCreatePage();
    await fillRequiredArticleFields(container);
    await userEvent.click(screen.getByLabelText(/breaking news \/ live updates/i));
    fillBreakingEditorialControl();
    const breakingAudio = new File(['breaking-audio'], 'breaking.mp3', { type: 'audio/mpeg' });
    uploadBreakingAudio(container, breakingAudio);

    expect(
      screen.getByRole('button', { name: /Breaking flag approval readiness/i })
    ).toHaveTextContent(/recorded/i);
    expect(screen.queryByText(/Resolve blockers:/i)?.textContent || null).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /publish article/i }));

    await waitFor(() => {
      expect(mocks.uploadBreakingTtsAudioDirect).toHaveBeenCalledWith({
        articleId: '665000000000000000000001',
        file: breakingAudio,
        expectedVersion: 1,
        authHeaders: { Authorization: 'Bearer test-token' },
      });
    });
    expect(fetchMock.mock.calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['/api/admin/articles/665000000000000000000001']),
      ])
    );
    const createBody = JSON.parse(
      String(
        (fetchMock.mock.calls.find(([input]) => String(input) === '/api/admin/articles')?.[1])
          ?.body || '{}'
      )
    );
    expect(createBody.intent).toBe('draft');
    expect(createBody.breakingAudioUploadPending).toBeUndefined();
    const workflowBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(
            ([input, init]) =>
              String(input) === '/api/admin/articles/665000000000000000000001' &&
              String(init?.method || '').toUpperCase() === 'PATCH'
          )?.[1]
        )?.body || '{}'
      )
    );
    expect(workflowBody.expectedVersion).toBe(2);
  });

  it('keeps the article as a draft when required breaking audio upload fails', async () => {
    mocks.push.mockClear();
    mocks.uploadBreakingTtsAudioDirect.mockRejectedValueOnce(new Error('Spaces CORS missing'));
    const { container } = await renderCreatePage();
    await fillRequiredArticleFields(container);
    await userEvent.click(screen.getByLabelText(/breaking news \/ live updates/i));
    fillBreakingEditorialControl();
    uploadBreakingAudio(
      container,
      new File(['breaking-audio'], 'breaking.wav', { type: 'audio/wav' })
    );

    await userEvent.click(screen.getByRole('button', { name: /publish article/i }));

    await waitFor(() => {
      expect(screen.getByText(/Breaking audio upload failed: Spaces CORS missing/i)).toBeInTheDocument();
    });
    expect(mocks.push).not.toHaveBeenCalled();
  }, 10000);

  it('creates the article first, then uploads staged audio against the returned article id', async () => {
    const { container } = await renderCreatePage();
    await fillRequiredArticleFields(container);
    const audio = new File(['audio-bytes'], 'listen.m4a', { type: 'audio/mp4' });
    uploadAudio(container, audio);

    await userEvent.click(screen.getByRole('button', { name: /publish article/i }));

    await waitFor(() => {
      expect(mocks.uploadArticleTtsAudioDirect).toHaveBeenCalledWith({
        articleId: '665000000000000000000001',
        file: audio,
        authHeaders: { Authorization: 'Bearer test-token' },
      });
    });
    expect(hasArticleCreateFetchCall(fetch as ReturnType<typeof createFetchMock>)).toBe(true);
  });

  it('keeps the article created when optional audio upload fails', async () => {
    mocks.uploadArticleTtsAudioDirect.mockRejectedValueOnce(new Error('Spaces CORS missing'));
    const { container } = await renderCreatePage();
    await fillRequiredArticleFields(container);
    uploadAudio(
      container,
      new File(['audio-bytes'], 'listen.wav', { type: 'audio/wav' })
    );

    await userEvent.click(screen.getByRole('button', { name: /publish article/i }));

    await waitFor(() => {
      expect(screen.getByText(/Listen audio upload failed: Spaces CORS missing/i)).toBeInTheDocument();
    });
    expect(hasArticleCreateFetchCall(fetch as ReturnType<typeof createFetchMock>)).toBe(true);
  });
});
