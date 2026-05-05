#!/usr/bin/env bash
# Install Cloudflare Tunnel and run it under PM2 — gives a free public URL.
# Uses the "quick tunnel" mode: no domain, no Cloudflare account, random *.trycloudflare.com URL.
# The URL is stable as long as the cloudflared process keeps running. PM2 keeps it alive across reboots.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v brew >/dev/null 2>&1; then
  echo "✗ Homebrew not found. Install Homebrew first: https://brew.sh"
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "→ Installing cloudflared via brew"
  brew install cloudflared
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "→ Installing pm2 globally"
  npm install -g pm2
fi

# Replace any existing tunnel process so we get a fresh URL deterministically.
pm2 delete fold-tunnel >/dev/null 2>&1 || true

echo "→ Starting cloudflared tunnel under PM2"
pm2 start cloudflared --name fold-tunnel --time -- tunnel --url http://localhost:3000 >/dev/null
pm2 save >/dev/null

echo "→ Waiting for the public URL (this can take 30-60s)…"
URL=""
LOG_DIR="${HOME}/.pm2/logs"
for i in $(seq 1 90); do
  sleep 1
  URL=$(grep -hoE 'https://[A-Za-z0-9-]+\.trycloudflare\.com' \
        "${LOG_DIR}"/fold-tunnel-out.log \
        "${LOG_DIR}"/fold-tunnel-error.log 2>/dev/null \
        | tail -1 || true)
  if [ -n "$URL" ]; then break; fi
done

mkdir -p data
if [ -n "$URL" ]; then
  echo "$URL" > data/tunnel-url.txt
  echo
  echo "  ✓ Public URL: $URL"
  echo "    (saved to data/tunnel-url.txt)"
  echo
  echo "  Share that link with your team. It stays live as long as PM2 keeps cloudflared running."
  echo "  Notes:"
  echo "    • The URL changes only if cloudflared restarts (e.g. after a Mac reboot)."
  echo "    • To see the current URL anytime: cat data/tunnel-url.txt"
  echo "    • To restart the tunnel: pm2 restart fold-tunnel  (you'll get a new URL — re-run this script to capture it)"
  echo "    • Logs: pm2 logs fold-tunnel"
else
  echo "✗ Couldn't extract a tunnel URL within 60s. Check: pm2 logs fold-tunnel"
  exit 1
fi
