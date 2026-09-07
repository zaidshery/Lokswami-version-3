import mongoose, { type Model, type Types } from 'mongoose';
import { USER_ROLES, type UserRole } from '@/lib/auth/roles';

export type PreferredLanguage = 'hi' | 'en';

export interface IUserReadHistoryEntry {
  articleId: Types.ObjectId;
  readAt: Date;
  completionPercent: number;
}

export interface IUser extends mongoose.Document {
  name: string;
  email: string;
  image: string;
  role: UserRole;
  loginId?: string;
  whatsappNumber?: string;
  passwordHash?: string;
  passwordSetAt?: Date;
  setupTokenHash?: string;
  setupTokenExpiresAt?: Date;
  setupTokenIssuedAt?: Date;
  isActive: boolean;
  lastLoginAt?: Date;
  lastActiveAt?: Date;
  readCount: number;
  readHistory: IUserReadHistoryEntry[];
  savedArticles: Types.ObjectId[];
  preferredLanguage: PreferredLanguage;
  preferredCategories: string[];
  state?: string;
  district?: string;
  optInDailyEpaper: boolean;
  pushEnabled: boolean;
  notifPromptShown: boolean;
  notificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReadHistorySchema = new mongoose.Schema<IUserReadHistoryEntry>(
  {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: true,
    },
    readAt: { type: Date, default: Date.now },
    completionPercent: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    image: { type: String, default: '' },
    role: { type: String, enum: USER_ROLES, default: 'reader' },
    loginId: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    whatsappNumber: {
      type: String,
      trim: true,
      sparse: true,
    },
    passwordHash: { type: String, default: '' },
    passwordSetAt: { type: Date },
    setupTokenHash: { type: String, default: '' },
    setupTokenExpiresAt: { type: Date },
    setupTokenIssuedAt: { type: Date },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    lastActiveAt: { type: Date },
    readCount: { type: Number, default: 0, min: 0 },
    readHistory: {
      type: [ReadHistorySchema],
      default: [],
      set: (value: IUserReadHistoryEntry[]) =>
        Array.isArray(value) ? value.slice(-50) : [],
    },
    savedArticles: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
      default: [],
    },
    preferredLanguage: { type: String, enum: ['hi', 'en'], default: 'hi' },
    preferredCategories: {
      type: [{ type: String }],
      default: [],
    },
    state: { type: String, trim: true, default: '' },
    district: { type: String, trim: true, default: '' },
    optInDailyEpaper: { type: Boolean, default: true },
    pushEnabled: { type: Boolean, default: false },
    notifPromptShown: { type: Boolean, default: false },
    notificationsEnabled: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

function ensureUserSchemaCompatibility(schema: mongoose.Schema<IUser>) {
  const additions: Record<string, unknown> = {};

  const optionalFields: Record<string, unknown> = {
    loginId: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    whatsappNumber: {
      type: String,
      trim: true,
      sparse: true,
    },
    passwordHash: { type: String, default: '' },
    passwordSetAt: { type: Date },
    setupTokenHash: { type: String, default: '' },
    setupTokenExpiresAt: { type: Date },
    setupTokenIssuedAt: { type: Date },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    lastActiveAt: { type: Date },
    readCount: { type: Number, default: 0, min: 0 },
    readHistory: {
      type: [ReadHistorySchema],
      default: [],
      set: (value: IUserReadHistoryEntry[]) => (Array.isArray(value) ? value.slice(-50) : []),
    },
    savedArticles: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
      default: [],
    },
    preferredLanguage: { type: String, enum: ['hi', 'en'], default: 'hi' },
    preferredCategories: {
      type: [{ type: String }],
      default: [],
    },
    state: { type: String, trim: true, default: '' },
    district: { type: String, trim: true, default: '' },
    optInDailyEpaper: { type: Boolean, default: true },
    pushEnabled: { type: Boolean, default: false },
    notifPromptShown: { type: Boolean, default: false },
    notificationsEnabled: { type: Boolean, default: false },
  };

  for (const [field, definition] of Object.entries(optionalFields)) {
    if (!schema.path(field)) {
      additions[field] = definition;
    }
  }

  if (Object.keys(additions).length > 0) {
    schema.add(additions);
  }

  const indexes = schema.indexes();
  const hasLoginIdIndex = indexes.some(([fields]) =>
    Object.keys(fields).length === 1 && Object.prototype.hasOwnProperty.call(fields, 'loginId')
  );

  if (!hasLoginIdIndex) {
    schema.index({ loginId: 1 }, { unique: true, sparse: true });
  }

  const hasWhatsappIndex = indexes.some(([fields]) =>
    Object.keys(fields).length === 1 && Object.prototype.hasOwnProperty.call(fields, 'whatsappNumber')
  );

  if (!hasWhatsappIndex) {
    schema.index({ whatsappNumber: 1 }, { sparse: true });
  }
}

ensureUserSchemaCompatibility(UserSchema);

const existingUserModel = mongoose.models.User as Model<IUser> | undefined;

if (existingUserModel) {
  ensureUserSchemaCompatibility(existingUserModel.schema as mongoose.Schema<IUser>);
}

const User: Model<IUser> = existingUserModel || mongoose.model<IUser>('User', UserSchema);

export default User;
