import { NextRequest, NextResponse } from 'next/server';
import type { Document } from 'mongoose';
import { Types } from 'mongoose';
import { getAdminSession } from '@/lib/auth/admin';
import { canManagePolls } from '@/lib/auth/permissions';
import connectDB from '@/lib/db/mongoose';
import Poll from '@/lib/models/Poll';
import { parseAdminPollPayload, toPollDTO } from '@/lib/server/poll';

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

function optionsChanged(current: PollDocument, nextQuestion: string, nextOptions: string[]) {
  if (current.question !== nextQuestion) {
    return true;
  }

  if (current.options.length !== nextOptions.length) {
    return true;
  }

  return current.options.some((option, index) => option.text !== nextOptions[index]);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!canManagePolls(admin.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid poll ID' },
        { status: 400 }
      );
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
    let updatedPoll: PollDocument | null = null;

    try {
      await txSession.withTransaction(async () => {
        const poll = await Poll.findById(id).session(txSession);
        if (!poll) {
          throw new Error('NOT_FOUND');
        }

        if (poll.totalVotes > 0 && optionsChanged(poll as PollDocument, parsed.data!.question, parsed.data!.options)) {
          throw new Error('LOCKED_STRUCTURE');
        }

        if (parsed.data?.status === 'active') {
          await Poll.updateMany(
            { _id: { $ne: poll._id }, status: 'active' },
            { $set: { status: 'inactive' } },
            { session: txSession }
          );
        }

        poll.question = parsed.data!.question;
        poll.status = parsed.data!.status;
        poll.expiresAt = parsed.data!.expiresAt ? new Date(parsed.data!.expiresAt) : null;
        poll.linkedArticleId = parsed.data!.linkedArticleId
          ? new Types.ObjectId(parsed.data!.linkedArticleId)
          : null;

        if (poll.totalVotes === 0) {
          poll.options = parsed.data!.options.map((option) => ({ text: option, votes: 0 }));
          poll.totalVotes = 0;
        }

        await poll.save({ session: txSession });
        updatedPoll = poll as PollDocument;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: 'Poll not found' },
          { status: 404 }
        );
      }

      if (error instanceof Error && error.message === 'LOCKED_STRUCTURE') {
        return NextResponse.json(
          {
            success: false,
            error: 'Question and options cannot be changed after voting has started.',
          },
          { status: 400 }
        );
      }

      throw error;
    } finally {
      await txSession.endSession();
    }

    if (!updatedPoll) {
      return NextResponse.json(
        { success: false, error: 'Failed to update poll' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: toPollDTO(updatedPoll),
    });
  } catch (error) {
    console.error('Admin polls PATCH failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update poll' },
      { status: 500 }
    );
  }
}
