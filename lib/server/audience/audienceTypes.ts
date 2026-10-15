export type AudienceCaptureOutcome = {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type MarketingLeadInput = {
  email: string;
  name: string;
  interests: string[];
  source: string;
  campaign: string;
  wantsDailyAlerts: boolean;
  consent: boolean;
};

export type AdvertiseInquiryInput = {
  name: string;
  company: string;
  email: string;
  phone: string;
  budget: string;
  campaignType: string;
  targetLocations: string;
  message: string;
  source: string;
  ipAddress: string;
  userAgent: string;
};

export type CareerApplicationInput = {
  name: string;
  email: string;
  phone: string;
  role: string;
  experience: string;
  portfolioUrl: string;
  message: string;
  source: string;
  ipAddress: string;
  userAgent: string;
};

export type AudienceRequestMetadata = {
  ipAddress: string;
  userAgent: string;
};

export type SubscriptionResult = 'created' | 'existing';

export type ContactWorkflowStatus = 'new' | 'in_progress' | 'resolved';

export type ContactMessageNote = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
};

export type ContactMessageRecord = {
  _id: string;
  ticketId: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  source: string;
  ipAddress: string;
  userAgent: string;
  status: ContactWorkflowStatus;
  assignee: string;
  notes: ContactMessageNote[];
  createdAt: string;
  updatedAt: string;
};

export type ContactListOptions = {
  page: number;
  limit: number;
  status: ContactWorkflowStatus | 'all';
  query: string;
};

export type ContactListResult = {
  data: ContactMessageRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  counts: {
    all: number;
    new: number;
    in_progress: number;
    resolved: number;
  };
};

export type ContactSubmissionInput = {
  ticketId: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  source: string;
  ipAddress: string;
  userAgent: string;
};

export type ContactWorkflowUpdate = {
  status?: ContactWorkflowStatus;
  assignee?: string;
  note: string;
  noteAuthor: string;
};
