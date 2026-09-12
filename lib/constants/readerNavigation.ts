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

export function isReaderNavigationActive(pathname: string, href: string): boolean {
  if (!pathname || !href) return false;
  const cleanPath = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const cleanHref = href.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';

  if (cleanHref === '/main' || cleanHref === '/') {
    return cleanPath === '/main' || cleanPath === '/';
  }

  if (cleanHref === READER_NAVIGATION.videos.href && cleanPath.startsWith('/main/shorts')) {
    return true;
  }

  return cleanPath === cleanHref || cleanPath.startsWith(`${cleanHref}/`);
}
