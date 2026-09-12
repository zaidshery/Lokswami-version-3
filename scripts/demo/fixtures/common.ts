/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * Common Fixture Utilities & Deterministic Namespacing
 */

export const DEMO_NAMESPACE_PREFIX = 'demo-';
export const DEMO_MONGO_ID_PREFIX = '65f00000000000000000';

/**
 * Creates a deterministic 24-character hex ObjectId string for MongoDB.
 * Example: makeDemoMongoId(1) -> "65f000000000000000000001"
 */
export function makeDemoMongoId(counter: number): string {
  const hexCounter = Math.floor(counter).toString(16).padStart(4, '0');
  return `${DEMO_MONGO_ID_PREFIX}${hexCounter}`;
}

/**
 * Deterministic relative date string in ISO format.
 * Uses a fixed anchor (or current hour baseline) for reproducible testing.
 */
export function relativeIsoDate(hoursAgo: number): string {
  // Use a predictable rounded reference point
  const baseTime = 1773340000000; // Deterministic 2026 anchor timestamp
  return new Date(baseTime - hoursAgo * 3600 * 1000).toISOString();
}

/**
 * Deterministic relative Date object.
 */
export function relativeDate(hoursAgo: number): Date {
  const baseTime = 1773340000000;
  return new Date(baseTime - hoursAgo * 3600 * 1000);
}

/**
 * Checks whether an identifier (slug or ID) belongs to the demo fixture namespace.
 */
export function isDemoIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const str = value.trim();
  return (
    str.startsWith(DEMO_NAMESPACE_PREFIX) ||
    str.startsWith(DEMO_MONGO_ID_PREFIX)
  );
}
