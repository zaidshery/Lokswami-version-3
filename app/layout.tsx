
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import SitePageTracker from '@/components/analytics/SitePageTracker';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import AuthSync from '@/components/providers/AuthSync';
import AuthSessionProvider from '@/components/providers/SessionProvider';
import InstallAppPrompt from '@/components/ui/InstallAppPrompt';
import FullscreenFix from '@/components/providers/FullscreenFix';
import ToastProvider from '@/components/ui/toast/ToastProvider';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lokswami.com';

/*
 Human overview:
 This file is the shared shell for the entire Lokswami app. Every page uses it.
 It restores the saved theme before React hydrates, tries to recover from stale
 deploy assets, adds global metadata, and wraps the app with auth and theme providers.
 Developer note for onboarding and handoff: ZaidShery.
*/
const THEME_INIT_SCRIPT = `
(function () {
  var STORAGE_KEY = 'lokswami-storage';
  var root = document.documentElement;

  function getSystemTheme() {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function applyTheme(theme) {
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }

  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      applyTheme(getSystemTheme());
      return;
    }
    var parsed = JSON.parse(raw);
    var storedTheme = parsed && parsed.state && parsed.state.theme;
    var finalTheme = (storedTheme === 'dark' || storedTheme === 'light') ? storedTheme : getSystemTheme();
    applyTheme(finalTheme);
  } catch (error) {
    applyTheme(getSystemTheme());
  }
})();
`;
const ASSET_RECOVERY_SCRIPT = `
(function () {
  var STORAGE_KEY = 'lokswami-asset-recovery';
  var CACHE_BUST_PARAM = '__asset_recovery';
  var RECOVERY_WINDOW_MS = 10 * 60 * 1000;
  var RECOVERY_SUCCESS_DELAY_MS = 15000;
  var MAX_ATTEMPTS = 1;
  var DURABLE_CACHE_PREFIXES = ['lokswami-epaper-offline-'];
  var chunkErrorPattern =
    /ChunkLoadError|Loading chunk [0-9]+ failed|CSS_CHUNK_LOAD_FAILED|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script|MIME type.*text\\/(?:html|plain)|strict MIME type checking/i;
  var recoveryInFlight = false;

  function readState() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { attempts: 0, timestamp: 0 };
      }

      var parsed = JSON.parse(raw);
      var attempts = Number(parsed && parsed.attempts) || 0;
      var timestamp = Number(parsed && parsed.timestamp) || 0;

      if (!timestamp || Date.now() - timestamp > RECOVERY_WINDOW_MS) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return { attempts: 0, timestamp: 0 };
      }

      return { attempts: attempts, timestamp: timestamp };
    } catch (error) {
      return { attempts: 0, timestamp: 0 };
    }
  }

  function writeState(attempts) {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          attempts,
          timestamp: Date.now(),
          path: window.location.pathname,
        })
      );
    } catch (error) {}
  }

  function clearState() {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {}
  }

  function settleAll(promises) {
    return Promise.all(
      promises.map(function (promise) {
        return Promise.resolve(promise).then(
          function () {},
          function () {}
        );
      })
    );
  }

  function runSafely(task) {
    try {
      return Promise.resolve(task());
    } catch (error) {
      return Promise.resolve();
    }
  }

  function clearOriginCaches() {
    if (!('caches' in window)) {
      return Promise.resolve();
    }

    return window.caches.keys().then(function (cacheKeys) {
      return settleAll(
        cacheKeys.filter(function (key) {
          return !DURABLE_CACHE_PREFIXES.some(function (prefix) {
            return key.indexOf(prefix) === 0;
          });
        }).map(function (key) {
          return window.caches.delete(key);
        })
      );
    });
  }

  function unregisterServiceWorkers() {
    if (!('serviceWorker' in navigator)) {
      return Promise.resolve();
    }

    return navigator.serviceWorker.getRegistrations().then(function (registrations) {
      return settleAll(
        registrations.map(function (registration) {
          return registration.unregister();
        })
      );
    });
  }

  function cleanupRecoveryParam() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has(CACHE_BUST_PARAM)) {
        return;
      }

      url.searchParams.delete(CACHE_BUST_PARAM);
      var cleanUrl = url.pathname + url.search + url.hash || '/';
      window.history.replaceState(window.history.state, '', cleanUrl);
    } catch (error) {}
  }

  function buildRecoveryUrl() {
    var url = new URL(window.location.href);
    url.searchParams.set(CACHE_BUST_PARAM, String(Date.now()));
    return url.toString();
  }

  function recoverFromStaleAssets() {
    var state = readState();
    if (recoveryInFlight || state.attempts >= MAX_ATTEMPTS) {
      return;
    }

    recoveryInFlight = true;
    writeState(state.attempts + 1);
    var nextUrl = buildRecoveryUrl();

    settleAll([
      runSafely(unregisterServiceWorkers),
      runSafely(clearOriginCaches),
    ]).then(function () {
      window.location.replace(nextUrl);
    });
  }

  window.addEventListener(
    'load',
    function () {
      try {
        var url = new URL(window.location.href);
        if (!url.searchParams.has(CACHE_BUST_PARAM)) {
          return;
        }

        window.setTimeout(function () {
          if (!recoveryInFlight) {
            clearState();
            cleanupRecoveryParam();
          }
        }, RECOVERY_SUCCESS_DELAY_MS);
      } catch (error) {}
    },
    { once: true }
  );

  window.addEventListener(
    'error',
    function (event) {
      var target = event.target;
      var tagName =
        target && target.tagName ? String(target.tagName).toUpperCase() : '';

      if (tagName === 'SCRIPT' || tagName === 'LINK') {
        var assetUrl = target.src || target.href || '';
        if (
          assetUrl.indexOf('/_next/static/') !== -1 ||
          assetUrl.indexOf('/next/static/') !== -1 ||
          assetUrl.indexOf('/__next_static__/') !== -1
        ) {
          recoverFromStaleAssets();
          return;
        }
      }

      var message = String(event.message || '');
      var filename = String(event.filename || '');
      if (
        chunkErrorPattern.test(message) ||
        filename.indexOf('/_next/static/') !== -1 ||
        filename.indexOf('/next/static/') !== -1 ||
        filename.indexOf('/__next_static__/') !== -1
      ) {
        recoverFromStaleAssets();
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var message = String((reason && reason.message) || reason || '');
    if (chunkErrorPattern.test(message)) {
      recoverFromStaleAssets();
    }
  });
})();
`;
function readPublicAnalyticsId(value: string | undefined, pattern: RegExp) {
  const normalized = String(value || '').trim().toUpperCase();
  return pattern.test(normalized) ? normalized : '';
}

const googleTagManagerId = readPublicAnalyticsId(
  process.env.NEXT_PUBLIC_GTM_ID,
  /^GTM-[A-Z0-9]+$/
);
const googleAnalyticsMeasurementId = readPublicAnalyticsId(
  process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
  /^G-[A-Z0-9]+$/
);
const loadDirectGoogleAnalytics = Boolean(
  googleAnalyticsMeasurementId && !googleTagManagerId
);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Lokswami - \u092d\u093e\u0930\u0924 \u0915\u093e \u0938\u092c\u0938\u0947 \u0935\u093f\u0936\u094d\u0935\u0938\u0928\u0940\u092f \u0938\u092e\u093e\u091a\u093e\u0930 \u092a\u094d\u0932\u0947\u091f\u092b\u0949\u0930\u094d\u092e',
  applicationName: 'Lokswami',
  description:
    '\u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902, \u0935\u0940\u0921\u093f\u092f\u094b, \u0908-\u092a\u0947\u092a\u0930 \u0914\u0930 \u092c\u0939\u0941\u0924 \u0915\u0941\u091b\u0964 India\'s most trusted digital news platform with latest news, videos, and e-paper.',
  keywords:
    'Hindi news, \u092d\u093e\u0930\u0924\u0940\u092f \u0938\u092e\u093e\u091a\u093e\u0930, \u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902, breaking news, Lokswami, \u0932\u094b\u0915\u0938\u094d\u0935\u093e\u092e\u0940',
  authors: [{ name: 'Lokswami' }],
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo-app-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo-app-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lokswami',
  },
  openGraph: {
    title: 'Lokswami - \u092d\u093e\u0930\u0924 \u0915\u093e \u0938\u092c\u0938\u0947 \u0935\u093f\u0936\u094d\u0935\u0938\u0928\u0940\u092f \u0938\u092e\u093e\u091a\u093e\u0930 \u092a\u094d\u0932\u0947\u091f\u092b\u0949\u0930\u094d\u092e',
    description:
      '\u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902, \u0935\u0940\u0921\u093f\u092f\u094b, \u0908-\u092a\u0947\u092a\u0930 \u0914\u0930 \u092c\u0939\u0941\u0924 \u0915\u0941\u091b\u0964',
    type: 'website',
    locale: 'hi_IN',
    images: [
      {
        url: '/lokswami-share-preview.png',
        width: 1200,
        height: 630,
        alt: 'Lokswami - \u092d\u093e\u0930\u0924 \u0915\u093e \u0938\u092c\u0938\u0947 \u0935\u093f\u0936\u094d\u0935\u0938\u0928\u0940\u092f \u0938\u092e\u093e\u091a\u093e\u0930 \u092a\u094d\u0932\u0947\u091f\u092b\u0949\u0930\u094d\u092e',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lokswami - \u092d\u093e\u0930\u0924 \u0915\u093e \u0938\u092c\u0938\u0947 \u0935\u093f\u0936\u094d\u0935\u0938\u0928\u0940\u092f \u0938\u092e\u093e\u091a\u093e\u0930 \u092a\u094d\u0932\u0947\u091f\u092b\u0949\u0930\u094d\u092e',
    description:
      '\u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902, \u0935\u0940\u0921\u093f\u092f\u094b, \u0908-\u092a\u0947\u092a\u0930 \u0914\u0930 \u092c\u0939\u0941\u0924 \u0915\u0941\u091b\u0964',
    images: ['/lokswami-share-preview.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#e72129',
};

/** Renders the shared HTML shell and top-level client providers. */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hi" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- Shared App Router font shell. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700;800;900&family=Noto+Sans+Devanagari:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <script id="lokswami-theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script
          id="lokswami-asset-recovery"
          dangerouslySetInnerHTML={{ __html: ASSET_RECOVERY_SCRIPT }}
        />
        {googleTagManagerId ? (
          <Script id="lokswami-google-tag-manager" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${googleTagManagerId}');`}
          </Script>
        ) : null}
        {loadDirectGoogleAnalytics ? (
          <>
            <Script
              id="lokswami-google-analytics-loader"
              src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="lokswami-google-analytics" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];
window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
window.gtag('js',new Date());
window.gtag('config','${googleAnalyticsMeasurementId}',{
  send_page_view:false,
  anonymize_ip:true
});`}
            </Script>
          </>
        ) : null}
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-white text-gray-900 antialiased transition-colors duration-300 dark:bg-gray-950 dark:text-gray-50"
      >
        {googleTagManagerId ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${googleTagManagerId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        ) : null}
        <AuthSessionProvider>
          <ThemeProvider>
            <ToastProvider>
              <AuthSync />
              <FullscreenFix />
              <SitePageTracker />
              {children}
              <InstallAppPrompt />
            </ToastProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
