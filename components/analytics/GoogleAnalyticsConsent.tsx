'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store/appStore';
import { GOOGLE_CONSENT_KEY, readGoogleConsent, saveGoogleConsent, type GoogleConsent } from '@/lib/analytics/googleConsent';
import { trackClientEvent } from '@/lib/analytics/trackClient';
import { getPublicPageTrackingPayload } from './SitePageTracker';

const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

export default function GoogleAnalyticsConsent({ gtmId, ga4Id }: { gtmId: string; ga4Id: string }) {
  const pathname = usePathname() || '/';
  const language = useAppStore((state) => state.language);
  const [consent, setConsent] = useState<GoogleConsent | null>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const initialized = useRef(false);
  const lastGooglePage = useRef('');
  const enabled = Boolean(gtmId || ga4Id);
  const hi = language === 'hi';

  function initialize() {
    if (initialized.current || !enabled) return;
    window.dataLayer = window.dataLayer || [];
    // Google commands use an Arguments object, as required by the tag API.
    window.gtag = window.gtag || function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments as unknown as Record<string, unknown>);
    };
    window.gtag('consent', 'default', denied);
    window.gtag('consent', 'update', { ...denied, analytics_storage: 'granted' });
    if (gtmId) {
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    } else {
      window.gtag('js', new Date());
      window.gtag('config', ga4Id, { send_page_view: false, anonymize_ip: true });
    }
    initialized.current = true;
  }

  useEffect(() => {
    const saved = readGoogleConsent();
    if (saved === 'granted') initialize();
    setConsent(saved);
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== GOOGLE_CONSENT_KEY && event.key !== null) return;
      // A fresh document stops already-loaded container tags after withdrawal.
      window.location.reload();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
    // IDs are immutable build-time configuration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gtmId, ga4Id]);

  useEffect(() => {
    if (!enabled || consent !== 'granted' || !initialized.current) return;
    const payload = getPublicPageTrackingPayload(pathname);
    if (!payload || lastGooglePage.current === pathname) return;
    lastGooglePage.current = pathname;
    trackClientEvent({ event: 'page_view', page: pathname, ...payload, destination: 'google' });
  }, [consent, enabled, pathname]);

  function choose(value: GoogleConsent) {
    if (!saveGoogleConsent(value)) {
      setStorageError(true);
      return;
    }
    if (value === 'granted') initialize();
    setConsent(value);
    setEditing(false);
    setStorageError(false);
    if (value === 'denied' && initialized.current) {
      window.gtag?.('consent', 'update', denied);
      window.location.reload();
    }
  }

  if (!ready || !enabled || !getPublicPageTrackingPayload(pathname)) return null;

  return <>
    {consent === 'granted' && <Script
      id="lokswami-google-loader"
      src={gtmId ? `https://www.googletagmanager.com/gtm.js?id=${gtmId}` : `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
      strategy="afterInteractive"
    />}
    {consent === null || editing ? <section aria-label={hi ? 'एनालिटिक्स की अनुमति' : 'Analytics preferences'} className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[100] mx-auto max-w-xl rounded-2xl border border-zinc-300 bg-white p-4 text-sm text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-white xl:bottom-3">
      <h2 className="font-semibold">{hi ? 'एनालिटिक्स की अनुमति' : 'Analytics preferences'}</h2>
      <p className="mt-2">{hi ? 'आपकी अनुमति से हम Google Analytics का उपयोग करते हैं। इसे मना करने पर भी आप खबरें पढ़ सकते हैं। साइट की अपनी उपयोग और सुरक्षा संबंधी जानकारी अलग से दर्ज होती है।' : 'With your permission, we use Google Analytics. You can keep reading if you decline. The site also records its own usage and security information.'}</p>
      <Link href="/main/privacy" className="mt-2 inline-block underline">{hi ? 'गोपनीयता नीति' : 'Privacy policy'}</Link>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => choose('denied')} className="rounded-lg border border-zinc-400 px-4 py-2 font-semibold">{hi ? 'मना करें' : 'Decline analytics'}</button>
        <button type="button" onClick={() => choose('granted')} className="rounded-lg border border-zinc-400 px-4 py-2 font-semibold">{hi ? 'अनुमति दें' : 'Allow analytics'}</button>
      </div>
      {editing && <button type="button" onClick={() => setEditing(false)} className="mt-3 underline">{hi ? 'बंद करें' : 'Close preferences'}</button>}
      {storageError && <p role="alert" className="mt-2">{hi ? 'आपकी पसंद सेव नहीं हुई। ब्राउज़र की स्टोरेज सेटिंग जाँचें।' : 'Your preference could not be saved. Check browser storage settings.'}</p>}
    </section> : <button type="button" onClick={() => setEditing(true)} className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 z-40 rounded-lg border border-zinc-400 bg-white px-3 py-2 text-xs text-zinc-900 shadow dark:bg-zinc-900 dark:text-white xl:bottom-3">{hi ? 'एनालिटिक्स सेटिंग' : 'Analytics settings'}</button>}
  </>;
}
