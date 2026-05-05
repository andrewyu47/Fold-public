#!/usr/bin/env bash
# Install Fold on an always-on Mac. Idempotent — safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Installing dependencies"
npm install

echo "→ Running DB migrations"
npm run db:migrate

if [ ! -f ".env.local" ]; then
  echo
  echo "✗ Missing .env.local — copy .env.example and fill in ANTHROPIC_API_KEY + AUTH_SECRET, then re-run."
  exit 1
fi

echo "→ Building Next.js"
npm run build

if ! command -v pm2 >/dev/null 2>&1; then
  echo "→ Installing PM2 globally"
  npm install -g pm2
fi

echo "→ Starting Fold under PM2"
pm2 start ecosystem.config.cjs || pm2 reload fold
pm2 save

echo "→ Setting up Cloudflare Tunnel for public access"
"$(dirname "$0")/setup-tunnel.sh"

echo
echo "→ To survive Mac reboots, run this once and follow the printed instructions:"
echo "    pm2 startup"
echo
echo "✓ Fold is running on http://localhost:3000"
echo "  Public URL is in data/tunnel-url.txt"
echo "  Anyone with that link can sign up at /signup"
