// Your picks next to your opponent's, bout by bout, for the part of the card
// your league plays. Theirs only come back once each bout's section has
// locked, so nobody can copy; before that the server says only whether
// they're locked in. The shaping is pure so it can be tested without a
// database.

import { lastName } from "./events";
import { pickSummary } from "./picks";

export type PickSide =
  /** A pick, as a short line, and its points once scored. */
  | { kind: "pick"; line: string; points: number | null }
  /** Nothing picked on this bout. */
  | { kind: "none" }
  /** Theirs, on a bout that hasn't locked yet. */
  | { kind: "hidden" };

export type MatchupPickRow = {
  boutId: string;
  /** "SILVA vs JONES" */
  title: string;
  segment: "main" | "prelims" | "early_prelims";
  locked: boolean;
  /** A fighter was replaced after the lock: no fight for anyone. */
  voided: boolean;
  mine: PickSide;
  theirs: PickSide;
};

export type MatchupPicks = {
  rows: MatchupPickRow[];
  /** They have the picks the league's tier requires. */
  theirLockedIn: boolean;
  /** Some of their picks are still hidden. */
  someHidden: boolean;
};

type Finish = "round" | "DEC" | "ANY";
type Method = "KO" | "SUB";

export type RawMatchupPick = {
  bout_id: string;
  fight_order: number;
  card_segment: MatchupPickRow["segment"];
  locked: boolean;
  voided: boolean;
  red_id: string;
  red_name: string;
  blue_id: string;
  blue_name: string;
  my_fighter: string | null;
  my_finish: Finish | null;
  my_round: number | null;
  my_method: Method | null;
  my_points: number | null;
  their_fighter: string | null;
  their_finish: Finish | null;
  their_round: number | null;
  their_method: Method | null;
  their_points: number | null;
  their_locked_in: boolean;
};

function side(
  r: RawMatchupPick,
  fighter: string | null,
  finish: Finish | null,
  round: number | null,
  method: Method | null,
  points: number | null
): PickSide {
  if (!fighter || !finish) return { kind: "none" };
  const bout = { red: { name: r.red_name }, blue: { name: r.blue_name } };
  const line = pickSummary(bout, {
    corner: fighter === r.red_id ? "red" : "blue",
    finish: finish === "round" && round ? round : finish === "round" ? "ANY" : finish,
    ...(method ? { method } : {}),
  });
  return { kind: "pick", line, points: points == null ? null : Number(points) };
}

export function toMatchupPicks(raw: RawMatchupPick[]): MatchupPicks {
  const rows = [...raw]
    .sort((x, y) => x.fight_order - y.fight_order)
    .map((r): MatchupPickRow => ({
      boutId: r.bout_id,
      title: `${lastName(r.red_name).toUpperCase()} vs ${lastName(r.blue_name).toUpperCase()}`,
      segment: r.card_segment,
      locked: r.locked,
      voided: r.voided,
      mine: side(r, r.my_fighter, r.my_finish, r.my_round, r.my_method, r.my_points),
      theirs: r.locked
        ? side(r, r.their_fighter, r.their_finish, r.their_round, r.their_method, r.their_points)
        : { kind: "hidden" },
    }));
  return {
    rows,
    theirLockedIn: raw.some((r) => r.their_locked_in),
    someHidden: rows.some((r) => r.theirs.kind === "hidden"),
  };
}

export async function loadMatchupPicks(leagueId: string, eventId: string, opponentId: string): Promise<MatchupPicks> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("matchup_picks", {
    league: leagueId,
    event: eventId,
    opponent: opponentId,
  });
  if (error) throw new Error(error.message);
  return toMatchupPicks((data ?? []) as RawMatchupPick[]);
}
