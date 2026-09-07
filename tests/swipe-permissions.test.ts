import { describe, expect, it } from 'vitest';
import {
  canCreateContent,
  canEditContent,
  canTransitionContent,
} from '@/lib/auth/permissions';

describe('Swipe newsroom permissions', () => {
  const record = {
    workflowStatus: 'assigned' as const,
    createdById: 'reporter-1',
    assignedToId: 'copy-1',
    legacyAuthorName: 'Reporter',
  };
  const reporter = { id: 'reporter-1', email: 'r@example.com', name: 'Reporter', role: 'reporter' as const };
  const copyEditor = { id: 'copy-1', email: 'c@example.com', name: 'Copy', role: 'copy_editor' as const };
  const admin = { id: 'admin-1', email: 'a@example.com', name: 'Admin', role: 'admin' as const };

  it('keeps creation and publication authority aligned with existing newsroom roles', () => {
    expect(canCreateContent(reporter.role, 'video')).toBe(false);
    expect(canCreateContent(copyEditor.role, 'video')).toBe(false);
    expect(canCreateContent(admin.role, 'video')).toBe(true);
    expect(canEditContent(copyEditor, record)).toBe(true);
    expect(canTransitionContent(copyEditor, record, 'mark_ready_for_approval')).toBe(true);
    expect(canTransitionContent(copyEditor, record, 'approve')).toBe(false);
    expect(canTransitionContent(copyEditor, record, 'publish')).toBe(false);
    expect(canTransitionContent(admin, record, 'publish')).toBe(true);
  });
});
