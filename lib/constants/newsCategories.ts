export type NewsCategory = {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
  aliases: string[];
};

const TECH_HI = '\u091f\u0947\u0915';
const TECHNOLOGY_HI = '\u091f\u0947\u0915\u094d\u0928\u094b\u0932\u0949\u091c\u0940';
const BUSINESS_HI = '\u092c\u093f\u091c\u0928\u0947\u0938';
const TRADE_HI = '\u0935\u094d\u092f\u093e\u092a\u093e\u0930';
const REGIONAL_HI = '\u0915\u094d\u0937\u0947\u0924\u094d\u0930\u0940\u092f';
const POLITICS_HI = '\u0930\u093e\u091c\u0928\u0940\u0924\u093f';

export const NEWS_CATEGORIES: NewsCategory[] = [
  {
    id: 'regional',
    slug: 'regional',
    name: REGIONAL_HI,
    nameEn: 'Regional',
    icon: '\ud83d\udccd',
    color: '#F59E0B',
    aliases: ['regional', 'local', REGIONAL_HI],
  },
  {
    id: 'politics',
    slug: 'politics',
    name: POLITICS_HI,
    nameEn: 'Politics',
    icon: '\ud83c\udfdb\ufe0f',
    color: '#EF4444',
    aliases: ['politics', 'government', 'rajneeti', POLITICS_HI],
  },
  {
    id: 'national',
    slug: 'national',
    name: '\u0930\u093e\u0937\u094d\u091f\u094d\u0930\u0940\u092f',
    nameEn: 'National',
    icon: '\ud83c\uddee\ud83c\uddf3',
    color: '#3B82F6',
    aliases: ['national', '\u0930\u093e\u0937\u094d\u091f\u094d\u0930\u0940\u092f'],
  },
  {
    id: 'international',
    slug: 'international',
    name: '\u0905\u0902\u0924\u0930\u094d\u0930\u093e\u0937\u094d\u091f\u094d\u0930\u0940\u092f',
    nameEn: 'International',
    icon: '\ud83c\udf0d',
    color: '#8B5CF6',
    aliases: [
      'international',
      '\u0905\u0902\u0924\u0930\u0930\u093e\u0937\u094d\u091f\u094d\u0930\u0940\u092f',
      '\u0905\u0902\u0924\u0930\u094d\u0930\u093e\u0937\u094d\u091f\u094d\u0930\u0940\u092f',
    ],
  },
  {
    id: 'sports',
    slug: 'sports',
    name: '\u0916\u0947\u0932',
    nameEn: 'Sports',
    icon: '\ud83c\udfcf',
    color: '#10B981',
    aliases: ['sports', '\u0916\u0947\u0932'],
  },
  {
    id: 'entertainment',
    slug: 'entertainment',
    name: '\u092e\u0928\u094b\u0930\u0902\u091c\u0928',
    nameEn: 'Entertainment',
    icon: '\ud83c\udfac',
    color: '#EC4899',
    aliases: ['entertainment', '\u092e\u0928\u094b\u0930\u0902\u091c\u0928'],
  },
  {
    id: 'technology',
    slug: 'technology',
    name: TECH_HI,
    nameEn: 'Tech',
    icon: '\ud83d\udcbb',
    color: '#06B6D4',
    aliases: ['tech', 'technology', 'tech news', TECH_HI, TECHNOLOGY_HI],
  },
  {
    id: 'business',
    slug: 'business',
    name: BUSINESS_HI,
    nameEn: 'Business',
    icon: '\ud83d\udcbc',
    color: '#F97316',
    aliases: ['business', 'biz', BUSINESS_HI, TRADE_HI],
  },
  {
    id: 'crime', slug: 'crime', name: 'अपराध', nameEn: 'Crime',
    icon: '📰', color: '#EF4444', aliases: ['crime', 'Crime', 'अपराध'],
  },
];

export type NewsCategoryDefinition = {
  slug: string;
  name: string;
  nameEn: string;
  aliases?: string[];
};

// State and special definitions share the reader taxonomy without adding primary navigation items.
export const CMS_READER_CATEGORIES: NewsCategory[] = [{
  id: 'madhya-pradesh', slug: 'madhya-pradesh', name: 'मध्य प्रदेश',
  nameEn: 'Madhya Pradesh', icon: '📍', color: '#F59E0B',
  aliases: ['madhya-pradesh', 'Madhya Pradesh', 'मध्य प्रदेश', 'MP'],
},
  { id: 'maharashtra', slug: 'maharashtra', name: 'महाराष्ट्र', nameEn: 'Maharashtra', icon: '📍', color: '#F59E0B', aliases: ['maharashtra', 'Maharashtra', 'महाराष्ट्र', 'MH'] },
  { id: 'rajasthan', slug: 'rajasthan', name: 'राजस्थान', nameEn: 'Rajasthan', icon: '📍', color: '#F59E0B', aliases: ['rajasthan', 'Rajasthan', 'राजस्थान', 'RJ'] },
  { id: 'uttar-pradesh', slug: 'uttar-pradesh', name: 'उत्तर प्रदेश', nameEn: 'Uttar Pradesh', icon: '📍', color: '#F59E0B', aliases: ['uttar-pradesh', 'Uttar Pradesh', 'उत्तर प्रदेश', 'UP'] },
  { id: 'gujarat', slug: 'gujarat', name: 'गुजरात', nameEn: 'Gujarat', icon: '📍', color: '#F59E0B', aliases: ['gujarat', 'Gujarat', 'गुजरात', 'GJ'] },
  { id: 'lokswami-special', slug: 'lokswami-special', name: 'लोकस्वामी विशेष', nameEn: 'Lokswami Special', icon: '📰', color: '#EF4444', aliases: ['lokswami-special', 'Lokswami Special', 'लोकस्वामी विशेष', 'लोकस्वामी स्पेशल'] },
];

CMS_READER_CATEGORIES.push(
  { id: 'kisaan', slug: 'kisaan', name: '\u0915\u093f\u0938\u093e\u0928', nameEn: 'Kisaan', icon: '🌾', color: '#84CC16', aliases: ['kisaan', 'kisan', '\u0915\u093f\u0938\u093e\u0928'] },
  { id: 'jobs', slug: 'jobs', name: '\u0928\u094c\u0915\u0930\u093f\u092f\u093e\u0902', nameEn: 'Jobs', icon: '💼', color: '#3B82F6', aliases: ['jobs', '\u0928\u094c\u0915\u0930\u093f\u092f\u093e\u0902'] },
  { id: 'sarkari-yojana', slug: 'sarkari-yojana', name: '\u0938\u0930\u0915\u093e\u0930\u0940 \u092f\u094b\u091c\u0928\u093e', nameEn: 'Sarkari Yojana', icon: '📋', color: '#F59E0B', aliases: ['sarkari-yojana', 'Sarkari Yojana', '\u0938\u0930\u0915\u093e\u0930\u0940 \u092f\u094b\u091c\u0928\u093e'] },
  { id: 'dharm-jyotish', slug: 'dharm-jyotish', name: '\u0927\u0930\u094d\u092e \u090f\u0935\u0902 \u091c\u094d\u092f\u094b\u0924\u093f\u0937', nameEn: 'Dharm & Jyotish', icon: '🪔', color: '#A855F7', aliases: ['dharm-jyotish', 'Dharm & Jyotish', '\u0927\u0930\u094d\u092e \u090f\u0935\u0902 \u091c\u094d\u092f\u094b\u0924\u093f\u0937'] },
);

export const READER_CATEGORIES = [...NEWS_CATEGORIES, ...CMS_READER_CATEGORIES];

export const NEWS_CATEGORY_DEFINITIONS: NewsCategoryDefinition[] = READER_CATEGORIES.map(
  (category) => ({
    slug: category.slug,
    name: category.name,
    nameEn: category.nameEn,
    aliases: category.aliases,
  })
);

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function resolveNewsCategory(value: string) {
  const selected = normalize(value);
  if (!selected) return undefined;

  return READER_CATEGORIES.find((category) => {
    const candidates = [category.slug, category.name, category.nameEn, ...category.aliases];
    return candidates.some((candidate) => normalize(candidate) === selected);
  });
}

export function getNewsCategoryHref(slug: string) {
  return `/main/category/${slug}`;
}
