# Nurtur Stack - Comprehensive Wellness Protocol Management App

## Overview

Nurtur Stack is a comprehensive web application designed to help users plan, track, and analyze their wellness regimens based on Peter Attia's "Outlive" longevity framework. The app features protocols for supplements, nutrition, exercise, and time-restricted eating, with a calendar-based interface, task tracking, analytics, and compliance monitoring.

## Peter Attia's Outlive Framework Alignment

The app is structured around key concepts from "Outlive: The Science and Art of Longevity":

### The 4 Horsemen (What We Help Users Avoid)
1. Metabolic Syndrome → CR & DR protocols, TR & IF meal windows
2. Cardiovascular Disease → Exercise & Behavior protocols, nutrition tracking
3. Cancer → Metabolic health optimization across all protocols
4. Neurocognitive Disease → Sleep tracking, exercise, stress management

### The 3 Levers of Nutrition
| Lever | Protocol Category | What It Tracks |
|-------|-------------------|----------------|
| **CR** (Calorie Restriction) | CR & DR: Calories & Diet | How much you eat |
| **TR** (Time Restriction) | TR & IF: Meal Window | When you eat (eating windows) |
| **DR** (Dietary Restriction) | CR & DR: Calories & Diet | What you eat (foods to avoid) |

**Goal:** "Always pull 1, often pull 2, occasionally pull 3"

### Protocol Categories
- **Supps & Rx** - Supplements and medications
- **Exercise & Behavior** - Physical activity and behavioral protocols
- **TR & IF: Meal Window** - Time-restricted eating / intermittent fasting
- **CR & DR: Calories & Diet** - Calorie and dietary restrictions

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes: Latest modifications with dates

### January 22, 2026 - Outlive Rebranding & Dashboard Enhancements
- **Renamed protocol categories** - Updated to Peter Attia framework:
  - Supplements → "Supps & Rx"
  - Exercise → "Exercise & Behavior"
  - Fasting → "TR & IF: Meal Window"
  - Nutrition → "CR & DR: Calories & Diet"
- **Reorganized category groups** - "Protocols" group and "The 3 Levers" group
- **Updated color palette** - Warm sage green primary, cream backgrounds, muted gold accents (inspired by Outlive book cover)
- **Added gradient utilities** - gradient-outlive and gradient-hero for aurora-style effects
- **Modernized design** - Warmer, functional medicine aesthetic with soft shadows and rounded corners
- **Added 4 Horsemen Summary Card** - Dashboard now shows protection scores against the 4 major disease drivers:
  - Metabolic Syndrome (tracked via CR/DR/TR protocols)
  - Cardiovascular Disease (tracked via Exercise & Nutrition)
  - Cancer (tracked via all metabolic protocols)
  - Neurocognitive Decline (tracked via Exercise & Supplements)
- **Added Sleep Trends Visualization** - 30-day historical bar chart with:
  - Average, best, and lowest sleep metrics
  - Week-over-week trend indicator
  - Color-coded bars (green for 7+ hours, amber for less)
  - Peter Attia's 7-9 hour target recommendation

### January 17, 2025 - Protocol Compliance Tracking
- Fixed compliance percentage fluctuation with real calculations
- Added per-protocol compliance tracking (L30D/L90D/L365D)
- Calendar auto-population for future dates
- Restricted future task completion

### January 16, 2025 - Critical Bug Fixes
- Fixed task completion functionality
- Fixed protocol editing and dosage updates
- Added IU dosage unit for vitamins

## Roadmap

### High Priority - Integrations
- [ ] Oura Ring API integration (sleep, HRV, readiness)
- [ ] Apple Watch/Apple Health API integration
- [ ] Google Fit integration

### External Measurements (New Feature)
- [ ] DEXA scan results tracking
- [ ] Blood pressure logging
- [ ] Blood work panels (cholesterol, testosterone, A1C, etc.)
- [ ] Heart health metrics
- [ ] Doctor appointment data points

### Fasting Safety (Required for TR & IF)
- [ ] Liability disclaimer ("Consult your physician before fasting")
- [ ] Post-fast refeeding guide with gentle food recommendations

### Future Considerations
- [ ] Real user authentication (currently demo mode)
- [ ] Extended fasting tracker (requires major liability disclaimer)
- [ ] Push notifications/reminders
- [ ] Data export functionality

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: React Query (@tanstack/react-query)
- **Styling**: Tailwind CSS with warm sage/cream color palette
- **UI Components**: Radix UI components with shadcn/ui styling
- **Build Tool**: Vite

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (@neondatabase/serverless)
- **API Design**: RESTful API with JSON responses

### Design System
| Role | Color | Usage |
|------|-------|-------|
| Primary | Sage green (hsl 152, 35%, 45%) | CTAs, active states |
| Secondary | Warm mint (hsl 168, 40%, 55%) | Secondary actions |
| Accent | Muted gold (hsl 38, 70%, 55%) | Highlights, data viz |
| Background | Warm cream (hsl 45, 30%, 98%) | Page backgrounds |
| Card | Soft ivory (hsl 48, 25%, 97%) | Card backgrounds |

## Key Components

### Database Schema
- **Users**: User profiles with streak tracking and compliance metrics
- **Protocols**: Health regimens categorized by type (supplements, fasting, exercise, nutrition)
- **Protocol Items**: Individual items with dosage, timing, cycling info
- **Tasks**: Daily trackable items generated from protocols
- **Health Metrics**: Sleep, mood, energy tracking
- **Integrations**: External service connections (Oura, Apple Health, Google Fit)

### Frontend Pages
- **Dashboard**: Today's tasks, compliance overview, quick actions
- **Calendar**: Month view with task scheduling and completion
- **Protocols**: Protocol management with "Protocols" and "The 3 Levers" sections
- **Analytics**: Progress tracking with category performance charts
- **Profile**: User settings and integration management

### API Endpoints
- User management (GET/PATCH /api/user)
- Protocol CRUD operations (/api/protocols)
- Task management with date filtering (/api/tasks)
- Health metrics tracking (/api/health-metrics)
- Analytics dashboard data (/api/analytics)

## Configuration

- **Environment Variables**: DATABASE_URL for database connection
- **Build Commands**: npm run build for production, npm run dev for development
- **Database Migrations**: npm run db:push for schema updates
