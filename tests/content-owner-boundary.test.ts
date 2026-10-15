import { describe, expect, it } from 'vitest';
import {
  canCommentOnContent,
  canEditContent,
  canReadContent,
  canTransitionContent,
  isOwnContent,
  type PermissionContentRecord,
} from '@/lib/auth/permissions';
import { getCanDownloadStoryAssets } from '@/lib/auth/storyEditing';

const reporter = {
  id: 'reporter-1',
  name: 'Reporter One',
  email: 'reporter-one@example.com',
  role: 'reporter' as const,
};

describe('explicit content ownership boundary', () => {
  it.each([reporter.name, reporter.email, 'reporter-one', 'REPORTER_ONE'])(
    'does not grant another creator\'s draft through byline %s',
    (legacyAuthorName) => {
      const content: PermissionContentRecord = {
        workflow: { status: 'draft', createdBy: { id: 'another-creator' } },
        legacyAuthorName,
      };
      expect(isOwnContent(reporter, content)).toBe(false);
      expect(canReadContent(reporter, content)).toBe(false);
      expect(canEditContent(reporter, content)).toBe(false);
      expect(canCommentOnContent(reporter, content)).toBe(false);
      expect(canTransitionContent(reporter, content, 'submit')).toBe(false);
      expect(getCanDownloadStoryAssets(reporter, content)).toBe(false);
    }
  );

  it('enforces the same boundary for flat creator references', () => {
    const content: PermissionContentRecord = {
      workflowStatus: 'draft', createdById: 'another-creator', legacyAuthorName: reporter.name,
    };
    expect(isOwnContent(reporter, content)).toBe(false);
    expect(canReadContent(reporter, content)).toBe(false);
    expect(canEditContent(reporter, content)).toBe(false);
  });

  it('keeps the workflow creator authoritative over a conflicting flat reference', () => {
    expect(isOwnContent(reporter, {
      workflow: { status: 'draft', createdBy: { id: 'another-creator' } },
      createdById: reporter.id, legacyAuthorName: reporter.name,
    })).toBe(false);
  });

  it('preserves explicit ownership when a byline differs', () => {
    const content: PermissionContentRecord = {
      workflow: { status: 'draft', createdBy: { id: reporter.id } },
      legacyAuthorName: 'Shared Newsroom Desk',
    };
    expect(isOwnContent(reporter, content)).toBe(true);
    expect(canReadContent(reporter, content)).toBe(true);
    expect(canEditContent(reporter, content)).toBe(true);
  });

  it.each([' REPORTER-1 ', ' REPORTER-ONE@EXAMPLE.COM '])('preserves normalized creator identity %s', (id) => {
    expect(isOwnContent(reporter, {
      workflow: { status: 'draft', createdBy: { id } }, legacyAuthorName: 'Other Byline',
    })).toBe(true);
  });

  it('preserves explicit assignments without treating the assignee as owner', () => {
    const content: PermissionContentRecord = {
      workflow: { status: 'draft', createdBy: { id: 'another-creator' }, assignedTo: { id: reporter.id } },
      legacyAuthorName: 'Another Reporter',
    };
    expect(isOwnContent(reporter, content)).toBe(false);
    expect(canReadContent(reporter, content)).toBe(true);
    expect(canEditContent(reporter, content)).toBe(true);
    expect(canCommentOnContent(reporter, content)).toBe(true);
    expect(canTransitionContent(reporter, content, 'submit')).toBe(true);
  });

  it.each([undefined, '', '   '])('preserves legacy byline access without a creator ID (%s)', (id) => {
    const content: PermissionContentRecord = {
      workflow: { status: 'draft', createdBy: { id } }, createdById: id,
      legacyAuthorName: 'REPORTER_ONE',
    };
    expect(isOwnContent(reporter, content)).toBe(true);
    expect(canReadContent(reporter, content)).toBe(true);
    expect(canEditContent(reporter, content)).toBe(true);
    expect(canTransitionContent(reporter, content, 'submit')).toBe(true);
  });
});
