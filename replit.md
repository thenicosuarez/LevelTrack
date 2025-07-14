# Nurtur Stack - Comprehensive Wellness Protocol Management App

## Overview

Nurtur Stack (also known as Holistica) is a comprehensive web application designed to help users plan, track, and analyze their wellness regimens including supplements, fasting, workouts, meals, and habits. The app features a calendar-based interface with protocol management, task tracking, analytics, and user profile management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: React Query (@tanstack/react-query) for server state management
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Radix UI components with shadcn/ui styling
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (@neondatabase/serverless)
- **API Design**: RESTful API with JSON responses
- **Session Management**: Express sessions with PostgreSQL storage (connect-pg-simple)

### Data Storage
- **ORM**: Drizzle ORM for type-safe database operations
- **Schema**: Defined in shared/schema.ts with Zod validation
- **Database**: PostgreSQL configured for production deployment
- **Migrations**: Drizzle Kit for database schema migrations

## Key Components

### Database Schema
- **Users**: User profiles with streak tracking and compliance metrics
- **Protocols**: Health regimens categorized by type (supplements, fasting, exercise, nutrition)
- **Protocol Items**: Individual items within protocols with dosage and timing
- **Tasks**: Daily trackable items generated from protocols
- **Health Metrics**: Sleep, mood, energy tracking
- **Integrations**: External service connections (Apple Health, Google Fit)

### Frontend Pages
- **Dashboard**: Overview with today's tasks and progress metrics
- **Calendar**: Month view with task scheduling and completion
- **Protocols**: Management of health regimens and protocols
- **Analytics**: Progress tracking with charts and compliance metrics
- **Profile**: User settings and integration management

### API Endpoints
- User management (GET/PATCH /api/user)
- Protocol CRUD operations (/api/protocols)
- Task management with date filtering (/api/tasks)
- Health metrics tracking (/api/health-metrics)
- Analytics dashboard data (/api/analytics)

## Data Flow

1. **User Authentication**: Single user system (demo mode with user ID 1)
2. **Protocol Creation**: Users create protocols with multiple items and schedules
3. **Task Generation**: System generates daily tasks from active protocols
4. **Progress Tracking**: Users mark tasks complete and log health metrics
5. **Analytics**: System calculates compliance rates and generates progress charts

## External Dependencies

### Frontend Dependencies
- **UI Framework**: React with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens
- **Icons**: Lucide React for consistent iconography
- **Form Handling**: React Hook Form with Zod validation
- **Date Utilities**: date-fns for date manipulation

### Backend Dependencies
- **Database**: Neon PostgreSQL with Drizzle ORM
- **Validation**: Zod for schema validation
- **Development**: tsx for TypeScript execution
- **Build**: esbuild for production bundling

## Deployment Strategy

### Development
- **Dev Server**: Vite dev server with HMR
- **Backend**: tsx for TypeScript execution
- **Database**: Drizzle Kit for schema changes

### Production
- **Build Process**: Vite builds frontend to dist/public, esbuild bundles backend
- **Database**: PostgreSQL via DATABASE_URL environment variable
- **Hosting**: Designed for Node.js hosting platforms
- **Static Assets**: Served from dist/public directory

### Configuration
- **Environment Variables**: DATABASE_URL for database connection
- **Build Commands**: npm run build for production, npm run dev for development
- **Database Migrations**: npm run db:push for schema updates

The application follows a modern full-stack architecture with type safety throughout, comprehensive UI components, and a scalable database design suitable for health and wellness tracking applications.