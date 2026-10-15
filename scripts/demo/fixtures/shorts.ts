/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * Realistic Demo Shorts / Swipe Fixtures (9:16 Vertical)
 * 
 * Swipe Short Publication Invariant:
 * Every reader-visible published short links via `articleId` to a valid
 * publicly published demo Article fixture.
 */

import { makeDemoMongoId, relativeDate } from './common';

export interface DemoShortFixture {
  _id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration: number;
  category: string;
  isShort: boolean;
  isPublished: boolean;
  aspectRatio: '9:16';
  shortsRank: number;
  views: number;
  articleId: string; // Linked published demo article
  mediaProvider: 'youtube' | 'spaces-mp4';
  processingStatus: 'ready';
  createdAt: Date;
  publishedAt: Date;
  updatedAt: Date;
}

export const DEMO_SHORTS: DemoShortFixture[] = [
  {
    _id: makeDemoMongoId(251),
    slug: 'demo-short-indore-metro-speed-test',
    title: 'इंदौर मेट्रो: 90 किमी/घंटा की रफ्तार से पहली बार दौड़ी ट्रेन #IndoreMetro',
    description: 'इंदौर सुपर कॉरिडोर पर मेट्रो की हाई-स्पीड ट्रायल रन की पहली झलक।',
    thumbnail: '/placeholders/story-9x16.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 35, // 35s
    category: 'Regional',
    isShort: true,
    isPublished: true,
    aspectRatio: '9:16',
    shortsRank: 1,
    views: 8920,
    articleId: makeDemoMongoId(2), // Linked to demo-mp-urban-metro-infrastructure-projects
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(1),
    publishedAt: relativeDate(1),
    updatedAt: relativeDate(1),
  },
  {
    _id: makeDemoMongoId(252),
    slug: 'demo-short-traffic-plan-quick-guide',
    title: 'इंदौर ट्रैफिक अलर्ट: रीगल तिराहा बंद, इन 3 रास्तों से निकलें #TrafficAlert',
    description: 'सड़क निर्माण के चलते अगले 24 घंटे के लिए लागू नया ट्रैफिक रूट मैप।',
    thumbnail: '/placeholders/story-9x16.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 28,
    category: 'Regional',
    isShort: true,
    isPublished: true,
    aspectRatio: '9:16',
    shortsRank: 2,
    views: 6410,
    articleId: makeDemoMongoId(1), // Linked to demo-indore-traffic-route-change
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(2),
    publishedAt: relativeDate(2),
    updatedAt: relativeDate(2),
  },
  {
    _id: makeDemoMongoId(253),
    slug: 'demo-short-cricket-winning-six-celebration',
    title: 'आखिरी गेंद पर छक्का और जीत! स्टेडियम में गूंजा वंदे मातरम #CricketWin',
    description: 'मैच के अंतिम पलों का रोमांचक वीडियो और भारतीय खिलाड़ियों का जश्न।',
    thumbnail: '/placeholders/story-9x16.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 42,
    category: 'Sports',
    isShort: true,
    isPublished: true,
    aspectRatio: '9:16',
    shortsRank: 3,
    views: 14200,
    articleId: makeDemoMongoId(7), // Linked to demo-india-cricket-championship-victory
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(3),
    publishedAt: relativeDate(3),
    updatedAt: relativeDate(3),
  },
  {
    _id: makeDemoMongoId(254),
    slug: 'demo-short-ai-robot-demo-summit',
    title: 'इंदौर एजुकेशन समिट में स्कूली छात्रों ने बनाया अनोखा एआई रोबोट #AIRobotics',
    description: 'यह छोटा रोबोट किताबों के पन्नों को स्कैन कर बोलकर सुना सकता है।',
    thumbnail: '/placeholders/story-9x16.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 38,
    category: 'Tech',
    isShort: true,
    isPublished: true,
    aspectRatio: '9:16',
    shortsRank: 4,
    views: 5120,
    articleId: makeDemoMongoId(3), // Linked to demo-indore-education-tech-summit-2026
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(4),
    publishedAt: relativeDate(4),
    updatedAt: relativeDate(4),
  },
  {
    _id: makeDemoMongoId(255),
    slug: 'demo-short-ujjain-mahakal-shringar-darshan',
    title: 'जय महाकाल! आज सुबह का विशेष चंदन और भस्म श्रृंगार #MahakalUjjain',
    description: 'श्री महाकालेश्वर ज्योतिर्लिंग उज्जैन से आज प्रातः काल की दिव्य झांकी।',
    thumbnail: '/placeholders/story-9x16.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 30,
    category: 'Regional',
    isShort: true,
    isPublished: true,
    aspectRatio: '9:16',
    shortsRank: 5,
    views: 18900,
    articleId: makeDemoMongoId(16), // Linked to demo-ujjain-mahakal-corridor-pilgrim-facilities
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(5),
    publishedAt: relativeDate(5),
    updatedAt: relativeDate(5),
  },
  {
    _id: makeDemoMongoId(256),
    slug: 'demo-short-clean-city-night-sweeping',
    title: 'रात 2 बजे भी इंदौर की सड़कों पर ऐसा रहता है सफाई का जज्बा #SwachhIndore',
    description: 'मैकेनाइज्ड स्वीपिंग और रात की शिफ्ट में काम करते सफाई मित्रों का वीडियो।',
    thumbnail: '/placeholders/story-9x16.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 25,
    category: 'National',
    isShort: true,
    isPublished: true,
    aspectRatio: '9:16',
    shortsRank: 6,
    views: 7850,
    articleId: makeDemoMongoId(4), // Linked to demo-civic-cleanliness-drive-indore
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(6),
    publishedAt: relativeDate(6),
    updatedAt: relativeDate(6),
  },
  {
    _id: makeDemoMongoId(257),
    slug: 'demo-short-smart-5g-sensor-demo',
    title: 'बिजली का फॉल्ट होते ही फोन पर आया अलर्ट! जानिए कैसे काम करता है 5G सेंसर #SmartGrid',
    description: 'इंदौर में पहली बार बिजली ट्रांसफॉर्मर्स में लगे आधुनिक 5G IoT सेंसर्स।',
    thumbnail: '/placeholders/story-9x16.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 44,
    category: 'Tech',
    isShort: true,
    isPublished: true,
    aspectRatio: '9:16',
    shortsRank: 7,
    views: 3950,
    articleId: makeDemoMongoId(8), // Linked to demo-5g-network-and-iot-infrastructure
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(7),
    publishedAt: relativeDate(7),
    updatedAt: relativeDate(7),
  },
  {
    _id: makeDemoMongoId(258),
    slug: 'demo-short-startup-founder-quote-advice',
    title: 'इंदौर के युवा फाउंडर का कॉलेज स्टूडेंट्स को मैसेज: "आइडिया से बड़ा है एग्जीक्यूशन" #StartupIndia',
    description: 'एआई स्टार्टअप फाउंडर ने बताया कि कॉलेज के दिनों में कैसे शुरू करें कोडिंग।',
    thumbnail: '/placeholders/story-9x16.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 32,
    category: 'Tech',
    isShort: true,
    isPublished: true,
    aspectRatio: '9:16',
    shortsRank: 8,
    views: 6100,
    articleId: makeDemoMongoId(5), // Linked to demo-ai-and-digital-transformation-in-central-india
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(8),
    publishedAt: relativeDate(8),
    updatedAt: relativeDate(8),
  },
];

export const DEMO_SHORT_IDS: string[] = DEMO_SHORTS.map((s) => s._id);
