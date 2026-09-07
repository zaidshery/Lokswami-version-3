import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';

export type ContactWorkflowStatus = 'new' | 'in_progress' | 'resolved';

export interface StoredContactMessageNote {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface StoredContactMessage {
  _id: string;
  ticketId: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  source: string;
  ipAddress: string | null;
  userAgent: string | null;
  status: ContactWorkflowStatus;
  assignee: string;
  notes: StoredContactMessageNote[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactMessageInput {
  ticketId: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  source: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ListContactMessagesOptions {
  page?: number;
  limit?: number;
  status?: ContactWorkflowStatus | 'all';
  query?: string;
}

export interface ListContactMessagesResult {
  data: StoredContactMessage[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
  counts: {
    all: number;
    new: number;
    in_progress: number;
    resolved: number;
  };
}

export interface UpdateContactWorkflowInput {
  status?: ContactWorkflowStatus;
  assignee?: string;
  note?: string;
  noteAuthor?: string;
}

const VALID_STATUSES: ContactWorkflowStatus[] = ['new', 'in_progress', 'resolved'];
const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'contact-messages.json');

function clean(value: unknown, maxLength: number) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

function toIsoDate(value: unknown, fallbackIso: string) {
  const input = String(value || '').trim();
  if (!input) return fallbackIso;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return fallbackIso;
  return parsed.toISOString();
}

function isStatus(value: unknown): value is ContactWorkflowStatus {
  return VALID_STATUSES.includes(value as ContactWorkflowStatus);
}

function generateId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeNote(
  input: unknown,
  fallbackAuthor = 'Admin',
  fallbackCreatedAt = new Date().toISOString()
): StoredContactMessageNote | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;

  const body = clean(source.body, 1000);
  if (!body) return null;

  return {
    id: clean(source.id, 80) || generateId(),
    body,
    author: clean(source.author, 120) || fallbackAuthor,
    createdAt: toIsoDate(source.createdAt, fallbackCreatedAt),
  };
}

function normalizeMessage(
  input: unknown,
  fallbackCreatedAt = new Date().toISOString()
): StoredContactMessage | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;

  const name = clean(source.name, 120);
  const email = clean(source.email, 180).toLowerCase();
  const message = clean(source.message, 5000);
  if (!name || !email || !message) return null;

  const createdAt = toIsoDate(source.createdAt, fallbackCreatedAt);
  const notes = Array.isArray(source.notes)
    ? source.notes
        .map((note) => normalizeNote(note, 'Admin', createdAt))
        .filter((note): note is StoredContactMessageNote => Boolean(note))
    : [];

  return {
    _id: clean(source._id, 80) || generateId(),
    ticketId: clean(source.ticketId, 40) || `LEGACY-${generateId().slice(0, 8).toUpperCase()}`,
    name,
    email,
    phone: clean(source.phone, 30),
    subject: clean(source.subject, 200),
    message,
    source: clean(source.source, 40) || 'main-contact',
    ipAddress: clean(source.ipAddress, 120) || null,
    userAgent: clean(source.userAgent, 500) || null,
    status: isStatus(source.status) ? source.status : 'new',
    assignee: clean(source.assignee, 120),
    notes,
    createdAt,
    updatedAt: toIsoDate(source.updatedAt, createdAt),
  };
}

async function readAllMessages(): Promise<StoredContactMessage[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeMessage(item))
      .filter((item): item is StoredContactMessage => Boolean(item));
  } catch {
    return [];
  }
}

async function writeAllMessages(messages: StoredContactMessage[]) {
  await writeJsonFileAtomically(dataPath, messages);
}

export async function createStoredContactMessage(input: CreateContactMessageInput) {
  const now = new Date().toISOString();
  const all = await readAllMessages();

  const item: StoredContactMessage = {
    _id: generateId(),
    ticketId: clean(input.ticketId, 40),
    name: clean(input.name, 120),
    email: clean(input.email, 180).toLowerCase(),
    phone: clean(input.phone, 30),
    subject: clean(input.subject, 200),
    message: clean(input.message, 5000),
    source: clean(input.source, 40) || 'main-contact',
    ipAddress: clean(input.ipAddress, 120) || null,
    userAgent: clean(input.userAgent, 500) || null,
    status: 'new',
    assignee: '',
    notes: [],
    createdAt: now,
    updatedAt: now,
  };

  all.unshift(item);
  await writeAllMessages(all);
  return item;
}

export async function listStoredContactMessages(
  options: ListContactMessagesOptions = {}
): Promise<ListContactMessagesResult> {
  const page = Number.isFinite(Number(options.page))
    ? Math.max(1, Number(options.page))
    : 1;
  const limit = Number.isFinite(Number(options.limit))
    ? Math.min(100, Math.max(1, Number(options.limit)))
    : 20;
  const query = clean(options.query, 200).toLowerCase();
  const status = options.status && options.status !== 'all' ? options.status : 'all';

  const all = await readAllMessages();

  const counts = {
    all: all.length,
    new: all.filter((row) => row.status === 'new').length,
    in_progress: all.filter((row) => row.status === 'in_progress').length,
    resolved: all.filter((row) => row.status === 'resolved').length,
  };

  let filtered = all;

  if (status !== 'all') {
    filtered = filtered.filter((item) => item.status === status);
  }

  if (query) {
    filtered = filtered.filter((item) => {
      const haystack = [
        item.ticketId,
        item.name,
        item.email,
        item.subject,
        item.message,
        item.assignee,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  filtered.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);

  return {
    data,
    total,
    totalPages,
    page,
    limit,
    counts,
  };
}

export async function getStoredContactMessageById(id: string) {
  const normalizedId = clean(id, 80);
  if (!normalizedId) return null;
  const all = await readAllMessages();
  return all.find((item) => item._id === normalizedId) || null;
}

export async function updateStoredContactMessageWorkflow(
  id: string,
  input: UpdateContactWorkflowInput
) {
  const normalizedId = clean(id, 80);
  if (!normalizedId) return null;

  const all = await readAllMessages();
  const index = all.findIndex((item) => item._id === normalizedId);
  if (index < 0) return null;

  const current = all[index];
  const now = new Date().toISOString();

  const nextStatus = isStatus(input.status) ? input.status : current.status;
  const nextAssignee =
    typeof input.assignee === 'string' ? clean(input.assignee, 120) : current.assignee;

  let nextNotes = current.notes;
  const noteBody = clean(input.note, 1000);
  if (noteBody) {
    nextNotes = [
      {
        id: generateId(),
        body: noteBody,
        author: clean(input.noteAuthor, 120) || 'Admin',
        createdAt: now,
      },
      ...current.notes,
    ];
  }

  const updated: StoredContactMessage = {
    ...current,
    status: nextStatus,
    assignee: nextAssignee,
    notes: nextNotes,
    updatedAt: now,
  };

  all[index] = updated;
  await writeAllMessages(all);
  return updated;
}
