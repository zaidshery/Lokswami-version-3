# Advertising enquiry notifications

Accountable follow-up owner: Zaid. Confirmed notification destination: `tech.lokswami@gmail.com`.

Notifications use the existing Resend integration. A new enquiry is persisted first, to Mongo or the recovery file. Only then is a best-effort staff alert attempted. The alert includes the saved reference, the relevant queue and a link to the protected Contact Inbox. Buyer contact details, messages, budgets and location text are not included in email or analytics.

## Production configuration

Set these server-side values on the intended deployment after verifying the existing provider and sender:

```dotenv
ADVERTISE_INQUIRY_EMAIL_ENABLED=true
ADVERTISE_INQUIRY_NOTIFY_EMAIL=tech.lokswami@gmail.com
RESEND_API_KEY=<existing approved Resend key>
RESEND_FROM_EMAIL=Lokswami <verified-sender@lokswami.com>
NEXT_PUBLIC_SITE_URL=https://lokswami.com
```

The sender above is a placeholder, not a verified sender. Never put the provider key in a `NEXT_PUBLIC_` variable. Keep notifications disabled in development, tests and previews. The helper requires production mode and explicit opt-in; a preview that runs in production mode must still keep the opt-in false.

Run `npm run verify:prod-env` against the intended environment. Enabling notifications without provider configuration, with an invalid recipient, or with a non-HTTPS inbox origin fails validation. These checks do not establish sender ownership or provider delivery.

## Delivery behaviour and limitations

- A saved enquiry returns success even if notification delivery fails; returning a submission error after persistence could cause the buyer to submit duplicates.
- Fetch has a 2.5-second timeout and rejects redirects. Resend's idempotency key is derived from store and saved reference. A provider success response means accepted by the provider, not proven inbox delivery.
- Notification volume uses the existing `public_write` limiter with a dedicated operations identifier, bounding alerts to 20 per minute. Redis shares the limit across instances when configured; the existing fallback is per process. A throttled enquiry remains in the staff queue.
- Alerts are best effort, with no retry queue, delivery webhook, or automatic resend. Staff must review the Contact Inbox routinely, including its explicit Recovery file queue after database incidents. Provider bodies and buyer details are not copied into notification-failure logs.
- The caller cannot choose the notification recipient or inbox URL. Operators configure them server-side. The notification is not permission to subscribe the buyer to marketing.

## Acceptance before activation

1. Deploy the independently reviewed commit and verify its build identity.
2. Confirm provider credentials, the verified sender and the destination in the actual hosting environment.
3. Submit one controlled enquiry with the user's approval; exclude it from business reporting. Confirm one saved record, one provider-accepted alert, and receipt in `tech.lokswami@gmail.com`.
4. Follow its link as authorised staff, select the stated queue, and record Zaid's next action/date. Confirm a failed/throttled notification does not remove the enquiry or expose it to readers.
5. Record the result, build SHA and provider delivery evidence before calling notifications operational.

No live notification is certified by local tests or this document. Hosting/CMS access and runtime activation remain separate gates.
