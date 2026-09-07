export const EPAPER_CITY_OPTIONS = [
  { slug: 'indore', name: 'Indore' },
  { slug: 'ujjain', name: 'Ujjain' },
  { slug: 'mumbai', name: 'Mumbai' },
  { slug: 'delhi', name: 'Delhi' },
] as const;

export type EPaperCitySlug = (typeof EPAPER_CITY_OPTIONS)[number]['slug'];
export type EPaperCityName = (typeof EPAPER_CITY_OPTIONS)[number]['name'];

// Backward compatibility for existing UI code that reads this list.
export const EPAPER_CITIES = EPAPER_CITY_OPTIONS.map((item) => item.name) as readonly EPaperCityName[];
export const EPAPER_CITY_SLUGS = EPAPER_CITY_OPTIONS.map((item) => item.slug) as readonly EPaperCitySlug[];

export type EPaperCity = EPaperCityName;

export function isEPaperCity(value: unknown): value is EPaperCityName {
  return typeof value === 'string' && EPAPER_CITIES.includes(value as EPaperCityName);
}

export function isEPaperCitySlug(value: unknown): value is EPaperCitySlug {
  return typeof value === 'string' && EPAPER_CITY_SLUGS.includes(value as EPaperCitySlug);
}

export function getCityNameFromSlug(slug: string): EPaperCityName | '' {
  const match = EPAPER_CITY_OPTIONS.find((item) => item.slug === slug);
  return match?.name || '';
}

export function getCitySlugFromName(name: string): EPaperCitySlug | '' {
  const match = EPAPER_CITY_OPTIONS.find((item) => item.name.toLowerCase() === name.toLowerCase());
  return match?.slug || '';
}

/** Public-facing label. The legacy `delhi` slug remains stable for stored data and URLs. */
export function getEpaperCityDisplayName(
  value: string,
  language: 'en' | 'hi' = 'en'
) {
  const normalized = String(value || '').trim();
  const slug = isEPaperCitySlug(normalized.toLowerCase())
    ? (normalized.toLowerCase() as EPaperCitySlug)
    : getCitySlugFromName(normalized);

  if (slug === 'delhi') {
    return language === 'hi' ? 'डिजिटल' : 'Digital';
  }

  return EPAPER_CITY_OPTIONS.find((item) => item.slug === slug)?.name || normalized;
}

export function getEpaperEditionDisplayLabel(
  value: string,
  language: 'en' | 'hi' = 'en'
) {
  const city = getEpaperCityDisplayName(value, language);
  if (!city) return '';
  return language === 'hi' ? `${city} संस्करण` : `${city} Edition`;
}

export function normalizeCitySlug(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return isEPaperCitySlug(normalized) ? normalized : '';
}

export function normalizeCityName(value: string) {
  const byName = EPAPER_CITY_OPTIONS.find(
    (item) => item.name.toLowerCase() === value.trim().toLowerCase()
  );
  if (byName) return byName.name;

  const bySlug = EPAPER_CITY_OPTIONS.find((item) => item.slug === value.trim().toLowerCase());
  return bySlug?.name || '';
}

function sanitizeUrlForExtension(url: string) {
  return url.split('?')[0].split('#')[0].toLowerCase();
}

export function isValidEpaperThumbnailUrl(url: string) {
  const value = url.trim();
  if (!value) return false;

  const lower = value.toLowerCase();
  if (
    lower.startsWith('data:image/jpeg') ||
    lower.startsWith('data:image/jpg') ||
    lower.startsWith('data:image/png') ||
    lower.startsWith('data:image/webp') ||
    lower.startsWith('data:application/pdf')
  ) {
    return true;
  }

  const sanitized = sanitizeUrlForExtension(lower);
  return (
    sanitized.endsWith('.jpg') ||
    sanitized.endsWith('.jpeg') ||
    sanitized.endsWith('.png') ||
    sanitized.endsWith('.webp') ||
    sanitized.endsWith('.pdf')
  );
}

export function isValidEpaperPdfUrl(url: string) {
  const value = url.trim();
  if (!value) return false;

  const lower = value.toLowerCase();
  if (lower.startsWith('data:application/pdf')) {
    return true;
  }

  const sanitized = sanitizeUrlForExtension(lower);
  return sanitized.endsWith('.pdf');
}

export function isPdfAsset(url: string) {
  const value = url.trim().toLowerCase();
  if (value.startsWith('data:application/pdf')) return true;

  const sanitized = sanitizeUrlForExtension(value);
  return sanitized.endsWith('.pdf');
}
