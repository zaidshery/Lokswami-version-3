/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * Realistic Demo Video Fixtures (16:9 Landscape)
 */

import { makeDemoMongoId, relativeDate } from './common';

export interface DemoVideoFixture {
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
  aspectRatio: '16:9';
  views: number;
  mediaProvider: 'youtube' | 'spaces-mp4';
  processingStatus: 'ready';
  createdAt: Date;
  publishedAt: Date;
  updatedAt: Date;
}

export const DEMO_VIDEOS: DemoVideoFixture[] = [
  {
    _id: makeDemoMongoId(201),
    slug: 'demo-video-indore-metro-corridor-trial-run',
    title: 'इंदौर मेट्रो के नए कॉरिडोर पर सफल ट्रायल रन: देखें ग्राउंड रिपोर्ट',
    summary: 'गांधी नगर से सुपर कॉरिडोर तक मेट्रो ट्रेन की पहली हाई-स्पीड टेस्टिंग पूरी।',
    description: 'इंदौर मेट्रो प्रोजेक्ट के चरणबद्ध विस्तार के तहत आज नवनिर्मित ट्रैक पर आधुनिक कोचों का सफल परीक्षण किया गया। विशेषज्ञों ने सिग्नलिंग और आपातकालीन ब्रेकिंग सिस्टम की विस्तृत जांच की।',
    thumbnail: '/placeholders/news-16x9.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 215, // 3m 35s
    category: 'Regional',
    isShort: false,
    isPublished: true,
    aspectRatio: '16:9',
    views: 4520,
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(2),
    publishedAt: relativeDate(2),
    updatedAt: relativeDate(2),
  },
  {
    _id: makeDemoMongoId(202),
    slug: 'demo-video-ai-startup-summit-indore',
    title: 'मध्य भारत में एआई स्टार्टअप्स का भविष्य: उद्योग जगत के विशेषज्ञों से खास बातचीत',
    summary: 'टेक समिट में युवा उद्यमियों ने साझा किए आर्टिफिशियल इंटेलिजेंस के नए प्रयोग।',
    description: 'इंदौर में आयोजित टेक कॉन्क्लेव के दौरान देश के शीर्ष सॉफ्टवेयर आर्किटेक्ट्स और स्टार्टअप संस्थापकों ने जेनरेटिव एआई और ऑटोमेशन के प्रभाव पर अपने विचार रखे।',
    thumbnail: '/placeholders/news-16x9.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 480, // 8m
    category: 'Tech',
    isShort: false,
    isPublished: true,
    aspectRatio: '16:9',
    views: 2890,
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(4),
    publishedAt: relativeDate(4),
    updatedAt: relativeDate(4),
  },
  {
    _id: makeDemoMongoId(203),
    slug: 'demo-video-cricket-match-highlights-review',
    title: 'भारत की शानदार जीत के 5 बड़े टर्निंग पॉइंट्स: मैच विश्लेषण',
    summary: 'क्रिकेट विशेषज्ञों ने किया भारतीय टीम के रणनीतिक फैसलों का पोस्टमार्टम।',
    description: 'कल शाम खेले गए रोमांचक फाइनल में भारतीय गेंदबाजों के घातक स्पेल और फील्डिंग के शानदार प्रदर्शन का वीडियो विश्लेषण।',
    thumbnail: '/placeholders/news-16x9.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 320, // 5m 20s
    category: 'Sports',
    isShort: false,
    isPublished: true,
    aspectRatio: '16:9',
    views: 8900,
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(6),
    publishedAt: relativeDate(6),
    updatedAt: relativeDate(6),
  },
  {
    _id: makeDemoMongoId(204),
    slug: 'demo-video-ujjain-mahakal-morning-aarti',
    title: 'उज्जैन: श्री महाकालेश्वर मंदिर में भस्म आरती के दिव्य दर्शन',
    summary: 'तड़के संपन्न हुई विशेष भस्म आरती में उमड़े हजारों श्रद्धालु।',
    description: 'बाबा महाकाल के पावन धाम उज्जैन से भस्म आरती और विशेष श्रृंगार के अलौकिक दृश्य। मंदिर परिसर में की गई सुरक्षा और दर्शन व्यवस्था।',
    thumbnail: '/placeholders/news-16x9.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 195, // 3m 15s
    category: 'Regional',
    isShort: false,
    isPublished: true,
    aspectRatio: '16:9',
    views: 12450,
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(8),
    publishedAt: relativeDate(8),
    updatedAt: relativeDate(8),
  },
  {
    _id: makeDemoMongoId(205),
    slug: 'demo-video-smart-city-cleanliness-model',
    title: 'इंदौर का 7-स्टार कचरा प्रबंधन मॉडल कैसे काम करता है? स्पेशल रिपोर्ट',
    summary: 'डोर-टू-डोर कचरा संग्रहण से लेकर बायो-सीएनजी संयंत्र तक का पूरा सफर।',
    description: 'इंदौर शहर के विश्वस्तरीय स्वच्छता मॉडल की जमीनी पड़ताल। किस तरह 100% कचरा अलग-अलग करके वैज्ञानिक तरीके से रिसाइकल किया जाता है।',
    thumbnail: '/placeholders/news-16x9.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 410, // 6m 50s
    category: 'National',
    isShort: false,
    isPublished: true,
    aspectRatio: '16:9',
    views: 6320,
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(10),
    publishedAt: relativeDate(10),
    updatedAt: relativeDate(10),
  },
  {
    _id: makeDemoMongoId(206),
    slug: 'demo-video-union-budget-economic-impact',
    title: 'केंद्रीय बजट 2026: आम नागरिक और मध्यम वर्ग की जेब पर क्या होगा असर?',
    summary: 'टैक्स स्लैब, रोजगार और बुनियादी ढांचे के बजट प्रावधानों पर विस्तृत चर्चा।',
    description: 'अर्थशास्त्रियों के पैनल ने बजट घोषणाओं का बारीक विश्लेषण किया और बताया कि आगामी वर्ष में महंगाई और ब्याज दरों की क्या स्थिति रहेगी।',
    thumbnail: '/placeholders/news-16x9.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 540, // 9m
    category: 'Business',
    isShort: false,
    isPublished: true,
    aspectRatio: '16:9',
    views: 3410,
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(12),
    publishedAt: relativeDate(12),
    updatedAt: relativeDate(12),
  },
  {
    _id: makeDemoMongoId(207),
    slug: 'demo-video-theatre-and-folk-dance-glimpse',
    title: 'मालवा लोक नृत्य और सांस्कृतिक रंग: देखिए युवा कलाकारों की मनमोहक प्रस्तुति',
    summary: 'सांस्कृतिक संध्या में पारंपरिक मटकी नृत्य और लोकगीतों की गूंज।',
    description: 'रवींद्र नाट्य गृह में आयोजित मालवा उत्सव की सांस्कृतिक संध्या में प्रस्तुत मटकी और गणगौर नृत्यों की रंगारंग झलकियां।',
    thumbnail: '/placeholders/news-16x9.svg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 180, // 3m
    category: 'Entertainment',
    isShort: false,
    isPublished: true,
    aspectRatio: '16:9',
    views: 1980,
    mediaProvider: 'youtube',
    processingStatus: 'ready',
    createdAt: relativeDate(14),
    publishedAt: relativeDate(14),
    updatedAt: relativeDate(14),
  },
] as (DemoVideoFixture & { summary?: string })[];

export const DEMO_VIDEO_IDS: string[] = DEMO_VIDEOS.map((v) => v._id);
