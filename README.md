# Fold

**Event management, ride coordination, and attendee analytics for student organizations, powered by AI.**

Fold helps campus ministries and student groups track who shows up, who invites whom, and how to follow up, all from a single dashboard. Paste messy attendance lists, ask questions in plain English, and let AI handle the parsing.

## What it does

- **Dashboard** -- 30-day snapshot at a glance: events hosted, total check-ins, unique attendees, and new students. Interactive charts show attendance trends, engagement funnels, and demographic breakdowns.
- **Events** -- create events, mark attendance with a quick-add form, and view per-event breakdowns (first-timers vs returners, invite chains, gender split).
- **Students** -- searchable roster with health metrics per person: attendance frequency, who invited them, who they've brought, and how many contact attempts have been made. A "Gone Cold" tab surfaces students who haven't shown up in 30+ days.
- **Smart Intake** -- paste unstructured text (names, phone numbers, Instagram handles, however you collected it) and AI extracts structured student records. Duplicate detection built in.
- **Engagement Funnel** -- track students across stages from "new" to "engaged." Filter by stale responses, missing contact attempts, or inactive status. Automated sweep moves students between stages based on activity.
- **Ride Coordination** -- create carpool sessions per event (there, back, Sunday morning), assign drivers and riders, and manage seat constraints.
- **Natural Language Queries** -- ask questions like "who came to the last 3 events but not this week" or "all freshmen who were invited by someone" and get results back as a table.

## Tech Stack

- **Next.js 15** (App Router, Turbopack)
- **Turso** (hosted SQLite) + Drizzle ORM
- **Claude API** (Haiku for parsing and insights)
- **Tailwind CSS** + Recharts
- **TypeScript** end-to-end

## Getting Started

```bash
# Clone and install
git clone https://github.com/andrewyu47/Fold-public.git
cd Fold-public
npm install

# Configure environment
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY, TURSO_DATABASE_URL, and TURSO_AUTH_TOKEN

# Create a Turso database (free tier)
# turso db create fold
# turso db tokens create fold

# Set up the database
npx tsx scripts/migrate.ts
npx tsx scripts/seed.ts

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with `admin@example.com` / `password123`.

## Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Claude API key (required for AI features) | -- |
| `AUTH_SECRET` | Session signing secret | -- |
| `TURSO_DATABASE_URL` | Turso database URL | -- |
| `TURSO_AUTH_TOKEN` | Turso auth token | -- |
| `ALLOWED_DOMAIN` | Restrict signups to a specific email domain | any |
| `HOST` | Bind address | `127.0.0.1` |

## Project Structure

```text
src/
  app/           # Next.js pages and API routes
    api/         # Backend endpoints (intake, rides, funnel, query)
    events/      # Event CRUD and attendance
    students/    # Student profiles and contact logs
    funnel/      # Engagement pipeline
    query/       # Natural language search
  lib/           # Shared utilities
    rides/       # Carpool solver and constraints
    funnel/      # Stage management and dedup
  components/    # Reusable UI (RideSessionEditor)
drizzle/         # Schema and migrations
scripts/         # Seed data, dev fixtures, smoke tests
```

## License

MIT
