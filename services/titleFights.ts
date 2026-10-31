// A league's title: the Champion in the C slot above the table (none while
// the belt is vacant), the Interim Champ named at a midseason review, the field of
// four or five that makes the title shot after card 8, and the bracket on
// cards 9 to 11. The server works it all out; the shaping here is pure so
// jest can test it.

import type { Matchup } from "./leagues";

export type TitleStage = "play_in" | "semi" | "title";

export type LeagueTitle = {
  /** The pre-season has no title. */
  preseason: boolean;
  champion: { userId: string; name: string; defenses: number } | null;
  /** Named at a midseason review while the belt is vacant: a label on their
   * row until they lose a matchup or card 11 crowns a Champion. */
  interim: { userId: string; name: string } | null;
  /** False while the field is only the table as it stands (until card 9 locks). */
  seedsFinal: boolean;
  /** Best first; empty below four ranked players. */
  seeds: { seed: number; userId: string }[];
  /** The bracket's matchups so far, saved or upcoming. */
  bracket: { stage: TitleStage; week: number; eventId: string | null; a: string; b: string }[];
};

type RawTitle = {
  season: string | null;
  champion: { userId: string; name: string; defenses: number } | null;
  interim?: { userId: string; name: string } | null;
  seedsFinal: boolean;
  seeds: { seed: number; userId: string }[] | null;
  bracket: { stage: TitleStage; week: number; eventId: string | null; a: string; b: string }[] | null;
};

export function toLeagueTitle(raw: RawTitle): LeagueTitle {
  return {
    preseason: raw.season == null,
    champion: raw.champion ?? null,
    interim: raw.champion ? null : (raw.interim ?? null),
    seedsFinal: !!raw.seedsFinal,
    seeds: raw.seeds ?? [],
    bracket: raw.bracket ?? [],
  };
}

export type MatchupTitle = {
  tag: "TITLE FIGHT" | "TITLE SHOT";
  /** The line under the matchup. */
  line: string;
  /** Who holds the belt in this matchup, if either does. */
  championId: string | null;
};

const seedOf = (title: LeagueTitle, userId: string) => title.seeds.find((s) => s.userId === userId)?.seed;

/** What a matchup means for the title: a bracket round (a title shot until
 * card 11's title fight), or the Champion's matchup. Null for any other. */
export function matchupTitle(
  title: LeagueTitle | null,
  matchup: Pick<Matchup, "eventId" | "a" | "b" | "isMine">,
  leagueName: string,
): MatchupTitle | null {
  if (!title || title.preseason) return null;
  const { a, b } = matchup;
  const champ = title.champion;
  const championId = champ && (champ.userId === a.userId || champ.userId === b.userId) ? champ.userId : null;

  const round = title.bracket.find(
    (r) =>
      r.eventId === matchup.eventId &&
      ((r.a === a.userId && r.b === b.userId) || (r.a === b.userId && r.b === a.userId)),
  );
  if (round) {
    if (round.stage === "title") return { tag: "TITLE FIGHT", line: `For the ${leagueName} belt`, championId };
    const sa = seedOf(title, a.userId);
    const sb = seedOf(title, b.userId);
    const seeds = sa != null && sb != null ? ` · #${Math.min(sa, sb)} vs #${Math.max(sa, sb)}` : "";
    return round.stage === "play_in"
      ? { tag: "TITLE SHOT", line: `Play-in${seeds} · the winner goes to the semis`, championId }
      : { tag: "TITLE SHOT", line: `Semifinal${seeds} · the winner fights for the belt`, championId };
  }

  if (!championId || !champ) return null;
  if (matchup.isMine && championId === a.userId) {
    return { tag: "TITLE FIGHT", line: `You defend the ${leagueName} belt`, championId };
  }
  return { tag: "TITLE FIGHT", line: `${champ.name} defends the ${leagueName} belt`, championId };
}

/** Whether there's a title to show: a Champion, or a field (projected or
 * set). A league too small for a bracket shows none. */
export function hasTitle(title: LeagueTitle | null): title is LeagueTitle {
  return !!title && !title.preseason && (!!title.champion || title.seeds.length >= 4);
}

/** The player whose row the title shot line goes under, until the field is
 * set: the last of the projected seeds. Null without a projected field. */
export function titleShotCut(title: LeagueTitle | null): string | null {
  if (!title || title.preseason || title.seedsFinal || title.seeds.length < 4) return null;
  return title.seeds[title.seeds.length - 1].userId;
}

/** What the C slot says under the Champion's name. */
export function champLine(champ: { defenses: number }): string {
  if (champ.defenses === 0) return "CHAMPION";
  return `CHAMPION · ${champ.defenses} ${champ.defenses === 1 ? "DEFENSE" : "DEFENSES"}`;
}

/* ------------------------------------------------------------------ *
 * Database
 * ------------------------------------------------------------------ */

/** Null from a server from before title fights. */
export async function loadLeagueTitle(leagueId: string): Promise<LeagueTitle | null> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("league_title", { league: leagueId });
  if (error || !data) return null;
  return toLeagueTitle(data as RawTitle);
}
