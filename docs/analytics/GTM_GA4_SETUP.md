# GTM and GA4 setup

Lokswami supports one performance-safe Google analytics loader at a time:

- Preferred production mode: load Google Tag Manager and configure the GA4 Google tag inside that container.
- Direct fallback mode: load GA4 directly only when no GTM container ID is configured.

This avoids downloading duplicate Google tag loaders and avoids duplicate page-view events.

## Production setup

1. In GA4, create or select the Lokswami web data stream and copy its `G-...` measurement ID.
2. In Google Tag Manager, copy the web container's `GTM-...` ID.
3. Set `NEXT_PUBLIC_GTM_ID=GTM-...` in the production environment. Leave `NEXT_PUBLIC_GA4_MEASUREMENT_ID` empty in this preferred mode.
4. In the GTM container, create a **Google tag**, enter the GA4 `G-...` ID, and use **Initialization - All Pages** as its trigger.
5. Preview the container, confirm a single Google tag/page view, then publish it.
6. Verify the production hostname and SPA navigation in GTM Preview and GA4 Realtime. Google notes that initial data collection can take up to 30 minutes.

Official references:

- https://support.google.com/analytics/answer/15756616
- https://support.google.com/analytics/answer/14183469

## Direct GA4 fallback

If GTM is intentionally not used, leave `NEXT_PUBLIC_GTM_ID` empty and set:

```env
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

The app disables GA4's automatic page view and sends route-aware page views through the shared client tracker. Invalid IDs are ignored. Third-party scripts use Next.js `afterInteractive` loading so they do not block the initial render.

## Privacy and event policy

- The Google payload contains page/category/device/campaign dimensions needed for aggregate reporting.
- The app's internal pseudonymous session ID is not sent to Google.
- Do not place names, email addresses, phone numbers, article draft text, or other personal data in analytics metadata.
- Before enabling production analytics, connect the site's consent choice to Google Consent Mode v2 or an approved consent-management platform. Set defaults before measurement fires and update consent on the same page where the reader makes a choice.

Consent Mode reference: https://developers.google.com/tag-platform/security/guides/consent
