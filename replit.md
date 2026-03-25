# LevelTrack - GLP-1 & Metabolic Health Tracker

## Overview

LevelTrack is a mobile-first web app for people on GLP-1 medications, peptides, and metabolic health stacks. It provides a private, all-in-one place to track injections, supplements, food, side effects, and biometrics. Built as a Progressive Web App (PWA) with Capacitor support for native App Store / Google Play distribution.

## Product Vision

Become the central nervous system for metabolic protocols — where users define and run stacks that combine GLP-1s, peptides, supplements, food targets, and device data.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

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
- **Environment Variables**: DATABASE_URL for database connection
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
- Real authentication (currently demo mode with userId=1)
