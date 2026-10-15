import { describe, expect, it } from 'vitest';
import {
  canTransitionWorkflow,
  getAllowedWorkflowTransitions,
  getWorkflowTransitionRequirements,
} from '@/lib/workflow/transitions';
import { applyArticleWorkflowAction } from '@/lib/workflow/article';
import { createWorkflowMeta } from '@/lib/workflow/types';

const adminActor = {
  id: 'admin-1',
  name: 'Desk',
  email: 'desk@example.com',
  role: 'admin' as const,
};

describe('newsroom workflow transitions', () => {
  it('supports the new copy-desk handoff states', () => {
    expect(getAllowedWorkflowTransitions('assigned')).toContain('assigned');
    expect(getAllowedWorkflowTransitions('submitted')).toContain('in_review');
    expect(getAllowedWorkflowTransitions('in_review')).toContain('assigned');
    expect(getAllowedWorkflowTransitions('copy_edit')).toContain('assigned');
    expect(getAllowedWorkflowTransitions('copy_edit')).toContain('changes_requested');
    expect(getAllowedWorkflowTransitions('copy_edit')).toContain('ready_for_approval');
    expect(getAllowedWorkflowTransitions('changes_requested')).toContain('submitted');
    expect(getAllowedWorkflowTransitions('ready_for_approval')).toContain('approved');
  });

  it('requires a reason when changes are requested', () => {
    expect(canTransitionWorkflow('copy_edit', 'changes_requested')).toBe(true);
    expect(getWorkflowTransitionRequirements('copy_edit', 'changes_requested')).toContain(
      'rejectionReason'
    );
  });

  it('keeps publish behind the approval path', () => {
    expect(canTransitionWorkflow('copy_edit', 'published')).toBe(false);
    expect(canTransitionWorkflow('ready_for_approval', 'published')).toBe(false);
    expect(canTransitionWorkflow('approved', 'published')).toBe(true);
  });

  it('rejects missing, invalid, and past schedule timestamps in the shared workflow engine', () => {
    const currentWorkflow = createWorkflowMeta({ status: 'approved' });

    expect(() =>
      applyArticleWorkflowAction({
        action: 'schedule',
        actor: adminActor,
        currentWorkflow,
        scheduledFor: null,
      })
    ).toThrow('scheduledFor must be a valid future date.');

    expect(() =>
      applyArticleWorkflowAction({
        action: 'schedule',
        actor: adminActor,
        currentWorkflow,
        scheduledFor: new Date('2000-01-01T00:00:00.000Z'),
      })
    ).toThrow('scheduledFor must be a valid future date.');
  });

  it('accepts a valid future schedule timestamp in the shared workflow engine', () => {
    const scheduledFor = new Date('2099-01-01T00:00:00.000Z');
    const result = applyArticleWorkflowAction({
      action: 'schedule',
      actor: adminActor,
      currentWorkflow: createWorkflowMeta({ status: 'approved' }),
      scheduledFor,
    });

    expect(result.toStatus).toBe('scheduled');
    expect(result.nextWorkflow.scheduledFor).toEqual(scheduledFor);
  });
});
