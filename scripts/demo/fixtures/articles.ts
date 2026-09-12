/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * Realistic Synthetic Hindi News Article Fixtures
 */

import { makeDemoMongoId, relativeDate, relativeIsoDate } from './common';

export interface DemoArticleFixture {
  _id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  image: string;
  category: string;
  author: string;
  views: number;
  isBreaking: boolean;
  isTrending: boolean;
  tags: string[];
  publishedAt: Date;
  updatedAt: Date;
  workflow: {
    status: 'published';
    publishedAt: Date;
  };
  editorial: {
    storyType: string;
    factCheckStatus: string;
  };
  reporterMeta: {
    reporterId: string;
    reporterName: string;
  };
  seo: {
    metaTitle: string;
    metaDescription: string;
    focusKeyword: string;
  };
}

export const DEMO_ARTICLES: DemoArticleFixture[] = [
  // 1. Case A: SHORT HEADLINE
  {
    _id: makeDemoMongoId(1),
    slug: 'demo-indore-traffic-route-change',
    title: 'इंदौर में आज बदलेगा ट्रैफिक रूट',
    summary: 'बीआरटीएस और रीगल तिराहे पर निर्माण कार्य के चलते प्रशासन ने यातायात व्यवस्था में बदलाव किया है।',
    content: `इंदौर शहर में स्मार्ट सिटी और मेट्रो प्रोजेक्ट के विस्तार के तहत मुख्य चौराहों पर नए ट्रैफिक प्लान को आज से लागू कर दिया गया है। 
नगर निगम और यातायात पुलिस के संयुक्त निर्देशानुसार, रीगल चौराहा और पलासिया के बीच वाहनों की आवाजाही को वैकल्पिक मार्गों पर मोड़ा गया है। 
यातायात अधिकारियों ने बताया कि यह डायवर्जन आगामी दो दिनों तक रहेगा ताकि सीवरेज और केबल लाइन बिछाने का काम बिना किसी बाधा के पूरा हो सके। 
नागरिकों से अनुरोध किया गया है कि वे असुविधा से बचने के लिए रिंग रोड और जवाहर मार्ग का उपयोग करें।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Regional',
    author: 'राजेश वर्मा',
    views: 840,
    isBreaking: false,
    isTrending: false,
    tags: ['इंदौर', 'ट्रैफिक', 'प्रशासन'],
    publishedAt: relativeDate(1),
    updatedAt: relativeDate(1),
    workflow: { status: 'published', publishedAt: relativeDate(1) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(101), reporterName: 'राजेश वर्मा' },
    seo: { metaTitle: 'इंदौर ट्रैफिक रूट डायवर्जन', metaDescription: 'इंदौर में निर्माण कार्य के चलते नया ट्रैफिक प्लान', focusKeyword: 'इंदौर ट्रैफिक' },
  },

  // 2. Case B: LONG HINDI HEADLINE & METRO FOCUS
  {
    _id: makeDemoMongoId(2),
    slug: 'demo-mp-urban-metro-infrastructure-projects',
    title: 'मध्य प्रदेश के कई शहरों में शहरी परिवहन और बुनियादी ढांचे से जुड़ी नई परियोजनाओं पर काम तेज करने की तैयारी',
    summary: 'राज्य कैबिनेट ने भोपाल और इंदौर के बाद अन्य बड़े संभागों में भी आधुनिक पब्लिक ट्रांसपोर्ट नेटवर्क और मेट्रो कनेक्टिविटी के चरणबद्ध विस्तार को लेकर उच्चस्तरीय समीक्षा की है।',
    content: `मध्य प्रदेश के प्रमुख औद्योगिक और सांस्कृतिक केंद्रों में शहरी परिवहन ढांचे को आधुनिक रूप देने के लिए एक व्यापक कार्ययोजना तैयार की गई है।
नगरीय विकास एवं आवास विभाग के वरिष्ठ अधिकारियों के अनुसार, इंदौर मेट्रो और भोपाल मेट्रो के दूसरे चरण के कार्यों को गति देने के साथ ही ग्वालियर और जबलपुर में लाइट ट्रांजिट सिस्टम की संभावनाओं का अध्ययन शुरू हो गया है।
इस परियोजना का उद्देश्य न केवल दैनिक यात्रियों को सुगम और समयबद्ध यात्रा उपलब्ध कराना है, बल्कि निजी वाहनों के दबाव को घटाकर कार्बन उत्सर्जन में कमी लाना भी है।
विशेषज्ञों का मानना है कि मल्टी-मोडल कनेक्टिविटी के माध्यम से बस टर्मिनल, रेलवे स्टेशन और मेट्रो स्टेशनों को एक साझा टिकटिंग सिस्टम से जोड़ा जाएगा।
प्रशासन का लक्ष्य है कि चालू वित्तीय वर्ष के अंत तक प्रमुख कॉरिडोर पर ट्रायल रन की गति को दोगुना किया जाए।`,
    image: '/placeholders/news-16x9.svg',
    category: 'National',
    author: 'अमित कुमार पांडे',
    views: 4230,
    isBreaking: false,
    isTrending: true,
    tags: ['मेट्रो', 'मध्य प्रदेश', 'शहरी विकास', 'परिवहन'],
    publishedAt: relativeDate(2),
    updatedAt: relativeDate(2),
    workflow: { status: 'published', publishedAt: relativeDate(2) },
    editorial: { storyType: 'investigative', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(102), reporterName: 'अमित कुमार पांडे' },
    seo: { metaTitle: 'मध्य प्रदेश शहरी मेट्रो परियोजना विस्तार', metaDescription: 'मध्य प्रदेश के शहरों में आधुनिक पब्लिक ट्रांसपोर्ट नेटवर्क का विस्तार', focusKeyword: 'मध्य प्रदेश मेट्रो' },
  },

  // 3. Case C: VERY LONG SUMMARY (Pressures mobile 360-430px cards)
  {
    _id: makeDemoMongoId(3),
    slug: 'demo-indore-education-tech-summit-2026',
    title: 'इंदौर में दो दिवसीय नेशनल एजुकेशन समिट का भव्य शुभारंभ',
    summary: 'देशभर के 200 से अधिक शिक्षाविदों, शोधकर्ताओं, डिजिटल नवाचार विशेषज्ञों और नीति निर्माताओं ने उच्च शिक्षा में तकनीकी बदलाव, क्षेत्रीय भाषाओं में शिक्षण सामग्री की उपलब्धता और युवाओं के रोजगार कौशल को बढ़ाने के लिए नई रणनीतियों पर मंथन शुरू किया।',
    content: `इंदौर के रवींद्र नाट्य गृह में आयोजित दो दिवसीय शिक्षा शिखर सम्मेलन में नई राष्ट्रीय शिक्षा नीति के सफल क्रियान्वयन पर विस्तृत चर्चा हुई। 
उद्घाटन सत्र में विशेषज्ञों ने रेखांकित किया कि ग्रामीण और अर्ध-शहरी क्षेत्रों में डिजिटल लाइब्रेरी और स्मार्ट क्लासरूम का प्रसार तेजी से हो रहा है। 
सम्मेलन में विभिन्न विश्वविद्यालयों के कुलपतियों ने छात्रों में व्यावहारिक कौशल विकसित करने के लिए उद्योगों के साथ साझेदारी को अनिवार्य बनाने पर जोर दिया। 
समारोह के दौरान नवाचारी शिक्षण तकनीकों की प्रदर्शनी भी लगाई गई है, जिसमें स्कूली छात्रों द्वारा तैयार किए गए रोबोटिक्स प्रोजेक्ट्स आकर्षण का केंद्र रहे।`,
    image: '/placeholders/news-16x9.svg',
    category: 'National',
    author: 'सुनीता जोशी',
    views: 1950,
    isBreaking: false,
    isTrending: false,
    tags: ['शिक्षा', 'इंदौर', 'टेक्नोलॉजी', 'कौशल'],
    publishedAt: relativeDate(3),
    updatedAt: relativeDate(3),
    workflow: { status: 'published', publishedAt: relativeDate(3) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(103), reporterName: 'सुनीता जोशी' },
    seo: { metaTitle: 'इंदौर नेशनल एजुकेशन समिट', metaDescription: 'इंदौर में राष्ट्रीय शिक्षा सम्मेलन का आयोजन', focusKeyword: 'शिक्षा इंदौर' },
  },

  // 4. Case D: NO HERO IMAGE (Tests placeholder fallback)
  {
    _id: makeDemoMongoId(4),
    slug: 'demo-civic-cleanliness-drive-indore',
    title: 'स्वच्छता सर्वेक्षण 2026: इंदौर में जनभागीदारी से नए माइक्रो-प्लान पर अमल',
    summary: 'सात बार लगातार देश में प्रथम स्थान पाने वाले इंदौर ने कचरा संग्रहण और शून्य अपशिष्ट कॉलोनियों के निर्माण के लिए वार्ड स्तर पर अभियान तेज किया।',
    content: `इंदौर नगर निगम ने स्वच्छता के सातवें आसमान को छूने के बाद अब 100% शून्य अपशिष्ट वार्ड बनाने की दिशा में ऐतिहासिक कदम बढ़ाया है।
निगम आयुक्त ने सभी जोनल अधिकारियों को निर्देश दिए हैं कि व्यावसायिक क्षेत्रों में रात के समय विशेष सफाई और मैकेनाइज्ड स्वीपिंग जारी रखी जाए।
गीले कचरे से बायो-सीएनजी उत्पादन क्षमता को 20% तक बढ़ाने के लिए नए संयंत्र का काम भी अंतिम चरण में है।
स्थानीय नागरिकों, गैर-सरकारी संगठनों और व्यापारी संघों ने भी इस पहल में बढ़-चढ़कर हिस्सा लेने का संकल्प दोहराया है।`,
    image: '', // Intentionally empty to test fallback
    category: 'Regional',
    author: 'मनोज सोलंकी',
    views: 1200,
    isBreaking: false,
    isTrending: false,
    tags: ['इंदौर', 'स्वच्छता', 'मध्य प्रदेश'],
    publishedAt: relativeDate(4),
    updatedAt: relativeDate(4),
    workflow: { status: 'published', publishedAt: relativeDate(4) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(104), reporterName: 'मनोज सोलंकी' },
    seo: { metaTitle: 'स्वच्छता सर्वेक्षण इंदौर माइक्रो प्लान', metaDescription: 'इंदौर में शून्य अपशिष्ट कॉलोनियों के निर्माण की नई योजना', focusKeyword: 'स्वच्छता इंदौर' },
  },

  // 5. Case E & F: LONG BODY & INLINE CONTENT (8-15 paragraphs, quote, headings)
  {
    _id: makeDemoMongoId(5),
    slug: 'demo-ai-and-digital-transformation-in-central-india',
    title: 'सेंट्रल भारत में AI और डिजिटल स्टार्टअप्स का नया बूम',
    summary: 'मध्य प्रदेश और आसपास के औद्योगिक गलियारों में आर्टिफिशियल इंटेलिजेंस आधारित स्टार्टअप्स तेजी से वैश्विक पहचान बना रहे हैं।',
    content: `मध्य भारत का आईटी परिदृश्य पिछले तीन वर्षों में अभूतपूर्व गति से बदला है। इंदौर, भोपाल और उज्जैन में टेक हब के रूप में उभरती नई कंपनियां अब केवल आउटसोर्सिंग तक सीमित नहीं हैं, बल्कि कोर एआई और मशीन लर्निंग उत्पादों का निर्माण कर रही हैं।

विशेष रूप से कृषि और स्वास्थ्य सेवा के क्षेत्र में एआई संचालित समाधानों की मांग बहुत तेजी से बढ़ी है। मालवा क्षेत्र के कई कृषि वैज्ञानिकों और टेक उद्यमियों ने मिलकर ऐसी प्रणालियां तैयार की हैं जो मौसम के पूर्वानुमान और फसल की बीमारियों का सटीक विश्लेषण मिनटों में कर सकती हैं।

"हमारा उद्देश्य केवल सॉफ्टवेयर बनाना नहीं, बल्कि स्थानीय किसानों और छोटे व्यापारियों की वास्तविक समस्याओं का तकनीकी समाधान खोजना है।" — एक अग्रणी इंदौर स्थित एआई स्टार्टअप के संस्थापक।

इसके साथ ही, राज्य सरकार की नई स्टार्टअप नीति ने इन नवाचारों को पंख दिए हैं। आसान इनक्यूबेशन सुविधाएं, शुरुआती सीड फंडिंग और अंतरराष्ट्रीय निवेशकों से सीधा संपर्क मिलने के कारण कई युवा इंजीनियर अब बड़े शहरों को छोड़कर वापस इंदौर लौट रहे हैं।

कॉर्पोरेट जगत के जानकारों का कहना है कि यह रिवर्स ब्रेन ड्रेन मध्य भारत के लिए एक बड़ा आर्थिक अवसर साबित हो रहा है। स्थानीय इंजीनियरिंग कॉलेजों और स्टार्टअप्स के बीच साझा रिसर्च लैब स्थापित की जा रही हैं।

वित्तीय दृष्टिकोण से देखें तो पिछले वर्ष की तुलना में वेंचर कैपिटल निवेश में 45% की बढ़ोतरी दर्ज की गई है। फिनटेक और लॉजिस्टिक्स के क्षेत्र में काम करने वाले कई स्थानीय प्लेटफॉर्म्स ने बहुराष्ट्रीय कंपनियों से साझेदारियां की हैं।

शिक्षा क्षेत्र भी इस बदलाव से अछूता नहीं है। विश्वविद्यालयों में डेटा साइंस और जेनरेटिव एआई के विशेष पाठ्यक्रम शुरू किए गए हैं ताकि उद्योग की मांग के अनुरूप प्रशिक्षित प्रतिभाएं उपलब्ध कराई जा सकें।

आगामी ग्लोबल इन्वेस्टर्स समिट में भी डिजिटल इकोनॉमी और तकनीकी नवाचार को प्राथमिकता दी जाएगी। विश्लेषकों का अनुमान है कि अगले दो वर्षों में यह सेक्टर राज्य में 25,000 से अधिक प्रत्यक्ष उच्च-वेतन नौकरियों का सृजन करेगा।

कुल मिलाकर, पारंपरिक व्यापारिक शहर के रूप में पहचाना जाने वाला मालवा अब डिजिटल इनोवेशन और तकनीकी आत्मनिर्भरता का नया प्रतीक बनता जा रहा है।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Technology',
    author: 'डॉ. विवेक अग्निहोत्री',
    views: 6540,
    isBreaking: false,
    isTrending: true,
    tags: ['AI', 'Startup', 'टेक्नोलॉजी', 'इंदौर', 'डिजिटल'],
    publishedAt: relativeDate(5),
    updatedAt: relativeDate(5),
    workflow: { status: 'published', publishedAt: relativeDate(5) },
    editorial: { storyType: 'analysis', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(105), reporterName: 'डॉ. विवेक अग्निहोत्री' },
    seo: { metaTitle: 'मध्य भारत में AI और डिजिटल स्टार्टअप बूम', metaDescription: 'इंदौर और भोपाल में आर्टिफिशियल इंटेलिजेंस स्टार्टअप्स का विस्तार', focusKeyword: 'AI स्टार्टअप' },
  },

  // 6. Case G: ZERO VIEWS
  {
    _id: makeDemoMongoId(6),
    slug: 'demo-local-handicraft-artisan-revival',
    title: 'मालवा की पारंपरिक शिल्पकला को मिला ई-कॉमर्स का नया बाजार',
    summary: 'हाथ से बुने वस्त्रों और पारंपरिक मिट्टी के बर्तनों को वैश्विक मंच पर प्रस्तुत करने के लिए नए डिजिटल प्लेटफॉर्म की शुरुआत की गई।',
    content: `मध्य प्रदेश के ग्रामीण अंचलों में पीढ़ियों से चली आ रही हस्तशिल्प और बुनकर परंपरा को पुनर्जीवित करने के लिए एक अभिनव सहकारी पहल प्रारंभ हुई है। 
स्थानीय कारीगरों को आधुनिक ई-कॉमर्स प्लेटफॉर्म्स से जोड़कर उनके उत्पादों को सीधे ग्राहकों तक पहुंचाया जा रहा है। 
इस पहल से बिचौलियों की भूमिका समाप्त हो गई है और कारीगरों को उनकी मेहनत का उचित मूल्य सीधे बैंक खातों में मिल रहा है। 
डिजिटल फोटोग्राफी, पैकेजिंग और ऑनलाइन भुगतान के प्रशिक्षण से ग्रामीण महिलाओं की आत्मनिर्भरता में उल्लेखनीय वृद्धि हुई है।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Business',
    author: 'आरती शर्मा',
    views: 0, // Exactly 0 views test
    isBreaking: false,
    isTrending: false,
    tags: ['व्यापार', 'शिल्पकला', 'मध्य प्रदेश'],
    publishedAt: relativeDate(6),
    updatedAt: relativeDate(6),
    workflow: { status: 'published', publishedAt: relativeDate(6) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(106), reporterName: 'आरती शर्मा' },
    seo: { metaTitle: 'मालवा हस्तशिल्प और ई-कॉमर्स', metaDescription: 'पारंपरिक शिल्पकारों को डिजिटल बाजार से जोड़ने की पहल', focusKeyword: 'हस्तशिल्प मालवा' },
  },

  // 7. Case H & I: LARGE VIEW COUNT & LONG BYLINE
  {
    _id: makeDemoMongoId(7),
    slug: 'demo-india-cricket-championship-victory',
    title: 'भारतीय क्रिकेट टीम का शानदार प्रदर्शन, सीरीज पर 3-1 से अजेय कब्जा',
    summary: 'फाइनल मुकाबले में शीर्ष क्रम के बल्लेबाजों और तेज गेंदबाजों के घातक स्पेल के दम पर टीम इंडिया ने यादगार जीत दर्ज की।',
    content: `रोमांचक मुकाबले में भारतीय क्रिकेट टीम ने अपनी रणनीतिक श्रेष्ठता साबित करते हुए विरोधी टीम को 85 रनों से हरा दिया। 
सलामी बल्लेबाजों ने पहले विकेट के लिए शतकीय साझेदारी कर मजबूत नींव रखी, जिसे मध्यक्रम के बल्लेबाजों ने बड़े स्कोर में तब्दील किया। 
गेंदबाजी के दौरान डेथ ओवर्स में गेंदबाजों ने कसी हुई लाइन और सटीक यॉर्कर फेंककर मैच पूरी तरह भारत की झोली में डाल दिया। 
स्टेडियम में मौजूद 45 हजार दर्शकों ने तिरंगा लहराकर टीम की ऐतिहासिक उपलब्धि का जश्न मनाया। 
मैन ऑफ द मैच का पुरस्कार हरफनमौला प्रदर्शन करने वाले युवा खिलाड़ी को दिया गया।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Sports',
    author: 'वरिष्ठ विशेष खेल संवाददाता राजेश कुमार शर्मा',
    views: 15420, // Large views test
    isBreaking: false,
    isTrending: true,
    tags: ['क्रिकेट', 'खेल', 'भारत'],
    publishedAt: relativeDate(7),
    updatedAt: relativeDate(7),
    workflow: { status: 'published', publishedAt: relativeDate(7) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(107), reporterName: 'वरिष्ठ विशेष खेल संवाददाता राजेश कुमार शर्मा' },
    seo: { metaTitle: 'भारतीय क्रिकेट टीम की ऐतिहासिक जीत', metaDescription: 'सीरीज में भारतीय टीम का शानदार प्रदर्शन और जीत', focusKeyword: 'क्रिकेट' },
  },

  // 8. Case J: HINDI + ENGLISH TERMS (AI, 5G, Telecom, Startup)
  {
    _id: makeDemoMongoId(8),
    slug: 'demo-5g-network-and-iot-infrastructure',
    title: 'इंदौर और उज्जैन में 5G और IoT आधारित स्मार्ट ग्रिड प्रणाली की शुरुआत',
    summary: 'बिजली वितरण कंपनी ने ऑटोमेटेड फॉल्ट डिटेक्शन और रियल-टाइम मॉनिटरिंग के लिए उन्नत 5G नेटवर्क इंफ्रास्ट्रक्चर तैनात किया।',
    content: `विद्युत वितरण के आधुनिकीकरण के तहत मध्य प्रदेश पश्चिम क्षेत्र विद्युत वितरण कंपनी ने इंदौर में 5G संचालित IoT सेंसर्स का नेटवर्क स्थापित किया है। 
इस तकनीक की मदद से किसी भी ट्रांसफॉर्मर में खराबी आने पर कंट्रोल रूम को कुछ ही सेकंड में रियल-टाइम अलर्ट मिल जाएगा। 
अधिकारियों के अनुसार, यह स्मार्ट ग्रिड सिस्टम उपभोक्ताओं को निर्बाध बिजली आपूर्ति सुनिश्चित करेगा और तकनीकी खराबी के समाधान समय को आधा कर देगा। 
आगामी महीनों में इस व्यवस्था को राज्य के सभी प्रमुख औद्योगिक क्षेत्रों में भी लागू करने की योजना है।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Technology',
    author: 'समीर खान',
    views: 3180,
    isBreaking: false,
    isTrending: false,
    tags: ['5G', 'टेक्नोलॉजी', 'इंदौर', 'बिजली'],
    publishedAt: relativeDate(8),
    updatedAt: relativeDate(8),
    workflow: { status: 'published', publishedAt: relativeDate(8) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(108), reporterName: 'समीर खान' },
    seo: { metaTitle: '5G और IoT स्मार्ट ग्रिड इंदौर', metaDescription: 'इंदौर में 5G आधारित स्मार्ट पावर ग्रिड सिस्टम', focusKeyword: '5G स्मार्ट ग्रिड' },
  },

  // 9. BREAKING NEWS 1 (Short Headline)
  {
    _id: makeDemoMongoId(9),
    slug: 'demo-breaking-indore-traffic-diversion-morning',
    title: 'इंदौर में आज कई प्रमुख मार्गों पर रहेगा ट्रैफिक डायवर्जन',
    summary: 'बीआरटीएस कॉरिडोर और कलेक्टोरेट मार्ग पर आपात मरम्मत के चलते सुबह 8 से दोपहर 2 बजे तक यातायात बदला गया।',
    content: `इंदौर यातायात पुलिस द्वारा जारी त्वरित सूचना के अनुसार, आज कलेक्टोरेट और बीआरटीएस के समीप विशेष सुरक्षा एवं नवीनीकरण कार्यों के कारण मार्ग परिवर्तित रहेगा। 
पुलिस ने नागरिकों से वैकल्पिक रास्तों का उपयोग करने का अनुरोध किया है। सभी प्रमुख चौराहों पर अतिरिक्त ट्रैफिक वार्डन तैनात कर दिए गए हैं।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Regional',
    author: 'डेस्क रिपोर्टर',
    views: 9210,
    isBreaking: true, // Breaking News short
    isTrending: true,
    tags: ['इंदौर', 'ट्रैफिक', 'ब्रेकिंग'],
    publishedAt: relativeDate(0.5),
    updatedAt: relativeDate(0.5),
    workflow: { status: 'published', publishedAt: relativeDate(0.5) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(109), reporterName: 'डेस्क रिपोर्टर' },
    seo: { metaTitle: 'इंदौर ब्रेकिंग ट्रैफिक अपडेट', metaDescription: 'इंदौर में प्रमुख मार्गों पर ट्रैफिक डायवर्जन', focusKeyword: 'इंदौर ब्रेकिंग' },
  },

  // 10. BREAKING NEWS 2 (Long Devanagari Headline - Mobile Wrap Stress)
  {
    _id: makeDemoMongoId(10),
    slug: 'demo-breaking-weather-alert-madhya-pradesh-long',
    title: 'मध्य प्रदेश के कई शहरों में मौसम को लेकर प्रशासन ने सावधानी बरतने की सलाह जारी की, नागरिकों से यात्रा से पहले स्थानीय स्थिति जांचने की अपील',
    summary: 'मौसम विभाग द्वारा जारी ताजा पूर्वानुमान के बाद उज्जैन, इंदौर, भोपाल और होशंगाबाद संभागों में तेज हवाओं और अचानक बारिश की संभावना को देखते हुए जिला आपदा प्रबंधन टीमों को अलर्ट पर रखा गया है।',
    content: `मध्य प्रदेश राज्य आपदा प्रबंधन प्राधिकरण ने मौसम विभाग के पूर्वानुमान के आधार पर आगामी 24 घंटों के लिए विस्तृत एडवाइजरी जारी की है।
अधिकारियों ने नागरिकों को सलाह दी है कि वे तेज हवाओं या गरज-चमक के दौरान खुले मैदानों, पेड़ों या पुराने ढांचों के नीचे खड़े होने से बचें।
नगरीय निकायों को निर्देश दिए गए हैं कि जलभराव की स्थिति से निपटने के लिए ड्रेनेज पंपिंग स्टेशनों को चौबीसों घंटे चालू रखा जाए।
ग्रामीण क्षेत्रों में किसानों को कटी हुई फसलों को सुरक्षित स्थानों पर रखने के लिए पंचायत स्तर पर लाउडस्पीकर से मुनादी कराई जा रही है।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Regional',
    author: 'विशेष संवाददाता',
    views: 11400,
    isBreaking: true, // Breaking News long
    isTrending: true,
    tags: ['मौसम', 'मध्य प्रदेश', 'अलर्ट', 'ब्रेकिंग'],
    publishedAt: relativeDate(0.2),
    updatedAt: relativeDate(0.2),
    workflow: { status: 'published', publishedAt: relativeDate(0.2) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(110), reporterName: 'विशेष संवाददाता' },
    seo: { metaTitle: 'मध्य प्रदेश मौसम अलर्ट ब्रेकिंग', metaDescription: 'मध्य प्रदेश के शहरों में मौसम को लेकर प्रशासनिक एडवाइजरी', focusKeyword: 'मौसम अलर्ट' },
  },

  // 11. Politics / Parliament
  {
    _id: makeDemoMongoId(11),
    slug: 'demo-parliament-budget-session-key-bills',
    title: 'संसद के बजट सत्र में बुनियादी ढांचा और डिजिटल सुरक्षा विधेयकों पर सर्वदलीय चर्चा',
    summary: 'सदन में दोनों पक्षों के सदस्यों ने राष्ट्रीय राजमार्गों के विस्तार और डेटा गोपनीयता कानूनों के प्रभावी अनुपालन पर विचार रखे।',
    content: `संसद के मौजूदा सत्र के दौरान वित्त एवं उद्योग संबंधी स्थायी समितियों की सिफारिशों पर गहन विचार-विमर्श हुआ। 
विपक्ष और सत्ता पक्ष के नेताओं ने आर्थिक सुधारों की निरंतरता पर सहमति जताते हुए छोटे उद्योगों के लिए ब्याज सब्सिडी जारी रखने की मांग की। 
संसदीय कार्य मंत्री ने बताया कि आगामी सप्ताह में कई महत्वपूर्ण सुधारवादी विधेयक मतदान के लिए रखे जाएंगे।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Politics',
    author: 'संजय त्रिवेदी',
    views: 3400,
    isBreaking: false,
    isTrending: false,
    tags: ['संसद', 'राजनीति', 'बजट'],
    publishedAt: relativeDate(9),
    updatedAt: relativeDate(9),
    workflow: { status: 'published', publishedAt: relativeDate(9) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(111), reporterName: 'संजय त्रिवेदी' },
    seo: { metaTitle: 'संसद सत्र राजनीति समाचार', metaDescription: 'संसद में बजट और ढांचागत सुधारों पर चर्चा', focusKeyword: 'संसद बजट' },
  },

  // 12. Entertainment / Culture
  {
    _id: makeDemoMongoId(12),
    slug: 'demo-national-film-and-theatre-festival-indore',
    title: 'इंदौर में भारतीय रंगमंच एवं लघु फिल्म महोत्सव का रंगारंग समापन',
    summary: 'तीन दिवसीय सांस्कृतिक उत्सव में 15 राज्यों के नाट्य दलों ने सामाजिक सरोकारों पर आधारित प्रभावशाली नाटकों की प्रस्तुतियां दीं।',
    content: `कला और साहित्य के प्रति समर्पित इस तीन दिवसीय महोत्सव में देश के ख्यातिलब्ध कलाकारों ने भाग लिया। 
अंतिम दिन मंचित नाटक 'उजाले की तलाश' ने दर्शकों को भावविभोर कर दिया। 
आयोजकों ने बताया कि अगले वर्ष से इस महोत्सव में मालवी और बुंदेली लोक नाट्य विधाओं के लिए विशेष प्रतियोगिता वर्ग जोड़ा जाएगा।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Entertainment',
    author: 'नेहा कश्यप',
    views: 2850,
    isBreaking: false,
    isTrending: false,
    tags: ['मनोरंजन', 'इंदौर', 'नाटक', 'संस्कृति'],
    publishedAt: relativeDate(10),
    updatedAt: relativeDate(10),
    workflow: { status: 'published', publishedAt: relativeDate(10) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(112), reporterName: 'नेहा कश्यप' },
    seo: { metaTitle: 'इंदौर रंगमंच महोत्सव', metaDescription: 'इंदौर में राष्ट्रीय रंगमंच एवं लघु फिल्म उत्सव', focusKeyword: 'रंगमंच इंदौर' },
  },

  // 13. International News
  {
    _id: makeDemoMongoId(13),
    slug: 'demo-global-climate-conference-renewable-energy',
    title: 'वैश्विक जलवायु शिखर सम्मेलन: नवीकरणीय ऊर्जा विस्तार पर अंतरराष्ट्रीय सहमति',
    summary: 'संयुक्त राष्ट्र जलवायु वार्ता में 120 से अधिक देशों ने सौर और पवन ऊर्जा परियोजनाओं के लिए विकासशील देशों को रियायती वित्तपोषण देने पर हस्ताक्षर किए।',
    content: `अंतरराष्ट्रीय मंच पर भारत के सौर ऊर्जा नेतृत्व की व्यापक सराहना की गई है। 
सम्मेलन के घोषणापत्र में स्पष्ट किया गया है कि स्वच्छ ऊर्जा की दिशा में वैश्विक बदलाव को न्यायसंगत और समावेशी बनाया जाएगा। 
पर्यावरण विशेषज्ञों ने जीवाश्म ईंधन पर निर्भरता कम करने के लिए समयबद्ध लक्ष्यों का स्वागत किया है।`,
    image: '/placeholders/news-16x9.svg',
    category: 'International',
    author: 'आलोक कुमार',
    views: 2190,
    isBreaking: false,
    isTrending: false,
    tags: ['दुनिया', 'ऊर्जा', 'पर्यावरण'],
    publishedAt: relativeDate(11),
    updatedAt: relativeDate(11),
    workflow: { status: 'published', publishedAt: relativeDate(11) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(113), reporterName: 'आलोक कुमार' },
    seo: { metaTitle: 'वैश्विक जलवायु सम्मेलन अक्षय ऊर्जा', metaDescription: 'अंतरराष्ट्रीय जलवायु सम्मेलन में सौर ऊर्जा पर सहमति', focusKeyword: 'जलवायु सम्मेलन' },
  },

  // 14. Business / Economy
  {
    _id: makeDemoMongoId(14),
    slug: 'demo-stock-market-rally-manufacturing-growth',
    title: 'शेयर बाजार में मजबूती: मैन्युफैक्चरिंग और ऑटो सेक्टर के शेयरों में जोरदार उछाल',
    summary: 'तिमाही नतीजों और जीएसटी राजस्व में सतत वृद्धि से निवेशकों का उत्साह बढ़ा, सेंसेक्स 450 अंक चढ़कर बंद हुआ।',
    content: `घरेलू संस्थागत निवेशकों की निरंतर खरीदारी और निर्यात के सकारात्मक आंकड़ों ने बाजार को नई ऊंचाई प्रदान की। 
ऑटोमोबाइल और बैंकिंग क्षेत्र की प्रमुख कंपनियों ने उम्मीद से बेहतर प्रदर्शन किया है। 
बाजार विश्लेषकों का मानना है कि उपभोक्ता मांग मजबूत रहने से आगामी तिमाहियों में भी भारतीय बाजारों में विदेशी निवेश की रफ्तार बनी रहेगी।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Business',
    author: 'कपिल जैन',
    views: 3890,
    isBreaking: false,
    isTrending: false,
    tags: ['व्यापार', 'शेयर बाजार', 'अर्थव्यवस्था'],
    publishedAt: relativeDate(12),
    updatedAt: relativeDate(12),
    workflow: { status: 'published', publishedAt: relativeDate(12) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(114), reporterName: 'कपिल जैन' },
    seo: { metaTitle: 'शेयर बाजार मैन्युफैक्चरिंग ग्रोथ', metaDescription: 'सेंसेक्स में उछाल, ऑटो और बैंकिंग सेक्टर मजबूत', focusKeyword: 'शेयर बाजार' },
  },

  // 15. Sports / Badminton
  {
    _id: makeDemoMongoId(15),
    slug: 'demo-indore-badminton-academy-champions',
    title: 'इंदौर की बैडमिंटन अकादमी के दो युवा खिलाड़ियों का राष्ट्रीय टीम में चयन',
    summary: 'ऑल इंडिया जूनियर रैंकिंग टूर्नामेंट में स्वर्ण और कांस्य पदक जीतने के बाद खिलाड़ियों ने विश्व चैंपियनशिप के अभ्यास शिविर के लिए क्वालीफाई किया।',
    content: `मध्य प्रदेश बैडमिंटन संघ ने दोनों खिलाड़ियों को सम्मानित करते हुए उनके समर्पित कोचों की सराहना की है। 
अकादमी के प्रमुख ने बताया कि खिलाड़ियों को आधुनिक स्पोर्ट्स साइंस और फिटनेस सपोर्ट प्रदान किया जा रहा है। 
खिलाड़ियों ने अपनी सफलता का श्रेय माता-पिता के त्याग और निरंतर अभ्यास को दिया है।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Sports',
    author: 'वरिष्ठ विशेष खेल संवाददाता राजेश कुमार शर्मा',
    views: 1750,
    isBreaking: false,
    isTrending: false,
    tags: ['खेल', 'इंदौर', 'बैडमिंटन'],
    publishedAt: relativeDate(13),
    updatedAt: relativeDate(13),
    workflow: { status: 'published', publishedAt: relativeDate(13) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(107), reporterName: 'वरिष्ठ विशेष खेल संवाददाता राजेश कुमार शर्मा' },
    seo: { metaTitle: 'इंदौर बैडमिंटन राष्ट्रीय चयन', metaDescription: 'इंदौर के बैडमिंटन खिलाड़ियों का राष्ट्रीय टीम में चयन', focusKeyword: 'बैडमिंटन इंदौर' },
  },

  // 16. Regional / Ujjain Mahakal
  {
    _id: makeDemoMongoId(16),
    slug: 'demo-ujjain-mahakal-corridor-pilgrim-facilities',
    title: 'उज्जैन: श्री महाकाल महालोक में तीर्थयात्रियों के लिए नए वातानुकूलित प्रतीक्षालय शुरू',
    summary: 'सावन और आगामी त्योहारों को ध्यान में रखते हुए मंदिर प्रबंधन समिति ने सुलभ दर्शन और ई-कार्ट सेवाओं का विस्तार किया।',
    content: `विश्व प्रसिद्ध श्री महाकालेश्वर ज्योतिर्लिंग में दर्शनार्थियों की लगातार बढ़ती संख्या को देखते हुए सुविधाओं को विश्वस्तरीय बनाया जा रहा है। 
नवनिर्मित प्रतीक्षालय परिसर में पेयजल, विश्राम स्थल, आपातकालीन प्राथमिक चिकित्सा केंद्र और डिजिटल डिस्प्ले स्क्रीन की व्यवस्था की गई है। 
वरिष्ठ नागरिकों और दिव्यांगों के लिए निःशुल्क बैटरी चालित वाहनों की संख्या बढ़ाकर 50 कर दी गई है।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Regional',
    author: 'महेश पटेरिया',
    views: 8900,
    isBreaking: false,
    isTrending: true,
    tags: ['उज्जैन', 'महाकाल', 'तीर्थयात्रा', 'मध्य प्रदेश'],
    publishedAt: relativeDate(14),
    updatedAt: relativeDate(14),
    workflow: { status: 'published', publishedAt: relativeDate(14) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(115), reporterName: 'महेश पटेरिया' },
    seo: { metaTitle: 'उज्जैन महाकाल महालोक सुविधाएं', metaDescription: 'उज्जैन में महाकाल मंदिर में नए तीर्थयात्री प्रतीक्षालय', focusKeyword: 'उज्जैन महाकाल' },
  },

  // 17. Technology / Cybersecurity
  {
    _id: makeDemoMongoId(17),
    slug: 'demo-digital-banking-security-advisory',
    title: 'ऑनलाइन फ्रॉड से बचाव के लिए साइबर सेल की नई गाइडलाइन जारी',
    summary: 'संदिग्ध एपीके फाइल्स और फर्जी बैंकिंग कॉल से सतर्क रहने के लिए हेल्पलाइन नंबर और शिकायत दर्ज कराने की सरल प्रक्रिया साझा की गई।',
    content: `साइबर अपराध शाखा ने चेतावनी दी है कि अज्ञात लिंक पर क्लिक करने या अनाधिकृत ऐप्स इंस्टॉल करने से बैंक खाते से अनधिकृत निकासी का जोखिम हो सकता है। 
पुलिस ने नागरिकों से आग्रह किया है कि किसी भी वित्तीय धोखाधड़ी की स्थिति में तत्काल हेल्पलाइन 1930 पर संपर्क करें। 
बैंकिंग संस्थानों को भी दो-स्तरीय सत्यापन को और अधिक सुदृढ़ बनाने के निर्देश दिए गए हैं।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Technology',
    author: 'समीर खान',
    views: 4120,
    isBreaking: false,
    isTrending: false,
    tags: ['साइबर सुरक्षा', 'टेक्नोलॉजी', 'डिजिटल'],
    publishedAt: relativeDate(15),
    updatedAt: relativeDate(15),
    workflow: { status: 'published', publishedAt: relativeDate(15) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(108), reporterName: 'समीर खान' },
    seo: { metaTitle: 'साइबर सुरक्षा एडवाइजरी ऑनलाइन बैंकिंग', metaDescription: 'ऑनलाइन फ्रॉड से बचाव के लिए साइबर सेल की गाइडलाइन', focusKeyword: 'साइबर सुरक्षा' },
  },

  // 18. Politics / State Policy
  {
    _id: makeDemoMongoId(18),
    slug: 'demo-mp-cabinet-rural-water-supply-scheme',
    title: 'कैबिनेट का बड़ा फैसला: मालवा-निमाड़ के 1200 गांवों में नल-जल योजना के लिए नई स्वीकृति',
    summary: 'ग्रामीण क्षेत्रों में शुद्ध पेयजल की आपूर्ति सुनिश्चित करने के लिए 1800 करोड़ रुपये की पुनरीक्षित जल जीवन मिशन परियोजनाओं को हरी झंडी।',
    content: `मुख्यमंत्री की अध्यक्षता में संपन्न कैबिनेट बैठक में पेयजल और सिंचाई से जुड़ी कई महत्वपूर्ण योजनाओं को मंजूरी दी गई। 
जल निगम के माध्यम से नर्मदा और चंबल बेसिन के बांधों से पाइपलाइन बिछाकर हर घर तक नल से जल पहुंचाने का कार्य प्राथमिकता पर पूरा किया जाएगा। 
परियोजना की निगरानी के लिए ऑनलाइन डैशबोर्ड और वाटर क्वालिटी टेस्टिंग लैब्स स्थापित की जाएंगी।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Politics',
    author: 'संजय त्रिवेदी',
    views: 2980,
    isBreaking: false,
    isTrending: false,
    tags: ['मध्य प्रदेश', 'राजनीति', 'कैबिनेट', 'जल योजना'],
    publishedAt: relativeDate(16),
    updatedAt: relativeDate(16),
    workflow: { status: 'published', publishedAt: relativeDate(16) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(111), reporterName: 'संजय त्रिवेदी' },
    seo: { metaTitle: 'मध्य प्रदेश नल जल योजना कैबिनेट फैसला', metaDescription: 'मालवा निमाड़ के गांवों के लिए पेयजल परियोजना को मंजूरी', focusKeyword: 'मध्य प्रदेश कैबिनेट' },
  },

  // 19. International / Space
  {
    _id: makeDemoMongoId(19),
    slug: 'demo-space-exploration-satellite-launch',
    title: 'इसरो का नया मील का पत्थर: स्वदेशी नेविगेशन उपग्रह कक्षा में सफलतापूर्वक स्थापित',
    summary: 'श्रीहरिकोटा अंतरिक्ष केंद्र से प्रक्षेपित रॉकेट ने अगली पीढ़ी के उपग्रह को उसकी सटीक कक्षा में स्थापित कर संचार तंत्र को नई शक्ति दी।',
    content: `भारतीय अंतरिक्ष अनुसंधान संगठन के वैज्ञानिकों ने एक बार फिर दुनिया में भारत का डंका बजाया है। 
मिशन कंट्रोल सेंटर में सफल प्रक्षेपण की घोषणा होते ही वैज्ञानिकों ने एक-दूसरे को बधाई दी। 
यह उपग्रह भारतीय उपमहाद्वीप में अत्यंत सटीक जीपीएस और समुद्री नेविगेशन सेवाएं उपलब्ध कराने में सक्षम होगा। 
प्रधानमंत्री ने पूरी टीम को इस उत्कृष्ट वैज्ञानिक उपलब्धि के लिए बधाई दी है।`,
    image: '/placeholders/news-16x9.svg',
    category: 'International',
    author: 'आलोक कुमार',
    views: 5670,
    isBreaking: false,
    isTrending: true,
    tags: ['इसरो', 'अंतरिक्ष', 'टेक्नोलॉजी', 'भारत'],
    publishedAt: relativeDate(17),
    updatedAt: relativeDate(17),
    workflow: { status: 'published', publishedAt: relativeDate(17) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(113), reporterName: 'आलोक कुमार' },
    seo: { metaTitle: 'इसरो नेविगेशन उपग्रह सफल प्रक्षेपण', metaDescription: 'श्रीहरिकोटा से स्वदेशी नेविगेशन उपग्रह कक्षा में स्थापित', focusKeyword: 'इसरो उपग्रह' },
  },

  // 20. Entertainment / Literature
  {
    _id: makeDemoMongoId(20),
    slug: 'demo-bhopal-national-hindi-book-fair',
    title: 'भोपाल में राष्ट्रीय पुस्तक मेले की शुरुआत, युवाओं में साहित्य के प्रति गहरा उत्साह',
    summary: '10 दिवसीय पुस्तक मेले में 250 से अधिक प्रकाशकों के स्टॉल लगे, कहानी लेखन और कविता पाठ की विशेष कार्यशालाओं का आयोजन।',
    content: `राजधानी भोपाल के लाल परेड मैदान पर सजे पुस्तक मेले में पहले ही दिन हजारों पुस्तक प्रेमियों की भीड़ उमड़ पड़ी। 
युवा पाठकों में इतिहास, दर्शन और समकालीन कविता संग्रहों के प्रति खासा रुझान देखने को मिला। 
मेले के दौरान दैनिक परिचर्चाएं आयोजित की जा रही हैं, जिनमें देश के जाने-माने साहित्यकार पाठकों से सीधे संवाद कर रहे हैं। 
बच्चों के लिए सचित्र बाल साहित्य और विज्ञान कॉर्नर विशेष रूप से लोकप्रिय बने हुए हैं।`,
    image: '/placeholders/news-16x9.svg',
    category: 'Entertainment',
    author: 'नेहा कश्यप',
    views: 2110,
    isBreaking: false,
    isTrending: false,
    tags: ['साहित्य', 'पुस्तक मेला', 'मध्य प्रदेश', 'मनोरंजन'],
    publishedAt: relativeDate(18),
    updatedAt: relativeDate(18),
    workflow: { status: 'published', publishedAt: relativeDate(18) },
    editorial: { storyType: 'standard', factCheckStatus: 'verified' },
    reporterMeta: { reporterId: makeDemoMongoId(112), reporterName: 'नेहा कश्यप' },
    seo: { metaTitle: 'भोपाल राष्ट्रीय पुस्तक मेला', metaDescription: 'भोपाल में 10 दिवसीय राष्ट्रीय पुस्तक मेले का आयोजन', focusKeyword: 'पुस्तक मेला' },
  },
];

export const DEMO_ARTICLE_IDS: string[] = DEMO_ARTICLES.map((a) => a._id);
