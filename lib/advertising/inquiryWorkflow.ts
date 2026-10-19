export const ADVERTISING_OWNER = 'Zaid';
export const ADVERTISING_STATUSES = ['new', 'in_progress', 'qualified', 'closed'] as const;
export type AdvertisingStatus = typeof ADVERTISING_STATUSES[number];
export type AdvertisingWorkflow = {
  status: AdvertisingStatus;
  assignee: string;
  followUpAt: string;
  followUpNote: string;
  updatedBy: string;
};
