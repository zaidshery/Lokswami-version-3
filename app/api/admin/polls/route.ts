import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import type { Document } from 'mongoose';
import { Types } from 'mongoose';
import { getAdminSession } from '@/lib/auth/admin';
import { canManagePolls } from '@/lib/auth/permissions';
import connectDB from '@/lib/db/mongoose';
import Poll from '@/lib/models/Poll';
import { parseAdminPollPayload, toPollDTO } from '@/lib/server/poll';

export const dynamic = 'force-dynamic';

type PollDocument = Document & {
  _id: Types.ObjectId;
  question: string;
  options: Array<{ text: string; votes: number }>;
  totalVotes: number;
  status: 'active' | 'inactive';
  expiresAt?: Date | null;
  linkedArticleId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function GET() {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!canManagePolls(admin.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const polls = await Poll.find().sort({ createdAt: -1, _id: -1 }).lean();

    return NextResponse.json({
      success: true,
      data: polls.map((poll) => toPollDTO(poll)),
    });
  } catch (error) {
    console.error('Admin polls GET failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load polls' },
      { status: 500 }
    );
  }
}

async function POSTHandler(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!canManagePolls(admin.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const parsed = parseAdminPollPayload(body);
    if (!parsed.data) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 }
      );
    }

    const db = await connectDB();
    const txSession = await db.startSession();
    let createdPoll: PollDocument | null = null;

    try {
      await txSession.withTransaction(async () => {
        if (parsed.data?.status === 'active') {
          await Poll.updateMany(
            { status: 'active' },
            { $set: { status: 'inactive' } },
            { session: txSession }
          );
        }

        const [created] = await Poll.create(
          [
            {
              question: parsed.data?.question,
              options: parsed.data?.options.map((option) => ({ text: option, votes: 0 })),
              totalVotes: 0,
              status: parsed.data?.status,
              expiresAt: parsed.data?.expiresAt ? new Date(parsed.data.expiresAt) : null,
              linkedArticleId: parsed.data?.linkedArticleId
                ? new Types.ObjectId(parsed.data.linkedArticleId)
                : null,
            },
          ],
          { session: txSession }
        );

        createdPoll = created as PollDocument;
      });
    } finally {
      await txSession.endSession();
    }

    if (!createdPoll) {
      return NextResponse.json(
        { success: false, error: 'Failed to create poll' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: toPollDTO(createdPoll),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Admin polls POST failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create poll' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
