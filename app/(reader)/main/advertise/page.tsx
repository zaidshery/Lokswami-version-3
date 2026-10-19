'use client';

import { Megaphone, MonitorPlay, Newspaper, Target, Users } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import { COMPANY_INFO } from '@/lib/constants/company';
import AdvertiseInquiryForm from '@/components/advertising/AdvertiseInquiryForm';

const COPY = {
  en: {
    tag: 'Advertise',
    title: 'Advertise with Lokswami',
    subtitle:
      'Reach a high-intent Hindi news audience across web, mobile, video, and e-paper placements.',
    inventoryTitle: 'Ad Inventory',
    whyTitle: 'Why Brands Choose Us',
    contactTitle: 'Campaign Enquiries',
    contactText: 'Share your budget, target city, and campaign goals. We will respond quickly.',
    startNow: 'Start Campaign',
    inv1Title: 'Display Ads',
    inv1Text: 'Homepage, section pages, and article pages with high daily visibility.',
    inv2Title: 'Sponsored Stories',
    inv2Text: 'Native brand storytelling with editorial-style presentation.',
    inv3Title: 'Video Placements',
    inv3Text: 'Pre-roll and in-feed placements across short and long video content.',
    why1: 'Strong regional + national audience mix.',
    why2: 'Contextual placements by category and language.',
    why3: 'Fast campaign execution and reporting support.',
  },
  hi: {
    tag: '\u0935\u093f\u091c\u094d\u091e\u093e\u092a\u0928',
    title: '\u0932\u094b\u0915\u0938\u094d\u0935\u093e\u092e\u0940 \u092a\u0930 \u0935\u093f\u091c\u094d\u091e\u093e\u092a\u0928 \u0915\u0930\u0947\u0902',
    subtitle:
      '\u0935\u0947\u092c, \u092e\u094b\u092c\u093e\u0907\u0932, \u0935\u0940\u0921\u093f\u092f\u094b \u0914\u0930 \u0908-\u092a\u0947\u092a\u0930 \u092a\u094d\u0932\u0947\u0938\u092e\u0947\u0902\u091f\u094d\u0938 \u0915\u0947 \u091c\u0930\u093f\u090f \u0939\u093f\u0902\u0926\u0940 \u0928\u094d\u092f\u0942\u091c \u0911\u0921\u093f\u092f\u0902\u0938 \u0924\u0915 \u092a\u0939\u0941\u0902\u091a\u093f\u090f\u0964',
    inventoryTitle: '\u090f\u0921 \u0907\u0928\u094d\u0935\u0947\u0902\u091f\u0930\u0940',
    whyTitle: '\u092c\u094d\u0930\u093e\u0902\u0921\u094d\u0938 \u0939\u092e\u0947\u0902 \u0915\u094d\u092f\u094b\u0902 \u091a\u0941\u0928\u0924\u0947 \u0939\u0948\u0902',
    contactTitle: '\u0915\u0948\u092e\u094d\u092a\u0947\u0928 \u0907\u0928\u094d\u0915\u094d\u0935\u093e\u092f\u0930\u0940',
    contactText: '\u0905\u092a\u0928\u093e \u092c\u091c\u091f, \u0932\u0915\u094d\u0937\u094d\u092f \u0936\u0939\u0930 \u0914\u0930 \u0917\u094b\u0932\u094d\u0938 \u0938\u093e\u091d\u093e \u0915\u0930\u0947\u0902\u0964 \u0939\u092e \u091c\u0932\u094d\u0926 \u0930\u093f\u092a\u094d\u0932\u093e\u0908 \u0915\u0930\u0947\u0902\u0917\u0947\u0964',
    startNow: '\u0915\u0948\u092e\u094d\u092a\u0947\u0928 \u0936\u0941\u0930\u0942 \u0915\u0930\u0947\u0902',
    inv1Title: '\u0921\u093f\u0938\u094d\u092a\u094d\u0932\u0947 \u090f\u0921\u094d\u0938',
    inv1Text: '\u0939\u094b\u092e\u092a\u0947\u091c, \u0915\u0948\u091f\u0947\u0917\u0930\u0940 \u0914\u0930 \u0906\u0930\u094d\u091f\u093f\u0915\u0932 \u092a\u0947\u091c\u0947\u0938 \u092a\u0930 \u092a\u094d\u0930\u092e\u0941\u0916 \u092a\u094d\u0932\u0947\u0938\u092e\u0947\u0902\u091f\u0964',
    inv2Title: '\u0938\u094d\u092a\u0949\u0928\u094d\u0938\u0930\u094d\u0921 \u0938\u094d\u091f\u094b\u0930\u0940\u091c',
    inv2Text: '\u0928\u0947\u091f\u093f\u0935 \u0915\u0902\u091f\u0947\u0902\u091f \u0915\u0947 \u0930\u0942\u092a \u092e\u0947\u0902 \u092c\u094d\u0930\u093e\u0902\u0921 \u0915\u0940 \u0915\u0939\u093e\u0928\u0940\u0964',
    inv3Title: '\u0935\u0940\u0921\u093f\u092f\u094b \u092a\u094d\u0932\u0947\u0938\u092e\u0947\u0902\u091f\u094d\u0938',
    inv3Text: '\u0936\u0949\u0930\u094d\u091f\u094d\u0938 \u0914\u0930 \u0932\u0949\u0902\u0917 \u0935\u0940\u0921\u093f\u092f\u094b \u092e\u0947\u0902 \u092a\u094d\u0930\u0940-\u0930\u094b\u0932 \u0914\u0930 \u0907\u0928-\u092b\u0940\u0921 \u092a\u094d\u0932\u0947\u0938\u092e\u0947\u0902\u091f\u094d\u0938\u0964',
    why1: '\u092e\u091c\u092c\u0942\u0924 \u0930\u0940\u091c\u0928\u0932 + \u0928\u0947\u0936\u0928\u0932 \u0911\u0921\u093f\u092f\u0902\u0938 \u092e\u093f\u0915\u094d\u0938\u0964',
    why2: '\u0915\u0948\u091f\u0947\u0917\u0930\u0940 \u0914\u0930 \u092d\u093e\u0937\u093e \u0906\u0927\u093e\u0930\u093f\u0924 \u0915\u0902\u091f\u0947\u0915\u094d\u0938\u094d\u091f\u0941\u0905\u0932 \u091f\u093e\u0930\u094d\u0917\u0947\u091f\u093f\u0902\u0917\u0964',
    why3: '\u092b\u093e\u0938\u094d\u091f \u090f\u0915\u094d\u091c\u0940\u0915\u094d\u092f\u0942\u0936\u0928 \u0914\u0930 \u0930\u093f\u092a\u094b\u0930\u094d\u091f\u093f\u0902\u0917 \u0938\u092a\u094b\u0930\u094d\u091f\u0964',
  },
};

export default function AdvertisePage() {
  const { language } = useAppStore();
  const t = COPY[language];

  return (
    <section className="space-y-4 sm:space-y-5">
      <div className="cnp-surface p-5 sm:p-6">
        <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-500 dark:text-red-300">
          {t.tag}
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">{t.title}</h1>
        <p className="mt-2 max-w-4xl text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">{t.subtitle}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="cnp-surface p-5 sm:p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 sm:text-xl">{t.inventoryTitle}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <MonitorPlay className="h-5 w-5 text-orange-500" />
              <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.inv1Title}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t.inv1Text}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <Newspaper className="h-5 w-5 text-orange-500" />
              <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.inv2Title}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t.inv2Text}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <Megaphone className="h-5 w-5 text-orange-500" />
              <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.inv3Title}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t.inv3Text}</p>
            </div>
          </div>
        </div>

        <aside className="cnp-surface p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 sm:text-xl">{t.whyTitle}</h2>
          <ul className="mt-4 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <li className="flex items-start gap-2"><Target className="mt-0.5 h-4 w-4 text-orange-500" />{t.why1}</li>
            <li className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 text-orange-500" />{t.why2}</li>
            <li className="flex items-start gap-2"><Megaphone className="mt-0.5 h-4 w-4 text-orange-500" />{t.why3}</li>
          </ul>
        </aside>
      </div>

      <div className="cnp-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 sm:text-xl">{t.contactTitle}</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">{t.contactText}</p>

        <AdvertiseInquiryForm />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <a href={`mailto:${COMPANY_INFO.contact.email}?subject=Advertising%20Enquiry`} className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 text-sm font-medium text-zinc-800 transition hover:border-orange-400 hover:text-orange-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:text-orange-400">
            {COMPANY_INFO.contact.email}
          </a>
          <a href={COMPANY_INFO.contact.phoneHref} className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 text-sm font-medium text-zinc-800 transition hover:border-orange-400 hover:text-orange-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:text-orange-400">
            {COMPANY_INFO.contact.phoneDisplay}
          </a>
        </div>

      </div>
    </section>
  );
}
