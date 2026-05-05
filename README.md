# Fold

Event management, ride coordination, and attendee analytics, powered by AI.

## Features

- **Event tracking** -- create events, mark attendance via natural language
- **Smart intake** -- paste unstructured text, AI extracts attendee info
- **Ride management** -- auto-assign carpools with configurable constraints
- **Attendee analytics** -- dashboards, insights, and engagement funnels
- **Natural language queries** -- ask questions about your data in plain English

## Setup

1. Clone and install:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your `ANTHROPIC_API_KEY`.

3. Initialize the database:
   ```bash
   npx drizzle-kit migrate
   npx tsx scripts/seed.ts
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000 and sign in with `admin@example.com` / `password123`

## Tech Stack

- Next.js 15 (App Router)
- SQLite + Drizzle ORM
- Claude API (Haiku for parsing, insights)
- Tailwind CSS

## Configuration

- `ALLOWED_DOMAIN` -- restrict signups to a specific email domain (optional)
- `HOST` -- bind address (default: 127.0.0.1)
