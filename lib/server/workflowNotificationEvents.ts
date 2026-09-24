import 'server-only';

import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { WorkflowContentType, WorkflowMeta } from '@/lib/workflow/types';
import { createWorkflowNotification, type WorkflowNotificationEvent } from '@/lib/storage/workflowNotifications';

type Recipient = { id: string; email: string };

const EVENT_COPY: Partial<Record<string, { event: WorkflowNotificationEvent; en: string; hi: string }>> = {
  assign: { event: 'assigned', en: 'This item was assigned to you.', hi: '\u092f\u0939 \u0906\u0907\u091f\u092e \u0906\u092a\u0915\u094b \u0905\u0938\u093e\u0907\u0928 \u0915\u093f\u092f\u093e \u0917\u092f\u093e \u0939\u0948\u0964' },
  start_review: { event: 'review_started', en: 'Editorial review has started for this item.', hi: 'इस आइटम के लिए संपादकीय समीक्षा शुरू हो गई है।' },
  request_changes: { event: 'changes_requested', en: 'The desk requested changes before this item can continue.', hi: '\u0921\u0947\u0938\u094d\u0915 \u0928\u0947 \u0906\u0917\u0947 \u092c\u0922\u093c\u0928\u0947 \u0938\u0947 \u092a\u0939\u0932\u0947 \u092c\u0926\u0932\u093e\u0935 \u092e\u093e\u0902\u0917\u0947 \u0939\u0948\u0902\u0964' },
  mark_ready_for_approval: { event: 'ready_for_approval', en: 'This item is ready for admin approval.', hi: '\u092f\u0939 \u0906\u0907\u091f\u092e \u090f\u0921\u092e\u093f\u0928 \u0905\u092a\u094d\u0930\u0942\u0935\u0932 \u0915\u0947 \u0932\u093f\u090f \u0924\u0948\u092f\u093e\u0930 \u0939\u0948\u0964' },
  approve: { event: 'approved', en: 'This item was approved and can move to release.', hi: '\u092f\u0939 \u0906\u0907\u091f\u092e \u0905\u092a\u094d\u0930\u0942\u0935 \u0939\u094b \u0917\u092f\u093e \u0939\u0948 \u0914\u0930 \u0930\u093f\u0932\u0940\u091c\u093c \u0915\u0947 \u0932\u093f\u090f \u0924\u0948\u092f\u093e\u0930 \u0939\u0948\u0964' },
  reject: { event: 'rejected', en: 'This item was rejected by the desk.', hi: '\u092f\u0939 \u0906\u0907\u091f\u092e \u0921\u0947\u0938\u094d\u0915 \u0926\u094d\u0935\u093e\u0930\u093e \u0905\u0938\u094d\u0935\u0940\u0915\u0943\u0924 \u0915\u0930 \u0926\u093f\u092f\u093e \u0917\u092f\u093e \u0939\u0948\u0964' },
  schedule: { event: 'scheduled', en: 'This item was scheduled for publication.', hi: '\u092f\u0939 \u0906\u0907\u091f\u092e \u092a\u094d\u0930\u0915\u093e\u0936\u0928 \u0915\u0947 \u0932\u093f\u090f \u0928\u093f\u0930\u094d\u0927\u093e\u0930\u093f\u0924 \u0915\u093f\u092f\u093e \u0917\u092f\u093e \u0939\u0948\u0964' },
  publish: { event: 'published', en: 'This item was published.', hi: '\u092f\u0939 \u0906\u0907\u091f\u092e \u092a\u094d\u0930\u0915\u093e\u0936\u093f\u0924 \u0939\u094b \u0917\u092f\u093e \u0939\u0948\u0964' },
  fast_publish: { event: 'fast_published', en: 'This item was urgently published with an audited exception.', hi: '\u092f\u0939 \u0906\u0907\u091f\u092e \u0911\u0921\u093f\u091f \u0915\u093f\u090f \u0917\u090f \u0905\u092a\u0935\u093e\u0926 \u0915\u0947 \u0938\u093e\u0925 \u0924\u0924\u094d\u0915\u093e\u0932 \u092a\u094d\u0930\u0915\u093e\u0936\u093f\u0924 \u0939\u0941\u0906\u0964' },
};

async function adminRecipients(): Promise<Recipient[]> {
  if (process.env.MONGODB_URI?.trim()) {
    try {
      await connectDB();
      const users = await User.find({ role: { $in: ['admin', 'super_admin'] }, isActive: { $ne: false } })
        .select('_id email')
        .lean();
      return users.map((user) => ({ id: String(user._id || ''), email: String(user.email || '').trim().toLowerCase() })).filter((user) => user.email);
    } catch (error) {
      console.error('Workflow notification Mongo admin query failed, attempting file fallback.', error);
    }
  }

  try {
    const { readUsersFile } = await import('@/lib/storage/usersFile');
    const stored = await readUsersFile();
    return stored
      .filter((user) => (user.role === 'admin' || user.role === 'super_admin') && user.isActive !== false && Boolean(user.email))
      .map((user) => ({ id: String(user._id || ''), email: user.email.trim().toLowerCase() }))
      .filter((user) => user.email);
  } catch {
    return [];
  }
}

function actorRecipient(actor: WorkflowMeta['createdBy'] | null | undefined): Recipient | null {
  if (!actor?.email) return null;
  return { id: actor.id, email: actor.email.trim().toLowerCase() };
}

export async function notifyWorkflowEvent(input: {
  contentType: Exclude<WorkflowContentType, 'epaperArticle'>;
  contentId: string;
  title: string;
  href: string;
  action: string;
  workflow: WorkflowMeta;
  actor: Pick<AdminSessionIdentity, 'email'>;
  previousAssignee?: WorkflowMeta['assignedTo'] | null;
  /** Appended to rejection / request-changes messages. */
  rejectionReason?: string;
  /** ISO string or Date; overrides workflow.scheduledFor in the schedule notification. */
  scheduledFor?: string | Date;
  /** Appended to fast-publish notification message. */
  comment?: string;
}) {
  const copy = EVENT_COPY[input.action];
  if (!copy) return [];

  let primaryRecipients: Recipient[] = [];
  const secondaryNotifications: Array<{ recipient: Recipient; eventType: WorkflowNotificationEvent; en: string; hi: string }> = [];

  if (input.action === 'assign') {
    const assignee = actorRecipient(input.workflow.assignedTo);
    if (assignee) primaryRecipients = [assignee];

    // Detect displaced previous assignee for reassignment notification
    const previous = actorRecipient(input.previousAssignee);
    if (previous && previous.email && previous.email !== assignee?.email) {
      secondaryNotifications.push({
        recipient: previous,
        eventType: 'reassigned',
        en: 'This item has been reassigned to another team member.',
        hi: '\u092f\u0939 \u0906\u0907\u091f\u092e \u0915\u093f\u0938\u0940 \u0905\u0928\u094d\u092f \u091f\u0940\u092e \u0938\u0926\u0938\u094d\u092f \u0915\u094b \u092a\u0941\u0928\u0903 \u0905\u0938\u093e\u0907\u0928 \u0915\u0930 \u0926\u093f\u092f\u093e \u0917\u092f\u093e \u0939\u0948\u0964',
      });
    }
  } else if (input.action === 'start_review') {
    const creator = actorRecipient(input.workflow.createdBy);
    if (creator) primaryRecipients = [creator];
  } else if (input.action === 'request_changes') {
    const creator = actorRecipient(input.workflow.createdBy);
    const assignee = actorRecipient(input.workflow.assignedTo);
    primaryRecipients = [creator, assignee].filter((r): r is Recipient => Boolean(r));
  } else if (input.action === 'mark_ready_for_approval') {
    primaryRecipients = await adminRecipients();
  } else {
    primaryRecipients = [actorRecipient(input.workflow.createdBy), actorRecipient(input.workflow.assignedTo)].filter((recipient): recipient is Recipient => Boolean(recipient));
  }

  let messageEn = copy.en;
  let messageHi = copy.hi;
  const safeRejectionReason = (input.rejectionReason ?? input.workflow.rejectionReason)?.trim();
  const fastPublishComment = input.comment?.trim();

  if (input.action === 'reject' && safeRejectionReason) {
    messageEn = `This item was rejected: ${safeRejectionReason}`;
    messageHi = `\u092f\u0939 \u0906\u0907\u091f\u092e \u0905\u0938\u094d\u0935\u0940\u0915\u0943\u0924 \u0915\u093f\u092f\u093e \u0917\u092f\u093e: ${safeRejectionReason}`;
  } else if (input.action === 'request_changes' && safeRejectionReason) {
    messageEn = `The desk requested changes: ${safeRejectionReason}`;
    messageHi = `\u0921\u0947\u0938\u094d\u0915 \u0928\u0947 \u092c\u0926\u0932\u093e\u0935 \u092e\u093e\u0902\u0917\u0947 \u0939\u0948\u0902: ${safeRejectionReason}`;
  } else if (input.action === 'fast_publish' && fastPublishComment) {
    messageEn = `This item was urgently published: ${fastPublishComment}`;
    messageHi = `\u092f\u0939 \u0906\u0907\u091f\u092e \u0924\u0924\u094d\u0915\u093e\u0932 \u092a\u094d\u0930\u0915\u093e\u0936\u092f\u093f\u0924 \u0939\u0941\u0906: ${fastPublishComment}`;
  } else if (input.action === 'schedule') {
    const sched = input.scheduledFor ?? input.workflow.scheduledFor;
    if (sched) {
      const timeFormatted = new Date(sched).toISOString().slice(0, 16).replace('T', ' ');
      messageEn = `This item was scheduled for publication (${timeFormatted} UTC).`;
      messageHi = `\u092f\u0939 \u0906\u0907\u091f\u092e \u092a\u094d\u0930\u0915\u093e\u0936\u0928 \u0915\u0947 \u0932\u093f\u090f \u0928\u093f\u0930\u094d\u0927\u093e\u0930\u093f\u0924 \u0915\u093f\u092f\u093e \u0917\u092f\u093e (${timeFormatted} UTC)\u0964`;
    }
  }

  const actorEmail = input.actor.email.trim().toLowerCase();
  const uniquePrimary = Array.from(new Map(primaryRecipients.filter((recipient) => recipient.email && recipient.email !== actorEmail).map((recipient) => [recipient.email, recipient])).values());
  const eventMarker = input.workflow.comments.at(-1)?.id || input.workflow.publishedAt?.toISOString() || input.workflow.approvedAt?.toISOString() || input.workflow.scheduledFor?.toISOString() || input.workflow.dueAt?.toISOString() || new Date().toISOString();

  const primaryPromises = uniquePrimary.map((recipient) => createWorkflowNotification({
    recipientId: recipient.id,
    recipientEmail: recipient.email,
    eventType: copy.event,
    contentType: input.contentType,
    contentId: input.contentId,
    publicationType: null,
    title: input.title,
    message: messageEn,
    messageHi: messageHi,
    href: input.href,
    dedupeKey: `${input.contentType}:${input.contentId}:${input.action}:${recipient.email}:${eventMarker}`,
  }));

  const secondaryPromises = secondaryNotifications
    .filter((sec) => sec.recipient.email && sec.recipient.email !== actorEmail && !uniquePrimary.some((p) => p.email === sec.recipient.email))
    .map((sec) => createWorkflowNotification({
      recipientId: sec.recipient.id,
      recipientEmail: sec.recipient.email,
      eventType: sec.eventType,
      contentType: input.contentType,
      contentId: input.contentId,
      publicationType: null,
      title: input.title,
      message: sec.en,
      messageHi: sec.hi,
      href: input.href,
      dedupeKey: `${input.contentType}:${input.contentId}:${sec.eventType}:${sec.recipient.email}:${eventMarker}`,
    }));

  return Promise.all([...primaryPromises, ...secondaryPromises]);
}
