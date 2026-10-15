import { withAdminMutation } from '@/lib/api/adminRoute';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { getAllWorkflowDeskItems } from '@/lib/admin/articleWorkflowOverview';
import { createWorkflowNotification } from '@/lib/storage/workflowNotifications';

function hasCronSecret(request: NextRequest) {
  const expected = process.env.ADMIN_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const provided = request.headers.get('x-cron-secret')?.trim() || '';
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function utcDay(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

async function POSTHandler(request: NextRequest) {
  const configured = process.env.ADMIN_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!configured) {
    return NextResponse.json({ success: false, error: 'Cron secret is not configured.' }, { status: 503 });
  }
  if (!hasCronSecret(request)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const now = Date.now();
  const items = (await getAllWorkflowDeskItems()).filter((item) => {
    const due = item.dueAt ? new Date(item.dueAt).getTime() : Number.NaN;
    return Number.isFinite(due) && due < now && !['published', 'archived'].includes(item.status) && Boolean(item.assignedToEmail);
  });

  let activeEmails: Set<string> | null = null;
  if (process.env.MONGODB_URI?.trim()) {
    try {
      await connectDB();
      const users = await User.find({ isActive: { $ne: false }, email: { $in: items.map((item) => item.assignedToEmail) } }).select('email').lean();
      activeEmails = new Set(users.map((user) => String(user.email || '').trim().toLowerCase()).filter(Boolean));
    } catch (error) {
      console.error('Overdue notification recipient lookup failed.', error);
      return NextResponse.json({ success: false, error: 'Unable to validate active recipients.' }, { status: 503 });
    }
  }

  let created = 0;
  let skippedInactive = 0;
  for (const item of items) {
    const email = item.assignedToEmail.trim().toLowerCase();
    if (activeEmails && !activeEmails.has(email)) {
      skippedInactive += 1;
      continue;
    }
    const notification = await createWorkflowNotification({
      recipientId: item.assignedToId,
      recipientEmail: email,
      eventType: 'overdue',
      contentType: item.contentType,
      contentId: item.id,
      publicationType: item.publicationType,
      title: item.title,
      message: 'This assigned item is overdue. Review its owner, blockers, and next action.',
      messageHi: '\u092f\u0939 \u0905\u0938\u093e\u0907\u0928 \u0915\u093f\u092f\u093e \u0917\u092f\u093e \u0906\u0907\u091f\u092e \u0926\u0947\u0930\u0940 \u092e\u0947\u0902 \u0939\u0948\u0964 \u0907\u0938\u0915\u0947 \u0913\u0928\u0930, \u092c\u094d\u0932\u0949\u0915\u0930 \u0914\u0930 \u0905\u0917\u0932\u0947 \u0915\u0926\u092e \u0915\u0940 \u091c\u093e\u0902\u091a \u0915\u0930\u0947\u0902\u0964',
      href: item.editHref,
      dedupeKey: `${item.contentType}:${item.id}:overdue:${utcDay()}:${email}`,
    });
    if (notification) created += 1;
  }

  return NextResponse.json({ success: true, data: { candidates: items.length, created, skippedInactive, dedupeWindow: utcDay() } });
}

export const POST = withAdminMutation(POSTHandler, { machineRequest: hasCronSecret });
