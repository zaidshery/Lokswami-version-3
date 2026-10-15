/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * Realistic Demo E-Paper Fixtures
 */

import { makeDemoMongoId, relativeDate, relativeIsoDate } from './common';

export interface DemoEpaperArticleFixture {
  _id: string;
  epaperId: string;
  pageNumber: number;
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  coverImagePath: string;
  hotspot: { x: number; y: number; w: number; h: number };
  releasedSnapshot: {
    version: number;
    title: string;
    slug: string;
    pageNumber: number;
    excerpt: string;
    contentHtml: string;
    coverImagePath: string;
    pageImagePath: string;
    hotspot: { x: number; y: number; w: number; h: number };
    releasedAt: string;
  } | null;
}

export interface DemoEpaperFixture {
  _id: string;
  publicationType: 'epaper';
  city: string;
  citySlug: string;
  title: string;
  description: string;
  publishDate: string; // YYYY-MM-DD
  thumbnailPath: string;
  pdfPath: string;
  pages: number;
  status: 'published' | 'draft';
  productionStatus: string;
  familyId: string;
  revisionNumber: number;
  isCurrentRevision: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  articleHotspots?: { id?: string; page: number; title: string; text: string; x: number; y: number; width: number; height: number }[];
  articles: DemoEpaperArticleFixture[];
}

const todayDateStr = new Date().toISOString().slice(0, 10);

export const DEMO_EPAPERS: DemoEpaperFixture[] = [
  // 1. Edition A: Released Indore Edition
  {
    _id: makeDemoMongoId(301),
    publicationType: 'epaper',
    city: 'Indore',
    citySlug: 'indore',
    title: 'दैनिक लोकस्वामी - इंदौर मुख्य संस्करण',
    description: 'इंदौर शहर और मालवा संभाग का विश्वसनीय दैनिक ई-पेपर',
    publishDate: todayDateStr,
    thumbnailPath: '/placeholders/epaper-3x4.svg',
    pdfPath: '/demo/sample.pdf',
    pages: 4,
    status: 'published',
    productionStatus: 'published',
    familyId: 'fam-indore-demo',
    revisionNumber: 1,
    isCurrentRevision: true,
    publishedAt: relativeDate(3),
    createdAt: relativeDate(5),
    updatedAt: relativeDate(3),
    articleHotspots: [
      {
        page: 1,
        title: 'इंदौर मेट्रो के दूसरे चरण का काम शुरू',
        text: 'गांधी नगर से सुपर कॉरिडोर और रीगल तिराहा मार्ग पर ट्रायल रन सफल रहा।',
        x: 0.05,
        y: 0.1,
        width: 0.45,
        height: 0.25,
      },
      {
        page: 1,
        title: 'मालवा में स्वच्छता के नए कीर्तिमान',
        text: 'इंदौर नगर निगम ने वार्ड स्तर पर शून्य अपशिष्ट कॉलोनियों का निर्माण तेज किया।',
        x: 0.52,
        y: 0.1,
        width: 0.43,
        height: 0.25,
      },
    ],
    articles: [
      {
        _id: makeDemoMongoId(311),
        epaperId: makeDemoMongoId(301),
        pageNumber: 1,
        title: 'इंदौर मेट्रो के दूसरे चरण का काम शुरू',
        slug: 'demo-epaper-indore-metro-phase-2',
        excerpt: 'गांधी नगर से सुपर कॉरिडोर और रीगल तिराहा मार्ग पर ट्रायल रन सफल रहा।',
        contentHtml: '<p>इंदौर मेट्रो परियोजना के दूसरे चरण के तहत पटरियों और विद्युत लाइनों का कार्य तेजी से पूरा किया जा रहा है। अधिकारियों ने बताया कि आगामी माह में यात्रियों के लिए नियमित सेवाएं शुरू करने की तैयारी है।</p>',
        coverImagePath: '/placeholders/news-16x9.svg',
        hotspot: { x: 0.05, y: 0.1, w: 0.45, h: 0.25 },
        releasedSnapshot: {
          version: 1,
          title: 'इंदौर मेट्रो के दूसरे चरण का काम शुरू',
          slug: 'demo-epaper-indore-metro-phase-2',
          pageNumber: 1,
          excerpt: 'गांधी नगर से सुपर कॉरिडोर और रीगल तिराहा मार्ग पर ट्रायल रन सफल रहा।',
          contentHtml: '<p>इंदौर मेट्रो परियोजना के दूसरे चरण के तहत पटरियों और विद्युत लाइनों का कार्य तेजी से पूरा किया जा रहा है। अधिकारियों ने बताया कि आगामी माह में यात्रियों के लिए नियमित सेवाएं शुरू करने की तैयारी है।</p>',
          coverImagePath: '/placeholders/news-16x9.svg',
          pageImagePath: '/placeholders/epaper-3x4.svg',
          hotspot: { x: 0.05, y: 0.1, w: 0.45, h: 0.25 },
          releasedAt: relativeIsoDate(3),
        },
      },
      {
        _id: makeDemoMongoId(312),
        epaperId: makeDemoMongoId(301),
        pageNumber: 1,
        title: 'मालवा में स्वच्छता के नए कीर्तिमान',
        slug: 'demo-epaper-malwa-swachhata-record',
        excerpt: 'इंदौर नगर निगम ने वार्ड स्तर पर शून्य अपशिष्ट कॉलोनियों का निर्माण तेज किया।',
        contentHtml: '<p>नागरिकों की सहभागिता से कचरा संग्रहण और रिसाइक्लिंग में इंदौर ने एक बार फिर पूरे देश में उदाहरण प्रस्तुत किया है।</p>',
        coverImagePath: '/placeholders/news-16x9.svg',
        hotspot: { x: 0.52, y: 0.1, w: 0.43, h: 0.25 },
        releasedSnapshot: {
          version: 1,
          title: 'मालवा में स्वच्छता के नए कीर्तिमान',
          slug: 'demo-epaper-malwa-swachhata-record',
          pageNumber: 1,
          excerpt: 'इंदौर नगर निगम ने वार्ड स्तर पर शून्य अपशिष्ट कॉलोनियों का निर्माण तेज किया।',
          contentHtml: '<p>नागरिकों की सहभागिता से कचरा संग्रहण और रिसाइक्लिंग में इंदौर ने एक बार फिर पूरे देश में उदाहरण प्रस्तुत किया है।</p>',
          coverImagePath: '/placeholders/news-16x9.svg',
          pageImagePath: '/placeholders/epaper-3x4.svg',
          hotspot: { x: 0.52, y: 0.1, w: 0.43, h: 0.25 },
          releasedAt: relativeIsoDate(3),
        },
      },
      {
        _id: makeDemoMongoId(313),
        epaperId: makeDemoMongoId(301),
        pageNumber: 2,
        title: 'उज्जैन में महाकाल महालोक कॉरिडोर का विस्तार',
        slug: 'demo-epaper-ujjain-corridor-expansion',
        excerpt: 'श्रद्धालुओं की सुविधा के लिए नए वातानुकूलित प्रतीक्षालय और ई-कार्ट सेवा शुरू।',
        contentHtml: '<p>तीर्थनगरी उज्जैन में दर्शनार्थियों के लिए विश्वस्तरीय सुविधाएं विकसित की गई हैं।</p>',
        coverImagePath: '/placeholders/news-16x9.svg',
        hotspot: { x: 0.05, y: 0.4, w: 0.9, h: 0.3 },
        releasedSnapshot: {
          version: 1,
          title: 'उज्जैन में महाकाल महालोक कॉरिडोर का विस्तार',
          slug: 'demo-epaper-ujjain-corridor-expansion',
          pageNumber: 2,
          excerpt: 'श्रद्धालुओं की सुविधा के लिए नए वातानुकूलित प्रतीक्षालय और ई-कार्ट सेवा शुरू।',
          contentHtml: '<p>तीर्थनगरी उज्जैन में दर्शनार्थियों के लिए विश्वस्तरीय सुविधाएं विकसित की गई हैं।</p>',
          coverImagePath: '/placeholders/news-16x9.svg',
          pageImagePath: '/placeholders/epaper-3x4.svg',
          hotspot: { x: 0.05, y: 0.4, w: 0.9, h: 0.3 },
          releasedAt: relativeIsoDate(3),
        },
      },
    ],
  },

  // 2. Edition B: Draft / Unreleased Ujjain Edition
  {
    _id: makeDemoMongoId(302),
    publicationType: 'epaper',
    city: 'Ujjain',
    citySlug: 'ujjain',
    title: 'दैनिक लोकस्वामी - उज्जैन संस्करण (प्रारूप)',
    description: 'उज्जैन और धार्मिक संभाग का ई-पेपर प्रारूप',
    publishDate: todayDateStr,
    thumbnailPath: '/placeholders/epaper-3x4.svg',
    pdfPath: '/demo/sample.pdf',
    pages: 3,
    status: 'draft', // Unreleased draft
    productionStatus: 'draft_upload',
    familyId: 'fam-ujjain-demo',
    revisionNumber: 1,
    isCurrentRevision: false,
    publishedAt: null,
    createdAt: relativeDate(1),
    updatedAt: relativeDate(1),
    articleHotspots: [],
    articles: [],
  },
];

export const DEMO_EPAPER_IDS: string[] = DEMO_EPAPERS.map((e) => e._id);
export const DEMO_EPAPER_ARTICLES: DemoEpaperArticleFixture[] = DEMO_EPAPERS.flatMap((e) => e.articles);
