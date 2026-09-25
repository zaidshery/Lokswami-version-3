import { describe, expect, it } from 'vitest';
import {
  createEmptyStoryVideoProduction,
  getLinkedArticleStatusFromWorkflowStatus,
  isStoryReadyForArticleDrafting,
  isStoryReadyForArticleCreation,
  normalizeStoryVideoProduction,
} from '@/lib/content/newsroomPublishing';

describe('newsroom publishing helpers', () => {
  it('maps article workflow states to linked article summary states', () => {
    expect(getLinkedArticleStatusFromWorkflowStatus('draft')).toBe('draft');
    expect(getLinkedArticleStatusFromWorkflowStatus('submitted')).toBe('submitted');
    expect(getLinkedArticleStatusFromWorkflowStatus('approved')).toBe('submitted');
    expect(getLinkedArticleStatusFromWorkflowStatus('published')).toBe('published');
    expect(getLinkedArticleStatusFromWorkflowStatus('archived')).toBe('submitted');
  });

  it('treats approved and later source states as ready for article creation', () => {
    expect(isStoryReadyForArticleCreation('draft')).toBe(false);
    expect(isStoryReadyForArticleCreation('submitted')).toBe(false);
    expect(isStoryReadyForArticleCreation('approved')).toBe(true);
    expect(isStoryReadyForArticleCreation('scheduled')).toBe(true);
    expect(isStoryReadyForArticleCreation('published')).toBe(true);
  });

  it('allows article drafting from submitted and copy desk story stages', () => {
    expect(isStoryReadyForArticleDrafting('draft')).toBe(false);
    expect(isStoryReadyForArticleDrafting('submitted')).toBe(true);
    expect(isStoryReadyForArticleDrafting('in_review')).toBe(true);
    expect(isStoryReadyForArticleDrafting('copy_edit')).toBe(true);
    expect(isStoryReadyForArticleDrafting('ready_for_approval')).toBe(true);
    expect(isStoryReadyForArticleDrafting('published')).toBe(true);
  });

  it('normalizes video production state into a stable stored shape', () => {
    expect(normalizeStoryVideoProduction(null)).toEqual(createEmptyStoryVideoProduction());

    expect(
      normalizeStoryVideoProduction({
        status: 'qa_review',
        assignedTo: {
          id: 'editor-1',
          name: 'Desk Editor',
          email: 'desk@example.com',
          role: 'copy_editor',
        },
        editorNotes: '  Ready for final polish. ',
        masterExportUrl: ' https://cdn.example.com/master.mp4 ',
        thumbnailUrl: ' https://cdn.example.com/thumb.jpg ',
        updatedAt: '2026-04-20T12:00:00.000Z',
      })
    ).toEqual({
      status: 'qa_review',
      assignedTo: {
        id: 'editor-1',
        name: 'Desk Editor',
        email: 'desk@example.com',
        role: 'copy_editor',
      },
      editorNotes: 'Ready for final polish.',
      masterAssetId: '',
      masterExportUrl: 'https://cdn.example.com/master.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      verifiedAt: null,
      technicalMetadata: null,
      lastError: null,
      updatedAt: '2026-04-20T12:00:00.000Z',
    });
  });
});
