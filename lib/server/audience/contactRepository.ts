import connectDB from '@/lib/db/mongoose';
import ContactMessage from '@/lib/models/ContactMessage';
import {
  createStoredContactMessage,
  getStoredContactMessageById,
  listStoredContactMessages,
  updateStoredContactMessageWorkflow,
} from '@/lib/storage/contactMessagesFile';
import type {
  ContactListOptions,
  ContactListResult,
  ContactMessageRecord,
  ContactSubmissionInput,
  ContactWorkflowStatus,
  ContactWorkflowUpdate,
} from './audienceTypes';

const VALID_STATUS = new Set<ContactWorkflowStatus>(['new', 'in_progress', 'resolved']);

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeMongoMessage(input: Record<string, unknown>): ContactMessageRecord {
  const id = clean(input._id, 80);
  const ticketId = clean(input.ticketId, 40) || `LEGACY-${id.slice(-8).toUpperCase()}`;
  const notes = Array.isArray(input.notes)
    ? input.notes
        .map((note) => {
          if (!note || typeof note !== 'object') return null;
          const source = note as Record<string, unknown>;
          const body = clean(source.body, 1000);
          if (!body) return null;
          return {
            id: clean(source.id, 80) || clean(source._id, 80) || `${Date.now()}`,
            body,
            author: clean(source.author, 120) || 'Admin',
            createdAt: String(source.createdAt || new Date().toISOString()),
          };
        })
        .filter((note): note is NonNullable<typeof note> => Boolean(note))
    : [];

  return {
    _id: id,
    ticketId,
    name: clean(input.name, 120),
    email: clean(input.email, 180),
    phone: clean(input.phone, 30),
    subject: clean(input.subject, 200),
    message: clean(input.message, 5000),
    source: clean(input.source, 40),
    ipAddress: clean(input.ipAddress, 120),
    userAgent: clean(input.userAgent, 500),
    status: VALID_STATUS.has(input.status as ContactWorkflowStatus)
      ? (input.status as ContactWorkflowStatus)
      : 'new',
    assignee: clean(input.assignee, 120),
    notes,
    createdAt: String(input.createdAt || new Date().toISOString()),
    updatedAt: String(input.updatedAt || new Date().toISOString()),
  };
}

function buildMongoSearchFilter(query: string) {
  if (!query) return {};
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    $or: ['ticketId', 'name', 'email', 'subject', 'message', 'assignee'].map((field) => ({
      [field]: new RegExp(escaped, 'i'),
    })),
  };
}

export class ContactRepository {
  async create(input: ContactSubmissionInput) {
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        await ContactMessage.create(input);
        return;
      } catch (mongoError) {
        console.error('Mongo write failed, falling back to file storage:', mongoError);
      }
    }
    await createStoredContactMessage(input);
  }

  async list(options: ContactListOptions): Promise<ContactListResult> {
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        const searchFilter = buildMongoSearchFilter(options.query);
        const mongoFilter: Record<string, unknown> = { ...searchFilter };
        if (options.status !== 'all') mongoFilter.status = options.status;

        const [rows, total, all, next, inProgress, resolved] = await Promise.all([
          ContactMessage.find(mongoFilter)
            .sort({ createdAt: -1 })
            .skip((options.page - 1) * options.limit)
            .limit(options.limit)
            .lean(),
          ContactMessage.countDocuments(mongoFilter),
          ContactMessage.countDocuments(searchFilter),
          ContactMessage.countDocuments({ ...searchFilter, status: 'new' }),
          ContactMessage.countDocuments({ ...searchFilter, status: 'in_progress' }),
          ContactMessage.countDocuments({ ...searchFilter, status: 'resolved' }),
        ]);

        return {
          data: rows.map((row) => normalizeMongoMessage(row as Record<string, unknown>)),
          page: options.page,
          limit: options.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / options.limit)),
          counts: { all, new: next, in_progress: inProgress, resolved },
        };
      } catch (mongoError) {
        console.error('Mongo unavailable for contact inbox, using file store:', mongoError);
      }
    }

    return listStoredContactMessages(options) as Promise<ContactListResult>;
  }

  async getById(id: string): Promise<ContactMessageRecord | null> {
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        const row = await ContactMessage.findById(id).lean();
        if (!row) return null;
        return normalizeMongoMessage(row as Record<string, unknown>);
      } catch (mongoError) {
        console.error('Mongo unavailable for contact detail, using file store:', mongoError);
      }
    }

    return getStoredContactMessageById(id) as Promise<ContactMessageRecord | null>;
  }

  async update(id: string, input: ContactWorkflowUpdate): Promise<ContactMessageRecord | null> {
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        const row = await ContactMessage.findById(id);
        if (!row) return null;

        if (input.status) row.status = input.status;
        if (!row.ticketId) {
          row.ticketId = `LEGACY-${row._id.toString().slice(-8).toUpperCase()}`;
        }
        if (input.assignee !== undefined) row.assignee = input.assignee;
        if (input.note) {
          row.notes = [
            { body: input.note, author: input.noteAuthor, createdAt: new Date() },
            ...(Array.isArray(row.notes) ? row.notes : []),
          ];
        }
        await row.save();
        return normalizeMongoMessage(row.toObject() as Record<string, unknown>);
      } catch (mongoError) {
        console.error('Mongo unavailable for contact workflow update, using file store:', mongoError);
      }
    }

    return updateStoredContactMessageWorkflow(id, input) as Promise<ContactMessageRecord | null>;
  }
}

export const contactRepository = new ContactRepository();
