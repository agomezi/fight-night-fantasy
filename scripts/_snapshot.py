"""Flatten UFC live-stats JSON into one comparable line per bout.

Used by poll-live-event.sh; the poller logs a new block only when this output
changes, so the log records transitions rather than every poll.
"""
import json
import sys

try:
    detail = json.load(sys.stdin)["LiveEventDetail"]
except Exception:
    sys.exit(0)

print(
    "EVENT status={} liveFight={} round={} elapsed={}".format(
        detail["Status"],
        detail["LiveFightId"],
        detail["LiveRoundNumber"],
        detail["LiveRoundElapsedTime"],
    )
)

for fight in detail.get("FightCard", []):
    result = fight.get("Result") or {}
    outcomes = "/".join(
        str((f.get("Outcome") or {}).get("Outcome")) for f in fight.get("Fighters", [])
    )
    names = " vs ".join(
        f["Name"]["LastName"] for f in fight.get("Fighters", [])
    )
    print(
        "  #{} {} {} status={} method={} round={} time={} outcome={}".format(
            fight.get("FightOrder"),
            fight.get("CardSegment"),
            names,
            fight.get("Status"),
            result.get("Method"),
            result.get("EndingRound"),
            result.get("EndingTime"),
            outcomes,
        )
    )
