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
  r: Pick<RawMatchupPick, "red_id" | "red_name" | "blue_name">,
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

/** Any matchup in the league that week, from league_matchup_picks: `mine` is
 * side a and `theirs` side b. Each side shows as its section locks, so both
 * can be hidden for a player who isn't in it. */
export type LeagueMatchupPicks = MatchupPicks & { aLockedIn: boolean };

export type RawLeagueMatchupPick = Pick<
  RawMatchupPick,
  "bout_id" | "fight_order" | "card_segment" | "locked" | "voided" | "red_id" | "red_name" | "blue_id" | "blue_name"
> & {
  a_shown: boolean;
  a_fighter: string | null;
  a_finish: Finish | null;
  a_round: number | null;
  a_method: Method | null;
  a_points: number | null;
  b_shown: boolean;
  b_fighter: string | null;
  b_finish: Finish | null;
  b_round: number | null;
  b_method: Method | null;
  b_points: number | null;
  a_locked_in: boolean;
  b_locked_in: boolean;
};

export function toLeagueMatchupPicks(raw: RawLeagueMatchupPick[]): LeagueMatchupPicks {
  const rows = [...raw]
    .sort((x, y) => x.fight_order - y.fight_order)
    .map((r): MatchupPickRow => ({
      boutId: r.bout_id,
      title: `${lastName(r.red_name).toUpperCase()} vs ${lastName(r.blue_name).toUpperCase()}`,
      segment: r.card_segment,
      locked: r.locked,
      voided: r.voided,
      mine: r.a_shown ? side(r, r.a_fighter, r.a_finish, r.a_round, r.a_method, r.a_points) : { kind: "hidden" },
      theirs: r.b_shown ? side(r, r.b_fighter, r.b_finish, r.b_round, r.b_method, r.b_points) : { kind: "hidden" },
    }));
  return {
    rows,
    aLockedIn: raw.some((r) => r.a_locked_in),
    theirLockedIn: raw.some((r) => r.b_locked_in),
    someHidden: rows.some((r) => r.mine.kind === "hidden" || r.theirs.kind === "hidden"),
  };
}

export async function loadLeagueMatchupPicks(leagueId: string, eventId: string, a: string, b: string): Promise<LeagueMatchupPicks> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("league_matchup_picks", { league: leagueId, event: eventId, a, b });
  if (error) throw new Error(error.message);
  return toLeagueMatchupPicks((data ?? []) as RawLeagueMatchupPick[]);
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
