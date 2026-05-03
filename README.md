# Shiftwork — HR Scheduler

[![Version](https://img.shields.io/github/v/release/ankilpatel7-coder/hr-scheduler?label=version&color=blue)](https://github.com/ankilpatel7-coder/hr-scheduler/releases)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![License](https://img.shields.io/badge/license-Proprietary-lightgrey)](#license)

**Live demo:** <https://hr-scheduler-2r1u.vercel.app>

A scheduling, clock-in, and HR app for small-to-mid-size operations.
Multi-location, selfie-verified clock-in with GPS, draft/publish workflow,
time-off, shift swaps, exports, and email notifications.

Built with Next.js 14, Prisma, PostgreSQL, NextAuth, and Tailwind. Deploys to
Vercel within Hobby tier limits.

## What's new in v11

- **Selfie & GPS verification** on the timesheets page and the dashboard's
  "Today's roster". Click the camera icon on any row to see the clock-in/out
  selfies side by side with the captured GPS coordinates and the distance from
  the configured worksite. Photos are fetched on demand via a dedicated
  `/api/clock-entries/[id]/selfie` endpoint so the timesheet list stays light.

## Roles

Four roles: **ADMIN**, **MANAGER**, **LEAD**, **EMPLOYEE**.

- **ADMIN** — full access including locations, employee management, wage data,
  permanent deletion (after 1-year archive), database cleanup.
- **MANAGER** — schedules, approves time-off and swaps, edits timesheets,
  manages staff at their assigned location(s). Cannot see wage data.
- **LEAD** — same permissions as EMPLOYEE; label only.
- **EMPLOYEE** — clocks in (with selfie + GPS), sees published shifts, sets
  availability, requests time off, offers/claims swaps.

## Quick start (local)

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3000
npx prisma db push
npm run dev
```

Visit <http://localhost:3000>. The first user to sign up at `/signup` becomes
the admin.

## Required environment variables

| Variable                 | Required    | Notes                                                                       |
| ------------------------ | ----------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`           | yes         | Postgres connection string (Neon, Supabase, etc.)                           |
| `NEXTAUTH_SECRET`        | yes         | Long random string                                                          |
| `NEXTAUTH_URL`           | yes         | e.g. `https://yourapp.vercel.app` (no trailing slash)                       |
| `RESEND_API_KEY`         | optional    | Without it, emails are logged only — self-service password reset won't work |
| `EMAIL_FROM`             | recommended | e.g. `Shiftwork <onboarding@resend.dev>`                                    |
| `CRON_SECRET`            | recommended | Long random string; protects the cron endpoints                             |
| `WORKSITE_LAT`           | optional    | Latitude of the primary worksite (enables clock-in geofencing)              |
| `WORKSITE_LNG`           | optional    | Longitude of the primary worksite                                           |
| `WORKSITE_RADIUS_METERS` | optional    | Geofence radius in meters (default 200)                                     |

If `WORKSITE_LAT` and `WORKSITE_LNG` are set, the new selfie-verify modal will
also display each clock-in's distance from the worksite (color-coded: green
≤200m, amber ≤500m, rose >500m).

## Email status

Email is currently disabled in production because the Resend domain hasn't been
verified yet. With email disabled, all of the following are no-ops (they log
to the server console but don't send): publish notifications, time-off
decisions, swap notifications, self-service password reset, shift reminders,
overtime alerts.

For password resets while email is off, admins use the **key icon button on
the Employees page** (`/employees`) to set a password directly for any staff
member.

## Cron jobs

`vercel.json` defines two daily cron jobs (Vercel Hobby allows daily
schedules):

- `0 13 * * *` — `/api/cron/shift-reminders` — daily at 13:00 UTC.
- `0 14 * * 4` — `/api/cron/overtime-alerts` — Thursdays at 14:00 UTC,
  emails managers when employees are at or near 40 hours for the week.

## Deploying to Vercel

1. Push to GitHub.
2. Import the repo in Vercel.
3. Add the environment variables above in **Project Settings → Environment Variables**.
4. Deploy. Vercel will run `prisma generate` and `next build` automatically.
5. After the first deploy, run `npx prisma db push` from your local machine
   **once** with the production `DATABASE_URL` to set up the schema.

### Setting up email (Resend)

1. Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month).
2. Copy your API key.
3. In Vercel, add `RESEND_API_KEY=...` and redeploy.
4. Use `EMAIL_FROM=Shiftwork <onboarding@resend.dev>` to test, then add and
   verify your own domain when ready.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Prisma** ORM + **PostgreSQL**
- **NextAuth** (Credentials provider, JWT)
- **Tailwind CSS**
- **Resend** for email
- **ExcelJS** for .xlsx, **jsPDF** + **jspdf-autotable** for .pdf
- **Recharts** for dashboard analytics

## Changelog

### v11.0.0
Selfie & GPS verification on `/timesheets` and `/dashboard`. New
`/api/clock-entries/[id]/selfie` endpoint. Optional worksite geofencing via
`WORKSITE_LAT` / `WORKSITE_LNG` / `WORKSITE_RADIUS_METERS`. No DB migration.

### v10
Schedule features, archive, hours, time-off edit, light theme.

### v2 — v9
Multi-location, time-off, shift swaps, exports, dashboard analytics, email
notifications, role hierarchy, photo upload (later replaced in v11), cron-based
shift reminders and overtime alerts.

### v1
Initial release: schedules, clock-in, employees, basic auth.

## License

Proprietary — internal use.
