# Leadership Report Delivery On Hostinger

This guide explains how to enable Lokswami leadership briefings in production on Hostinger.

It covers:

- required environment variables
- admin-side schedule setup
- Hostinger cron setup
- email delivery setup
- verification steps

## What This Feature Does

Lokswami can now generate:

- `Daily Briefing`
- `Weekly Briefing`
- `Monthly Briefing`

Each briefing can be delivered in one of these modes:

- `Dashboard Link`
- `Markdown Export`
- `Email Summary`

Schedules are managed in:

- `/admin/analytics`

The due-run endpoint is:

- `/api/admin/analytics/briefing-schedules/run-due`

## Required Environment Variables

Minimum for secure cron execution:

```env
LEADERSHIP_REPORT_CRON_SECRET=your-long-random-secret
```

Required if you want email delivery:

```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=
LEADERSHIP_REPORT_FROM_EMAIL=
```

Recommended site URL values:

```env
NEXTAUTH_URL=https://your-domain.com
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

Notes:

- `LEADERSHIP_REPORT_FROM_EMAIL` is used first for leadership emails
- if it is empty, the system falls back to `RESEND_FROM_EMAIL`
- `LEADERSHIP_REPORT_CRON_SECRET` should be long and private

## Admin Setup

Before using cron, configure the schedules in the admin UI.

1. Sign in as `super_admin` or `admin`
2. Open:

```text
/admin/analytics
```

3. Scroll to `Delivery Center`
4. For each briefing:
   - choose `Delivery Time`
   - choose `Delivery Mode`
   - add `Recipient Emails` if using `Email Summary`
   - click `Save Schedule`

Recommended default:

- `Daily Briefing`: enabled, `08:30`, `Dashboard Link` or `Email Summary`
- `Weekly Briefing`: enabled, `09:00`, `Markdown Export` or `Email Summary`
- `Monthly Briefing`: optional, `10:00`, `Markdown Export`

## Hostinger Cron Setup

You can trigger due schedules in two supported ways.

### Option 1: Simple GET Cron

This is easiest for Hostinger if you just want a URL-based cron trigger.

```bash
wget -qO- "https://your-domain.com/api/admin/analytics/briefing-schedules/run-due?secret=YOUR_SECRET"
```

If `wget` is not available, use:

```bash
curl "https://your-domain.com/api/admin/analytics/briefing-schedules/run-due?secret=YOUR_SECRET"
```

### Option 2: Header-Based POST Cron

Use this if you prefer not to expose the secret in the URL.

```bash
curl -X POST "https://your-domain.com/api/admin/analytics/briefing-schedules/run-due" \
  -H "Authorization: Bearer YOUR_SECRET"
```

## Recommended Cron Frequency

Use one of these:

- every `15 minutes`
- every `30 minutes`

Why:

- schedules run only when due
- frequent cron checks are safe
- daily/weekly/monthly schedules will not rerun again in the same window

Example recommendation:

- run every `15 minutes`

## Example Hostinger Cron Command

For Lokswami production, it would look like:

```bash
wget -qO- "https://lokswami.com/api/admin/analytics/briefing-schedules/run-due?secret=YOUR_SECRET"
```

Replace `YOUR_SECRET` with the exact value of `LEADERSHIP_REPORT_CRON_SECRET`.

## How The Due Logic Works

The system checks whether each enabled schedule is due:

- `Daily Briefing`
  Runs once per day after its configured time
- `Weekly Briefing`
  Runs once on Monday after its configured time
- `Monthly Briefing`
  Runs once on the first day of the month after its configured time

If a schedule already ran in the current window, it will not rerun again.

## Email Delivery Rules

If a schedule uses `Email Summary`:

- at least one valid recipient email is required
- Resend must be configured
- the run will fail cleanly if email provider setup is missing

If a schedule uses:

- `Dashboard Link`
  the report is generated and logged, but not emailed
- `Markdown Export`
  the report is generated and logged, but not emailed

## Verification Steps

After setup:

1. Open `/admin/analytics`
2. Confirm schedules are saved in `Delivery Center`
3. Click `Run Now` on one schedule
4. Confirm `Recent Run History` updates
5. Trigger the cron endpoint manually
6. Confirm cron-triggered runs also appear in history

Example manual trigger in browser:

```text
https://your-domain.com/api/admin/analytics/briefing-schedules/run-due?secret=YOUR_SECRET
```

Expected JSON shape:

```json
{
  "success": true,
  "data": {
    "dueCount": 1,
    "runCount": 1,
    "results": [
      {
        "ok": true,
        "scheduleId": "daily_briefing",
        "summary": "Delivered to leader@lokswami.com.",
        "historyId": "..."
      }
    ]
  }
}
```

## Troubleshooting

### Cron returns `401 Unauthorized`

Check:

- `LEADERSHIP_REPORT_CRON_SECRET` is set in production
- the cron command uses the same secret
- there are no extra spaces in the secret

### Email delivery fails

Check:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `LEADERSHIP_REPORT_FROM_EMAIL`
- recipient email list is not empty

### Schedule does not run

Check:

- schedule is enabled in `Delivery Center`
- the configured time has already passed
- cron is running every 15 or 30 minutes
- the schedule has not already run in the current daily/weekly/monthly window

### Report is logged but not emailed

That usually means the schedule is using:

- `Dashboard Link`
or
- `Markdown Export`

Switch it to `Email Summary` if you want delivery by email.

## Suggested Production Rollout

1. Set env vars
2. Deploy
3. Open `/admin/analytics`
4. Configure one schedule first
5. Test `Run Now`
6. Test cron endpoint manually
7. Add Hostinger cron
8. Wait for one real scheduled run
9. Verify history and delivery

## Related Files

- `app/api/admin/analytics/briefing-schedules/run-due/route.ts`
- `app/api/admin/analytics/briefing-schedules/[id]/run/route.ts`
- `lib/admin/leadershipReportRunner.ts`
- `lib/storage/leadershipReportSchedulesFile.ts`
- `app/(admin)/admin/analytics/LeadershipReportDeliveryPanel.tsx`
