// The one Community card on Home, about everyone on the app, and the league
// card on each league's page. The server picks which card it is by where we
// are in fight week; this shapes it into what the card says. The shaping is
// pure so it can be tested without a database.

import { lastName, splitEventName } from "./events";
import { pickLabel } from "./history";

type Call = { finish: "round" | "DEC" | "ANY"; finish_round: number | null; method: "KO" | "SUB" | null };

export type RawPoll = {
  id: string;
  kind: "main_event" | "hot_take";
  question: string;
  options: string[];
  event_name: string;
  closes_at: string;
  open: boolean;
  votes: number;
  my_vote: string | null;
  /** Only once you've voted, or the take has closed. */
  split: Record<string, number> | null;
  /** How the fight was picked, once it has locked. */
  consensus: { fighter: string; pct: number; picks: number } | null;
  /** An option, "void", or null while it's still to be decided. */
  outcome: string | null;
};

type RawPlayer = { place: number; name: string; points: number; is_me: boolean };
type RawCall = Call & { name: string; is_me: boolean; fighter: string; with_them: number; on_fight: number };

export type RawCommunityCard =
  | { type: "poll"; phase: "open" | "live"; poll: RawPoll }
  | {
      type: "top_performers";
      event_name: string;
      /** Whether any fight on the card had an underdog. */
      has_dogs: boolean;
      players: RawPlayer[];
      me: { place: number; points: number; field: number } | null;
      ball_knowledge: RawCall | null;
      recap: RawPoll | null;
    }
  | {
      type: "crowd";
      event_name: string;
      /** The fighter most players picked, who lost. */
      crowd_fighter: string;
      pct: number;
      winner: string;
      method: "KO" | "SUB" | "DEC" | null;
      round: number | null;
      /** Fights where most players picked the winner, of those with enough picks. */
      right: number;
      fights: number;
      me: "crowd" | "against" | null;
    }
  | {
      type: "league";
      kind: "top_predictor" | "losers" | "craftiest" | "jobber";
      league_name: string;
      event_name: string;
      players: number;
      pick: (RawCall & { points: number }) | { name: string; is_me: boolean; points: number };
    }
  | { type: "none" };

export type PollOption = { key: string; label: string; pct: number | null; selected: boolean };

export type PollView = {
  id: string;
  tag: string;
  question: string;
  subtitle: string;
  open: boolean;
  options: PollOption[];
  /** The share who voted the way you did, 0-1, or null before you vote. */
  agree: number | null;
  /** "62% OF PLAYERS AGREE" */
  agreeLine: string | null;
  /** "75% picked PEREIRA" */
  consensus: string | null;
  /** "The community said YES 62%. It was NO." */
  outcome: string | null;
  /** "You called it." */
  verdict: string | null;
};

export type BoardView = {
  tag: string;
  title: string;
  subtitle: string;
  rows: { place: number; name: string; points: string; isMe: boolean }[];
  lines: string[];
};

export type CommunityView = { type: "poll"; poll: PollView } | { type: "board"; board: BoardView } | { type: "none" };

function signed(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${-points}` : "0";
}

function shortEvent(name: string): string {
  const { title, headline } = splitEventName(name);
  return headline ?? title;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** The option most voted for and its share, or null with no votes. */
function leader(split: Record<string, number> | null, options: string[]): { key: string; pct: number } | null {
  if (!split) return null;
  const total = options.reduce((n, o) => n + (split[o] ?? 0), 0);
  if (total === 0) return null;
  const key = options.reduce((best, o) => ((split[o] ?? 0) > (split[best] ?? 0) ? o : best), options[0]);
  return { key, pct: Math.round((100 * (split[key] ?? 0)) / total) };
}

export function toPollView(raw: RawPoll, live = false): PollView {
  const total = raw.split ? raw.options.reduce((n, o) => n + (raw.split?.[o] ?? 0), 0) : 0;
  const top = leader(raw.split, raw.options);
  const settled = raw.outcome != null;
  const mine = raw.my_vote && raw.split && total > 0 ? Math.round((100 * (raw.split[raw.my_vote] ?? 0)) / total) : null;
  return {
    id: raw.id,
    tag: live ? "LIVE TAKE" : raw.kind === "main_event" ? "MAIN EVENT TAKE" : "HOT TAKE",
    question: raw.question.toUpperCase(),
    subtitle: `${shortEvent(raw.event_name)} · ${raw.open ? "vote before it locks" : settled ? "settled" : "locked"}`,
    open: raw.open,
    options: raw.options.map((o) => ({
      key: o,
      label: o.toUpperCase(),
      pct: raw.split && total > 0 ? Math.round((100 * (raw.split[o] ?? 0)) / total) : raw.split ? 0 : null,
      selected: raw.my_vote === o,
    })),
    agree: mine == null ? null : mine / 100,
    agreeLine: mine == null ? null : `${mine}% OF PLAYERS AGREE`,
    consensus: raw.consensus ? `${raw.consensus.pct}% picked ${lastName(raw.consensus.fighter).toUpperCase()}` : null,
    outcome: !settled
      ? null
      : raw.outcome === "void"
        ? "Called off. This one doesn't count."
        : top
          ? `The community said ${top.key.toUpperCase()} ${top.pct}%. It was ${raw.outcome!.toUpperCase()}.`
          : `It was ${raw.outcome!.toUpperCase()}.`,
    verdict: !settled || raw.outcome === "void" || !raw.my_vote ? null : raw.my_vote === raw.outcome ? "You called it." : "You missed this one.",
  };
}

function callLine(c: RawCall): string {
  return pickLabel(c, c.fighter);
}

export function toCommunityView(raw: RawCommunityCard | null, onLeaguePage = false): CommunityView {
  if (!raw || raw.type === "none") return { type: "none" };
  if (raw.type === "poll") return { type: "poll", poll: toPollView(raw.poll, raw.phase === "live") };

  if (raw.type === "top_performers") {
    const lines: string[] = [];
    const bk = raw.ball_knowledge;
    if (bk) {
      lines.push(
        `Ball knowledge: ${bk.is_me ? "you" : bk.name} called ${callLine(bk)} when only ${bk.with_them} of ${bk.on_fight} took that side.`
      );
    } else if (raw.has_dogs) {
      lines.push("Nobody called an upset to the round this time.");
    }
    if (raw.me && raw.me.place > 3) lines.push(`You: ${ordinal(raw.me.place)} of ${raw.me.field}, ${signed(raw.me.points)}.`);
    if (raw.recap?.outcome) {
      const recap = toPollView(raw.recap);
      lines.push([recap.outcome, recap.verdict].filter(Boolean).join(" "));
    }
    return {
      type: "board",
      board: {
        tag: "TOP PERFORMERS",
        title: shortEvent(raw.event_name).toUpperCase(),
        subtitle: "The card's best scorers",
        rows: raw.players.map((p) => ({ place: p.place, name: p.name, points: signed(p.points), isMe: p.is_me })),
        lines,
      },
    };
  }

  if (raw.type === "crowd") {
    const how = raw.method === "DEC" ? "by decision" : raw.method === "SUB" ? "by submission" : raw.method === "KO" ? "by KO" : null;
    const lines = [
      raw.me === "against"
        ? `You had ${lastName(raw.winner).toUpperCase()}. Ball knowledge.`
        : raw.me === "crowd"
          ? "You went with the crowd on this one."
          : null,
      `The crowd went ${raw.right} for ${raw.fights} on ${shortEvent(raw.event_name)}.`,
    ].filter((l): l is string => l != null);
    return {
      type: "board",
      board: {
        tag: "CROWD VS. REALITY",
        title: `${raw.pct}% PICKED ${lastName(raw.crowd_fighter).toUpperCase()}`,
        subtitle: `${raw.winner} won${how ? ` ${how}` : ""}${raw.round && raw.method !== "DEC" ? ` in round ${raw.round}` : ""}.`,
        rows: [],
        lines,
      },
    };
  }

  const p = raw.pick;
  const who = p.is_me ? "You" : p.name;
  const event = shortEvent(raw.event_name);
  const copy: Record<typeof raw.kind, { tag: string; subtitle: string }> = {
    top_predictor: {
      tag: "TOP PREDICTOR",
      subtitle: p.is_me
        ? `You topped ${raw.league_name} on ${event} with ${signed(p.points)}. Act humble.`
        : `Topped ${raw.league_name} on ${event} with ${signed(p.points)}. Everyone else, take notes.`,
    },
    losers: {
      tag: "CAN MAN",
      subtitle: p.is_me
        ? `That's you, last in ${raw.league_name} on ${event} with ${signed(p.points)}. It happens.`
        : `Last in ${raw.league_name} on ${event} with ${signed(p.points)}. Somebody check on them.`,
    },
    jobber: {
      tag: "JOBBER",
      subtitle: p.is_me
        ? `Dead center of ${raw.league_name} on ${event} with ${signed(p.points)}. Not great, not terrible.`
        : `Dead center of ${raw.league_name} on ${event} with ${signed(p.points)}. Every card needs one.`,
    },
    craftiest: {
      tag: "CRAFTIEST PICK",
      subtitle:
        "fighter" in p
          ? `Called ${callLine(p)} on ${event} when only ${p.with_them} of ${p.on_fight} in ${raw.league_name} did.`
          : "",
    },
  };
  return {
    type: "board",
    // On the league's own page the league's name goes without saying.
    board: { tag: onLeaguePage ? copy[raw.kind].tag : `${raw.league_name.toUpperCase()} · ${copy[raw.kind].tag}`, title: who.toUpperCase(), subtitle: copy[raw.kind].subtitle, rows: [], lines: [] },
  };
}

async function db() {
  return (await import("./supabase")).supabase;
}

export async function loadCommunityCard(): Promise<RawCommunityCard> {
  const { data, error } = await (await db()).rpc("home_community_card");
  if (error) throw new Error(error.message);
  return (data ?? { type: "none" }) as RawCommunityCard;
}

/** The league's card for its own page: a recap of its last card, or null. */
export async function loadLeagueCommunityCard(leagueId: string): Promise<RawCommunityCard | null> {
  const { data, error } = await (await db()).rpc("league_community_card", { league: leagueId });
  if (error) throw new Error(error.message);
  return (data ?? null) as RawCommunityCard | null;
}

export class PollClosedError extends Error {}
/** Refused for another reason the player should read, like a suspension. */
export class VoteRefusedError extends Error {}

export async function votePoll(pollId: string, choice: string): Promise<RawPoll> {
  const { data, error } = await (await db()).rpc("vote_poll", { poll: pollId, choice });
  if (error?.hint === "closed") throw new PollClosedError(error.message);
  if (error?.hint === "suspended" || error?.hint === "banned") throw new VoteRefusedError(error.message);
  if (error) throw new Error(error.message);
  return data as RawPoll;
}

export async function loadTakesRecord(): Promise<{ wins: number; losses: number } | null> {
  const { data, error } = await (await db()).rpc("takes_record");
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  return row ? { wins: Number(row.wins), losses: Number(row.losses) } : null;
}
