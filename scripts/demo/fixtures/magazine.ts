/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * Realistic Demo E-Magazine Fixtures (Mongo-Only Capability)
 */

import { makeDemoMongoId, relativeDate, relativeIsoDate } from './common';

export interface DemoMagazineFixture {
  _id: string;
  publicationType: 'emagazine';
  city: string;
  citySlug: string;
  title: string;
  description: string;
  publishDate: string; // YYYY-MM-DD
  thumbnailPath: string;
  pdfPath: string;
  pages: number;
  status: 'published';
  productionStatus: string;
  familyId: string;
  revisionNumber: number;
  isCurrentRevision: boolean;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const todayDateStr = new Date().toISOString().slice(0, 10);

export const DEMO_MAGAZINES: DemoMagazineFixture[] = [
  {
    _id: makeDemoMongoId(401),
    publicationType: 'emagazine',
    city: 'Indore',
    citySlug: 'indore',
    title: 'लोकस्वामी विशेषांक - डिजिटल मध्य प्रदेश मासिक पत्रिका',
    description: 'मध्य प्रदेश की कला, संस्कृति, आधुनिक विकास और नवाचार पर केंद्रित विशेष मासिक पत्रिका',
    publishDate: todayDateStr,
    thumbnailPath: '/placeholders/epaper-3x4.svg',
    pdfPath: '/placeholders/sample.pdf',
    pages: 4,
    status: 'published',
    productionStatus: 'published',
    familyId: 'fam-magazine-demo',
    revisionNumber: 1,
    isCurrentRevision: true,
    publishedAt: relativeDate(10),
    createdAt: relativeDate(15),
    updatedAt: relativeDate(10),
  },
];

export const DEMO_MAGAZINE_IDS: string[] = DEMO_MAGAZINES.map((m) => m._id);
