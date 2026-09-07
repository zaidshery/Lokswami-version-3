import { describe, expect, it } from 'vitest';
import {
  formatPhoneDisplay,
  isValidWhatsAppNumber,
  normalizeWhatsAppNumber,
} from '@/lib/utils/phone';
import {
  findStoredUserByEmail,
  findStoredUserByIdentifier,
  findStoredUserByWhatsApp,
  upsertStoredUser,
} from '@/lib/storage/usersFile';

describe('WhatsApp & Phone Number Utilities', () => {
  it('normalizes standard 10-digit Indian numbers to E.164 (+91)', () => {
    expect(normalizeWhatsAppNumber('9876543210')).toBe('+919876543210');
    expect(normalizeWhatsAppNumber('8765432109')).toBe('+918765432109');
    expect(normalizeWhatsAppNumber('7654321098')).toBe('+917654321098');
    expect(normalizeWhatsAppNumber('6543210987')).toBe('+916543210987');
  });

  it('handles numbers with spaces, hyphens, and parentheses', () => {
    expect(normalizeWhatsAppNumber('+91 98765 43210')).toBe('+919876543210');
    expect(normalizeWhatsAppNumber('+91-98765-43210')).toBe('+919876543210');
    expect(normalizeWhatsAppNumber('(91) 9876543210')).toBe('+919876543210');
    expect(normalizeWhatsAppNumber('09876543210')).toBe('+919876543210');
  });

  it('validates correct numbers and rejects invalid ones', () => {
    expect(isValidWhatsAppNumber('9876543210')).toBe(true);
    expect(isValidWhatsAppNumber('+919876543210')).toBe(true);
    expect(isValidWhatsAppNumber('12345')).toBe(false);
    expect(isValidWhatsAppNumber('abcdefghij')).toBe(false);
    expect(isValidWhatsAppNumber('')).toBe(false);
    expect(isValidWhatsAppNumber(null)).toBe(false);
  });

  it('formats phone numbers nicely for user display', () => {
    expect(formatPhoneDisplay('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhoneDisplay('9876543210')).toBe('+91 98765 43210');
  });
});

describe('Users File Storage Fallback', () => {
  const testId = `test-user-${Date.now()}`;
  const testEmail = `test_${Date.now()}@lokswami.test`;
  const testPhone = `+91987${String(Date.now()).slice(-7)}`;

  it('upserts and retrieves user with WhatsApp and Daily E-paper opt-in', async () => {
    const created = await upsertStoredUser({
      _id: testId,
      name: 'Test Subscriber',
      email: testEmail,
      whatsappNumber: testPhone,
      role: 'reader',
      optInDailyEpaper: true,
      preferredLanguage: 'hi',
    });

    expect(created._id).toBe(testId);
    expect(created.name).toBe('Test Subscriber');
    expect(created.whatsappNumber).toBe(testPhone);
    expect(created.optInDailyEpaper).toBe(true);

    const foundByEmail = await findStoredUserByEmail(testEmail);
    expect(foundByEmail).not.toBeNull();
    expect(foundByEmail?.name).toBe('Test Subscriber');

    const foundByPhone = await findStoredUserByWhatsApp(testPhone);
    expect(foundByPhone).not.toBeNull();
    expect(foundByPhone?.email).toBe(testEmail);

    const foundByIdentifier = await findStoredUserByIdentifier(testPhone);
    expect(foundByIdentifier).not.toBeNull();
    expect(foundByIdentifier?._id).toBe(testId);
  });
});
