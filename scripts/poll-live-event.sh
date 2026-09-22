#!/usr/bin/env bash
# Phase 0 Part B — latency probe.
#
# Answers the one question completed pages cannot: how long after a fight ends
# does the result actually appear? Polls UFC's live stats JSON through a card
# and appends a row every time a bout's status or result changes.
#
#   bash scripts/poll-live-event.sh <event_fmid> [interval_seconds]
#
# Find the fmid on the event page:
#   curl -s https://www.ufc.com/event/<slug> | grep -o '"event_fmid":"[0-9]*"'
#
# Leave it running from before the first bout until the card ends, then read
# the log. Cross-reference against a timestamped play-by-play to get the real
# finish time; the gap between that and the row here is the latency.

set -euo pipefail
cd "$(dirname "$0")/.."

FMID="${1:?usage: poll-live-event.sh <event_fmid> [interval]}"
INTERVAL="${2:-30}"
API="https://d29dxerjsp82wz.cloudfront.net/api/v3/event/live/${FMID}.json"
LOG="phase0-latency-${FMID}.log"
STATE=""

echo "polling $API every ${INTERVAL}s -> $LOG"
echo "# started $(date -u +%Y-%m-%dT%H:%M:%SZ) fmid=$FMID interval=${INTERVAL}s" >> "$LOG"

while true; do
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  body=$(curl -s --max-time 20 "$API" || true)

  if [ -z "$body" ]; then
    echo "$now FETCH_FAILED" >> "$LOG"
    sleep "$INTERVAL"
    continue
  fi

  # One line per bout: order, status, method, round, time, outcomes.
  snapshot=$(printf '%s' "$body" | python3 scripts/_snapshot.py)

  if [ "$snapshot" != "$STATE" ]; then
    {
      echo "=== $now"
      printf '%s\n' "$snapshot"
    } >> "$LOG"
    STATE="$snapshot"
    echo "$now change recorded"
  fi

  sleep "$INTERVAL"
done
