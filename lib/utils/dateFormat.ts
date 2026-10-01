type DateLike = string | number | Date | null | undefined;

const ISO_DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE_RE = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/;

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function isValidDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseIsoDateOnly(value: string) {
  const match = value.match(ISO_DATE_ONLY_RE);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  return { year, month, day };
}

function resolveDateParts(value: DateLike) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const isoDateParts = parseIsoDateOnly(trimmed);
    if (isoDateParts) {
      return isoDateParts;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
    };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

function resolveDateTime(value: DateLike) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const isoDateParts = parseIsoDateOnly(trimmed);
    if (isoDateParts) {
      return new Date(
        isoDateParts.year,
        isoDateParts.month - 1,
        isoDateParts.day,
        0,
        0,
        0,
        0
      );
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatUiDate(value: DateLike, fallback = '') {
  const parts = resolveDateParts(value);
  if (!parts) return fallback;

  return `${pad2(parts.day)}/${pad2(parts.month)}/${String(parts.year).slice(-2)}`;
}

export function formatUiDateTime(value: DateLike, fallback = '') {
  const date = resolveDateTime(value);
  if (!date) return fallback;

  return `${formatUiDate(date, fallback)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Localized newsroom timestamps use India time on server and browser alike. */
export function formatReaderDateTime(value: DateLike, language: 'hi' | 'en', fallback = '') {
  const date = resolveDateTime(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(date);
}

export function formatUiDateInputValue(value: string) {
  return formatUiDate(value, '');
}

export function parseUiDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const isoDateParts = parseIsoDateOnly(trimmed);
  if (isoDateParts) {
    return `${isoDateParts.year}-${pad2(isoDateParts.month)}-${pad2(isoDateParts.day)}`;
  }

  const displayMatch = trimmed.match(DISPLAY_DATE_RE);
  if (!displayMatch) {
    return null;
  }

  const day = Number(displayMatch[1]);
  const month = Number(displayMatch[2]);
  const year = normalizeYear(Number(displayMatch[3]));
  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}
