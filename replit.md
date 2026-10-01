# LevelTrack - GLP-1 & Metabolic Health Tracker

## Overview

LevelTrack is a mobile-first web app for people on GLP-1 medications, peptides, and metabolic health stacks. It provides a private, all-in-one place to track injections, supplements, food, side effects, and biometrics. Built as a Progressive Web App (PWA) with Capacitor support for native App Store / Google Play distribution.

## Product Vision

Become the central nervous system for metabolic protocols — where users define and run stacks that combine GLP-1s, peptides, supplements, food targets, and device data.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### October 2026 - Google Sign-In, Per-User Data & Bug Fixes
- **Google sign-in** (`server/auth.ts`, `client/src/pages/sign-in.tsx`): OAuth 2.0 / OpenID Connect code flow, no extra packages. Sessions are stored in Postgres (`session` table, 30-day cookie). Every `/api` route now requires sign-in except `/api/auth/*`, `/api/drugs` and `/api/push/vapid-public-key`.
  - `GET /api/auth/config`, `GET /api/auth/google`, `GET /api/auth/google/callback`, `POST /api/auth/demo`, `POST /api/auth/logout`
  - Settings page has a **Sign out** button
- **Per-user data**: the hard-coded `userId = 1` is gone. Every route uses the signed-in user, and every read/update/delete by id checks ownership (another user's records return 404). The reminder scheduler now covers all users.
- **Demo account**: "Try the demo account" button on by default in development, off in production (override with `DEMO_MODE=true|false`). It never opens an account linked to Google.
- **Bug fixes**: shot adherence now measured against the injection schedule (`server/adherence.ts`; a weekly injector who never misses = 100%, was ~13%); negative/zero doses, out-of-range pain (0–10) and journal (1–5) scores and malformed dates rejected; `/api/protocols/compliance` no longer swallowed by `/api/protocols/:id`; supplement doses accept decimals (2.5 g); server no longer crashes at startup without `OPENAI_API_KEY`; `PATCH` routes only accept their own fields (no editing streak/email/owner); `/api/debug/db-test` removed; deleting a missing record returns 404; voice notes and label scanner were calling the API with the wrong arguments; 0 TypeScript errors (was 47).
- **Local dev**: `server/db.ts` uses Neon's driver for `*.neon.tech` URLs and plain `pg` otherwise (override with `DB_DRIVER=neon|pg`). `npm test` runs unit tests.

### March 2026 - Device Integrations: Withings Scale + Oura Ring (Task #6)
- **Full OAuth 2.0 flow** for both Withings and Oura Ring:
  - `GET /api/integrations/withings/auth` — initiates OAuth, redirects to Withings consent
  - `GET /api/integrations/withings/callback` — receives auth code, exchanges for tokens, triggers initial sync
  - `POST /api/integrations/withings/sync` — pulls last 90 days of body weight from Withings Measure API
  - `DELETE /api/integrations/withings` — disconnects / removes tokens
  - Same pattern for Oura: `/api/integrations/oura/{auth,callback,sync}` and `DELETE /api/integrations/oura`
  - `GET /api/device-integrations` — returns connection status + lastSync for both devices
  - `GET /api/oura-daily` — returns Oura sleep + readiness data for analytics
- **`server/device-sync.ts`** — standalone sync functions:
  - `syncWithingsWeights(userId)` — fetches weight measurements, upserts as weight-only entries in `progress_photos` with `notes="Synced from Withings"`
  - `syncOuraSleep(userId)` — fetches daily sleep + readiness scores, stores in `oura_daily_logs` table
  - Automatic token refresh on 401 responses
- **New DB table**: `oura_daily_logs` (sleepScore, readinessScore, hrv, totalSleep, deepSleep, remSleep)
- **Storage additions**: `getIntegrationByPlatform`, `upsertIntegrationByPlatform`, `deleteIntegrationByPlatform`, `getOuraDailyLogs`, `upsertOuraDailyLog`
- **Settings page** — new "Connected Devices" card:
  - Withings Scale row with "Connect" → OAuth redirect; sync (rotate icon) and disconnect (WifiOff) buttons when connected
  - Oura Ring row with same pattern
  - Shows last-sync date when connected
  - "Not set up" badge if API credentials not configured (env vars missing)
  - Requires: `WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET`, `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` env secrets
- **Analytics page** — new "Recovery (Oura)" chart:
  - Line chart with Sleep Score (indigo) + Readiness Score (teal) over selected period
  - Average score pills above chart
  - Empty state with connect prompt when no data

### March 2026 - Dashboard Gamification, Peptide Calculator, Dark Mode, Analytics Upgrade, Reference Library (Tasks #7–10)
- **Dashboard completely rebuilt** with gamified hero:
  - SVG semicircle injection gauge (shows cycle progress: green→yellow→orange→red as due date approaches)
  - Pharmacokinetic medication levels chart (AreaChart computing exponential decay of drug concentration, with 7d/30d/90d time tabs)
  - Weight hero card with total weight lost + SVG progress ring showing % toward goal weight
  - 4-column stats row: Adherence, Total Shots, BMI (when height set), Rate/Week (avg weight change over last 4 weigh-ins)
  - Streak badge shows weeks when ≥ 7 days (e.g. "1wk streak"), days otherwise
  - Height field added to onboarding step 3 for immediate BMI calculation
- **Peptide Calculator page** (`/calculate`, new bottom nav tab):
  - Multi-peptide blend builder with vial size + desired dose inputs
  - BAC water volume + syringe type (U-100/U-40) selector
  - Live dosage result table showing exact units to draw
  - Save calculations to "My Calcs" tab with persistent vial tracker (log/undo/delete)
  - "Learn More" (book icon) button on each VialCard opens the Reference Library detail sheet for the first peptide in the blend
- **Peptide Reference Library** (Task #10):
  - `client/src/data/peptides.json` — 40 entries covering GLP-1, Regenerative, Cognitive, Metabolic, Growth, and Other categories
  - Each entry: name, slug, category, tagline, description, mechanism, usage, halfLifeHours, typicalDoseRange, frequency
  - `client/src/pages/peptide-reference.tsx` — searchable list + category filter chips + bottom-sheet detail view
  - Accessible via "Reference Library" tab in the Protocols page (My Protocols / Reference Library tab strip)
  - `usePeptideRef()` hook exported for other pages to open the detail sheet by peptide name
- **Dark Mode** (Task #10):
  - `ThemeProvider` in `client/src/lib/theme-provider.tsx` applies `.dark` class to `<html>`
  - Three-way toggle in Settings: Light / Dark / System (follows OS preference)
  - Persists to localStorage + saves to user.theme via PATCH /api/user/settings
- **Analytics Upgrade** (Task #8):
  - Dose-colored injection day dots on weight chart (teal with glow ring vs. indigo for regular days)
  - Injection day legend entry in chart legend
- **Settings Upgrades**:
  - Appearance card with Sun/Moon/Monitor theme buttons
  - Height (cm) field in Goals & Units card — used to compute BMI on dashboard
- **Backend Additions**:
  - `heightCm` + `theme` fields added to `updateUserSettingsSchema` (PATCH /api/user/settings)
  - 7 new API routes for peptide calculations + vial logs (CRUD)
  - `storage.ts` extended with peptide calculation and vial log CRUD implementations

### March 2026 - LevelTrack Rebrand & GLP-1 Foundation (Task #1)
- **Rebranded** from "Nurtur Stack" to "LevelTrack" throughout the app
- **New color palette**: Deep indigo primary (hsl 247, 72%, 55%) + teal secondary + amber accent — clean, modern, medical/trustworthy feel
- **New navigation**: 5-tab bottom nav — Home, Log Shot, Journal, Progress, Profile
- **New database tables added** (migrated via db:push):
  - `glp1_logs` — injection records (drug, dose, formulation, site, pain score, notes)
  - `side_effect_logs` — symptom journaling (nausea, GI, fatigue, mood, cravings, sleep, energy)
  - `progress_photos` — camera-based progress photos with weight and notes
- **Backend routes added**:
  - `GET /api/drugs` — curated GLP-1/peptide drug list (Ozempic, Wegovy, Mounjaro, Zepbound, BPC-157, TB-500, CJC-1295, and more)
  - `GET/POST/DELETE /api/glp1-logs` — injection logging CRUD
  - `GET/POST/PATCH /api/side-effect-logs` — symptom tracking CRUD
  - `GET/POST/DELETE /api/progress-photos` — progress photo CRUD
- **Enhanced dashboard analytics**: now returns `todayShotLogged`, `latestShot`, `glp1Adherence` (30-day), `latestWeight`
- **PWA setup**: manifest.json, apple mobile web app meta tags, safe area insets, viewport-fit=cover
- **Mobile-first UX**: safe area insets for iPhone notch/home bar, 44px touch targets, smooth bottom nav
- **Stub pages**: log-shot.tsx, journal.tsx, progress.tsx (full implementation in Task #2 and #3)

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: React Query (@tanstack/react-query v5)
- **Styling**: Tailwind CSS with LevelTrack indigo/teal/amber palette
- **UI Components**: Radix UI components with shadcn/ui styling
- **Build Tool**: Vite
- **PWA**: manifest.json, viewport-fit=cover, apple-mobile-web-app meta tags

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (@neondatabase/serverless)
- **API Design**: RESTful API with JSON responses

### Design System
| Role | Color | Usage |
|------|-------|-------|
| Primary | Indigo (hsl 247, 72%, 55%) | CTAs, active states, hero gradient |
| Secondary | Teal (hsl 175, 60%, 42%) | Secondary actions, charts |
| Accent | Amber (hsl 38, 90%, 55%) | Highlights, data viz |
| Background | Off-white (hsl 220, 20%, 98%) | Page backgrounds |
| Card | White | Card backgrounds |

## Database Schema

### Existing Tables (preserved)
- **users** — User profiles with streak tracking and compliance metrics
- **protocols** — Supplement/exercise/fasting protocols
- **protocol_items** — Individual items with dosage, timing, cycling info
- **tasks** — Daily trackable items generated from protocols
- **health_metrics** — Sleep, mood, energy, weight tracking (weight now uses `real` type for decimals)
- **integrations** — External service connections
- **voice_notes** — AI-processed voice recordings

### New LevelTrack Tables
- **glp1_logs** — GLP-1 and peptide injection records (userId, date, time, drugName, formulation, doseAmount, doseUnit, injectionSite, painScore, notes)
- **side_effect_logs** — Symptom journaling (userId, date, nausea/gi/fatigue/mood/cravings/sleep/energy as 1-5 scores, freeText)
- **progress_photos** — Progress photo timeline (userId, date, photoUrl, weight, notes)

## Frontend Pages
- **/** (Home) — GLP-1 focused dashboard: shot status, key stats (adherence, weight, stack completion), today's supplement stack, quick actions
- **/log-shot** — GLP-1/peptide injection logger (stub, full UI in Task #2)
- **/journal** — Side effect symptom journal (stub, full UI in Task #2)
- **/progress** — Progress photos and social cards (stub, full UI in Task #3)
- **/analytics** — Compliance trends and health analytics
- **/profile** — User settings, integrations, notifications

## API Endpoints
- `GET /api/user`, `PATCH /api/user` — User management
- `GET /api/drugs` — Curated GLP-1/peptide drug list
- `GET/POST/DELETE /api/glp1-logs` — Injection log CRUD
- `GET /api/glp1-logs/range` — Date range query for analytics
- `GET /api/side-effect-logs`, `POST /api/side-effect-logs` — Symptom logging
- `GET /api/side-effect-logs/today` — Today's symptom check
- `PATCH /api/side-effect-logs/:id` — Update today's entry
- `GET/POST/DELETE /api/progress-photos` — Progress photo management
- Protocol, tasks, health metrics endpoints (all preserved)
- `GET /api/analytics/dashboard` — Enhanced dashboard including GLP-1 adherence + weight

## Mobile / App Store Setup
- PWA manifest at `/public/manifest.json`
- viewport-fit=cover for iPhone notch
- env(safe-area-inset-*) CSS for safe areas
- apple-mobile-web-app meta tags
- Capacitor can be added to wrap this as a native iOS/Android app

## Configuration
- **Environment Variables**:
  - `DATABASE_URL` — database connection
  - `SESSION_SECRET` — **required in production**; any long random string, used to sign login cookies
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google sign-in (Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type "Web application"). Authorized redirect URI: `<APP_BASE_URL>/api/auth/google/callback`
  - `APP_BASE_URL` — public URL of the app (e.g. `https://leveltrack.example.com`), used for OAuth redirect URIs
  - `LEGACY_USER_EMAIL` — optional; the first Google sign-in with this email takes over the data that existed before sign-in was added (user #1)
  - `DEMO_MODE` — optional; `true`/`false` to force the demo button on/off
  - `OPENAI_API_KEY` — optional; only needed for voice notes
- **Build Commands**: npm run build for production, npm run dev for development
- **Database Migrations**: npm run db:push for schema updates

## Roadmap

### Task #2 - Shot Logging & Journal UI
- Full GLP-1 injection form (drug selector, dose, site picker, pain score)
- Shot history list with swipe to delete
- Side effect symptom journal with 7-day history

### Task #3 - Progress Photos, Social Cards & Analytics
- Camera-based photo upload and timeline grid
- Branded progress card generator (html2canvas PNG export)
- Weight vs. dose over time chart (Recharts)
- Side effect trend charts

### Future (V2+)
- Apple Health / Google Fit / Oura Ring integrations
- Experiment mode (hypothesis-based tracking windows)
- AI coach layer for pattern detection
- Push notification reminders
- Clinician/coach shared dashboards
- Email/password or Apple sign-in alongside Google
