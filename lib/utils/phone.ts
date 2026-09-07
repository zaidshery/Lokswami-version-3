/**
 * Utility functions for WhatsApp and phone number normalization and validation.
 * Standardizes to E.164 format (+91XXXXXXXXXX) for Indian mobile numbers.
 */

/**
 * Normalizes an Indian phone/WhatsApp number to E.164 format.
 * Examples:
 *   "9876543210" -> "+919876543210"
 *   "+91 98765 43210" -> "+919876543210"
 *   "09876543210" -> "+919876543210"
 *   "+919876543210" -> "+919876543210"
 */
export function normalizeWhatsAppNumber(input: string | null | undefined): string | null {
  if (!input) return null;

  // Strip all whitespace, hyphens, parentheses
  const cleaned = input.trim().replace(/[\s\-()]/g, '');
  if (!cleaned) return null;

  // If starts with +91
  if (cleaned.startsWith('+91')) {
    const digits = cleaned.slice(3).replace(/\D/g, '');
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      return `+91${digits}`;
    }
  }

  // If starts with 91 (without +) and has 12 digits
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    const digits = cleaned.slice(2);
    if (/^[6-9]\d{9}$/.test(digits)) {
      return `+91${digits}`;
    }
  }

  // If starts with leading 0 (11 digits e.g. 09876543210)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    const digits = cleaned.slice(1);
    if (/^[6-9]\d{9}$/.test(digits)) {
      return `+91${digits}`;
    }
  }

  // If standard 10-digit number
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // For international E.164 compliance
  if (cleaned.startsWith('+') && /^\+\d{10,15}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * Validates if the given string is a valid normalized or standard mobile number.
 */
export function isValidWhatsAppNumber(input: string | null | undefined): boolean {
  return normalizeWhatsAppNumber(input) !== null;
}

/**
 * Formats a phone number for user-friendly display.
 * "+919876543210" -> "+91 98765 43210"
 */
export function formatPhoneDisplay(number: string | null | undefined): string {
  if (!number) return '';
  const normalized = normalizeWhatsAppNumber(number);
  if (!normalized) return number;

  if (normalized.startsWith('+91') && normalized.length === 13) {
    const p1 = normalized.slice(0, 3);
    const p2 = normalized.slice(3, 8);
    const p3 = normalized.slice(8);
    return `${p1} ${p2} ${p3}`;
  }

  return normalized;
}
