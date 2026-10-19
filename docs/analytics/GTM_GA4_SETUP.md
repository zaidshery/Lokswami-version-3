# GTM and GA4 setup

Lokswami supports one performance-safe Google analytics loader at a time:

- Preferred production mode: load Google Tag Manager and configure the GA4 Google tag inside that container.
- Direct fallback mode: load GA4 directly only when no GTM container ID is configured.

This avoids downloading duplicate Google tag loaders and avoids duplicate page-view events.

## Production setup

1. In GA4, create or select the Lokswami web data stream and copy its `G-...` measurement ID.
2. In Google Tag Manager, copy the web container's `GTM-...` ID.
3. Set `NEXT_PUBLIC_GTM_ID=GTM-...` in the production environment. Leave `NEXT_PUBLIC_GA4_MEASUREMENT_ID` empty in this preferred mode.
4. In the GTM container, create one **Google tag** with the GA4 `G-...` ID and disable its automatic page view (`send_page_view: false`). Map the site's `page_view` data-layer event to one GA4 page-view event. Disable duplicate automatic/history page-view triggers, including enhanced-measurement history tracking if enabled.
5. Use GTM's consent APIs/template for container consent handling. All analytics tags must require analytics consent; advertising tags must remain blocked because this site's choice grants analytics only. Preview the container, confirm one page view per reader route, and have the analytics owner review before publishing it.
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

In the GA4 web stream, inspect enhanced measurement and disable its history-change page views when using the app's route-aware page views. Validate the actual property; disabling the initial config page view alone does not certify SPA deduplication.

## Privacy and event policy

- The Google payload contains page/category/device/campaign dimensions needed for aggregate reporting.
- The app's internal pseudonymous session ID is not sent to Google.
- Do not place names, email addresses, phone numbers, article draft text, or other personal data in analytics metadata.
- `GoogleAnalyticsConsent` now blocks Google script loading until an explicit saved analytics grant. Unknown/declined/unwritable preferences do not load tags. There is no consent-bypassing noscript iframe.
- The versioned preference is `lokswami_google_analytics_consent_v1`. Readers can reopen Analytics settings. Withdrawal saves denial and reloads the document to stop previously loaded container code; storage changes also refresh other tabs.
- Direct GA4 receives consent defaults before configuration, grants analytics storage only, and disables automatic page views. First-party page telemetry remains separate; accepting Google does not duplicate that telemetry.
- No consent is inferred for advertising storage, ad user data or personalization. Configure and inspect the actual GTM container as above; local app tests cannot certify arbitrary container tags.
- In the Hostinger packaging workflow, set the public IDs as repository/environment **variables** `NEXT_PUBLIC_GTM_ID` / `NEXT_PUBLIC_GA4_MEASUREMENT_ID` before building. They are compiled into the client bundle. Changing runtime environment alone does not alter a previously built bundle. CI uses the intercepted, test-only `GTM-CITEST` ID.

Consent Mode reference: https://developers.google.com/tag-platform/security/guides/consent
