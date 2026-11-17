#!/usr/bin/env bash
# Runs the price-history collector about every 12 hours and pushes data/history to GitHub.
# Stand-in for the GitHub Actions workflow (deploy/price-history.yml) on an always-on machine.
cd "$(dirname "$0")/.." || exit 1
while true; do
  echo "== $(TZ=America/Chicago date) collecting"
  git pull -q --rebase origin main || true
  if node scripts/collect-history.js; then
    git add data/history server/snapshot
    if ! git diff --cached --quiet; then
      git -c user.name=price-history-bot -c user.email=drmeow93-hash@users.noreply.github.com \
        commit -qm "Price history $(TZ=America/Chicago date '+%Y-%m-%d %H:%M %Z') [skip render]"
      git push -q origin main || echo "push failed"
    fi
  fi
  sleep 43200
done
