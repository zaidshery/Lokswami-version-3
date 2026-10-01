import { READER_CATEGORIES, getNewsCategoryHref } from '@/lib/constants/newsCategories';

export type ReaderNavigationLink = {
  name: string;
  nameEn: string;
  href: string;
};

export const READER_NAVIGATION = {
  home: { name: '\u0939\u094b\u092e', nameEn: 'Home', href: '/main' },
  latest: { name: '\u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902', nameEn: 'Latest News', href: '/main/latest' },
  elections: { name: '\u091a\u0941\u0928\u093e\u0935', nameEn: 'Elections', href: '/main/elections' },
  videos: { name: '\u0935\u0940\u0921\u093f\u092f\u094b', nameEn: 'Videos', href: '/main/videos' },
  epaper: { name: '\u0908-\u092a\u0947\u092a\u0930', nameEn: 'E-Paper', href: '/main/epaper' },
  emagazine: { name: '\u0908-\u092e\u0948\u0917\u091c\u093c\u0940\u0928', nameEn: 'E-Magazine', href: '/main/e-magazine' },
  digitalNewsroom: { name: '\u0921\u093f\u091c\u093f\u091f\u0932 \u0928\u094d\u092f\u0942\u091c\u0930\u0942\u092e', nameEn: 'Digital Newsroom', href: '/main/digital-newsroom' },
  search: { name: '\u0916\u094b\u091c\u0947\u0902', nameEn: 'Search', href: '/main/search' },
  contact: { name: '\u0938\u0902\u092a\u0930\u094d\u0915', nameEn: 'Contact', href: '/main/contact' },
} as const satisfies Record<string, ReaderNavigationLink>;

const categoryLink = (slug: string): ReaderNavigationLink => {
  const category = READER_CATEGORIES.find((item) => item.slug === slug)!;
  return { name: category.name, nameEn: category.nameEn, href: getNewsCategoryHref(category.slug) };
};

// Primary destinations; supported children are mapped in HOMEPAGE_NAVIGATION below.
export const HOMEPAGE_PRIMARY_NAVIGATION: ReaderNavigationLink[] = [
  READER_NAVIGATION.home,
  { ...categoryLink('regional'), name: 'राज्य', nameEn: 'States' },
  { ...READER_NAVIGATION.videos, nameEn: 'Video' },
  READER_NAVIGATION.epaper,
  READER_NAVIGATION.emagazine,
  categoryLink('lokswami-special'),
  ...['politics', 'national', 'international', 'sports', 'entertainment', 'technology', 'business'].map(categoryLink),
  { ...READER_NAVIGATION.elections, nameEn: 'Election' },
];

export type ReaderNavigationItem = ReaderNavigationLink & { id: string; children?: ReaderNavigationLink[] };
export const STATE_NAVIGATION = ['madhya-pradesh', 'maharashtra', 'rajasthan', 'uttar-pradesh', 'gujarat'].map(categoryLink);
export const HOMEPAGE_NAVIGATION: ReaderNavigationItem[] = [
  ...HOMEPAGE_PRIMARY_NAVIGATION.map(link => ({
    ...link, id: link.href.split('/').pop() || 'home',
    ...(link.href === getNewsCategoryHref('regional') ? {
      children: STATE_NAVIGATION,
    } : {}),
  })),
  { id: 'more', name: 'अन्य', nameEn: 'More', href: '',
    children: ['kisaan', 'jobs', 'sarkari-yojana', 'dharm-jyotish'].map(categoryLink).concat(READER_NAVIGATION.contact) },
];
export function isReaderNavigationItemActive(pathname: string, item: ReaderNavigationItem): boolean {
  return isReaderNavigationActive(pathname, item.href) || !!item.children?.some(child => isReaderNavigationActive(pathname, child.href));
}

export function isReaderNavigationActive(pathname: string, href: string): boolean {
  if (!pathname || !href) return false;
  const cleanPath = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const cleanHref = href.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';

  if (cleanHref === '/main' || cleanHref === '/') {
    return cleanPath === '/main' || cleanPath === '/';
  }

  const shortsRoot = '/main/shorts';
  if (
    cleanHref === READER_NAVIGATION.videos.href &&
    (cleanPath === shortsRoot || cleanPath.startsWith(`${shortsRoot}/`))
  ) {
    return true;
  }

  return cleanPath === cleanHref || cleanPath.startsWith(`${cleanHref}/`);
}
