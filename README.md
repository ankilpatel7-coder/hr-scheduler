# Shiftwork — HR Scheduler v2

A scheduling, clock-in, and HR app for small-to-mid-size operations. Multi-location, selfie-verified clock-in, draft/publish workflow, time-off, shift swaps, exports, and email notifications.

Built with Next.js 14, Prisma, PostgreSQL, NextAuth, and Tailwind. Deploys to Vercel for free (within Hobby tier limits).

## What's new in v2

- **Multi-location**: assign employees to one or more locations; filter the schedule by location.
- **Draft / publish workflow**: shifts are drafts until you hit Publish, which emails affected employees their schedule.
- **Wage tracking & labor cost**: hourly wages on each employee feed into pay totals on timesheets.
- **Excel & PDF exports**: CSV, XLSX (Excel), and PDF exports from the timesheets page.
- **Manager timesheet edits**: fix forgotten clock-outs without breaking the audit trail.
- **Availability**: employees set a weekly availability pattern.
- **Time-off requests**: submit, approve, deny — all with email notifications.
- **Shift swaps**: employees offer their shifts; coworkers claim; managers approve.
- **Password reset**: self-service via email.
- **Shift reminders**: cron sends an email 1 hour before each shift.
- **Overtime alerts**: weekly cron emails managers when employees are at or near 40 hours.

## Roles

- **ADMIN** — full access including locations and employee management.
- **MANAGER** — schedules, approves time-off and swaps, edits timesheets.
- **EMPLOYEE** — clocks in, sees published shifts, sets availability, requests time off, offers/claims swaps.

## Quick start (local)

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3000
npx prisma db push
npm run dev
```

Visit http://localhost:3000. The first user to sign up at `/signup` becomes the admin.

## Required environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (Neon, Supabase, etc.) |
| `NEXTAUTH_SECRET` | yes | Long random string |
| `NEXTAUTH_URL` | yes | e.g. `https://yourapp.vercel.app` (no trailing slash) |
| `RESEND_API_KEY` | optional | Without it, emails are logged only — password reset won't work |
| `EMAIL_FROM` | recommended | e.g. `Shiftwork <onboarding@resend.dev>` |
| `CRON_SECRET` | recommended | Long random string; protects the cron endpoints |

## Deploying to Vercel

1. Push to GitHub.
2. Import the repo in Vercel.
3. Add the environment variables above in Project Settings → Environment Variables.
4. Deploy. Vercel will run `prisma generate` and `next build` automatically.
5. After first deploy, run `npx prisma db push` from your local machine **once** with the production `DATABASE_URL` to set up the schema.

### Setting up email (Resend)

1. Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month).
2. Copy your API key.
3. In Vercel, add `RESEND_API_KEY=...` and redeploy.
4. Use `EMAIL_FROM=Shiftwork <onboarding@resend.dev>` to test, then add and verify your own domain when ready.

### Cron jobs

`vercel.json` defines two cron jobs:

- `*/10 * * * *` — `/api/cron/shift-reminders` — runs every 10 minutes, emails employees about shifts starting in ~1 hour.
- `0 14 * * 4` — `/api/cron/overtime-alerts` — runs Thursdays at 2pm UTC (10am ET), emails managers about employees near 40 hours.

Vercel Hobby includes daily cron up to a couple times a day; the every-10-minutes schedule requires Pro. If you stay on Hobby, change the reminders cron to `0 * * * *` (hourly) — it'll still mostly work but reminders may go out 0–60 min early.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Prisma** ORM + **PostgreSQL**
- **NextAuth** (Credentials provider, JWT)
- **Tailwind CSS**
- **Resend** for email
- **ExcelJS** for .xlsx, **jsPDF** for .pdf

## License

Proprietary — internal use.
