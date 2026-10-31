// What a league owner should do before the first card, and the rules a player
// reads before joining. The steps and copy are pure; only the ticks an owner
// makes by hand are kept, on the phone, per league.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { MAX_MEMBERS, MIN_MEMBERS, TIER_LABEL, type LeagueTier, type MyLeague, type PickRule } from "./leagues";

/** The minimum for Casual and Amateur, which the owner can't change. */
export const FIXED_MINIMUM: Record<"casual" | "amateur", string> = {
  casual: "the whole main card",
  amateur: "the main card and the last 3 prelims",
};

/** Under the tier picker on the create form: what the minimum will be. */
export const TIER_MINIMUM_LINE: Record<Exclude<LeagueTier, "hardcore">, string> = {
  casual: "Everyone picks the whole main card, every card.",
  amateur: "Everyone picks the main card and the last 3 prelims, every card.",
  pro: "You'll set the minimum picks next.",
};

const FORFEIT = "Anyone short forfeits the week; their opponent gets half a win.";

/** Doubleheaders only happen once there are matchups, from 4 players. */
function hasDoubleheader(players: number): boolean {
  return players >= MIN_MEMBERS && players % 2 === 1;
}

function setsOwnMinimum(tier: LeagueTier): boolean {
  return tier === "pro" || tier === "hardcore";
}

/** "the main card", "the top 12 fights", … for a sentence. */
export function minimumPhrase(tier: LeagueTier, rule: PickRule | null): string {
  if (!setsOwnMinimum(tier)) return FIXED_MINIMUM[tier as "casual" | "amateur"];
  const scope = rule?.scope ?? "main_event";
  if (scope === "whole_card") return "the whole card";
  if (scope === "main_card") return "the main card";
  if (scope === "top_n" && rule?.topN) return `the top ${rule.topN} fights`;
  return "the main event";
}

// --------------------------------------------------------------------------
// The owner's checklist
// --------------------------------------------------------------------------

/** The ticks an owner makes by hand. Member count and tier tick themselves. */
export type ChecklistTicks = { minimum?: boolean; doubleheader?: boolean; dismissed?: boolean };

export type ChecklistStepId = "invite" | "tier" | "minimum" | "doubleheader";

export type ChecklistStep = {
  id: ChecklistStepId;
  title: string;
  detail: string;
  done: boolean;
};

export type Checklist = { steps: ChecklistStep[]; done: number; total: number };

/**
 * The steps for a league, or null when the checklist shouldn't show: not the
 * owner, dismissed, every step done, or the league's first card has locked.
 */
export function leagueChecklist(league: MyLeague, ticks: ChecklistTicks, started: boolean): Checklist | null {
  if (!league.isOwner || ticks.dismissed || started) return null;

  const own = setsOwnMinimum(league.tier);
  const steps: ChecklistStep[] = [
    {
      id: "invite",
      title: `Get to ${MIN_MEMBERS} players`,
      detail: `Leagues are ${MIN_MEMBERS}–${MAX_MEMBERS}. You have ${league.members}.`,
      done: league.members >= MIN_MEMBERS,
    },
    {
      id: "tier",
      title: `Tier set: ${TIER_LABEL[league.tier]}`,
      detail: "You can move up a tier between seasons, never down.",
      done: true,
    },
    own
      ? {
          id: "minimum",
          title: "Set the minimum picks",
          detail: `${capitalise(minimumPhrase(league.tier, league.rule))} unless you change it. ${FORFEIT}`,
          done: !!ticks.minimum,
        }
      : {
          id: "minimum",
          title: `Minimum: ${minimumPhrase(league.tier, null)}`,
          detail: `Fixed for ${TIER_LABEL[league.tier]}. ${FORFEIT}`,
          done: true,
        },
  ];
  if (hasDoubleheader(league.members)) {
    steps.push({
      id: "doubleheader",
      title: "Know about doubleheaders",
      detail: `With ${league.members} players, one person plays two matchups each card. Add a ${ordinal(
        league.members + 1
      )} to even it out.`,
      done: !!ticks.doubleheader,
    });
  }

  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return { steps, done, total: steps.length };
}

/** True once any of the league's cards has locked: the checklist is past its use.
 * `started` is the server's answer across every season; the weeks are a
 * fallback for a server that can't say. */
export function leagueStarted(started: boolean | undefined, weeks: { state: "upcoming" | "live" | "final" }[]): boolean {
  if (started != null) return started;
  return weeks.some((w) => w.state !== "upcoming");
}

/** The caller's leagues that have had a card lock since they were made. */
export async function loadStartedLeagues(): Promise<Map<string, boolean>> {
  const { data, error } = await (await db()).rpc("my_leagues_started");
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { league_id: string; started: boolean }[]).map((r) => [r.league_id, !!r.started]));
}

export function checklistKey(userId: string, leagueId: string): string {
  return `league-checklist:${userId}:${leagueId}`;
}

export async function loadChecklistTicks(userId: string, leagueId: string): Promise<ChecklistTicks> {
  try {
    const raw = await AsyncStorage.getItem(checklistKey(userId, leagueId));
    return raw ? (JSON.parse(raw) as ChecklistTicks) : {};
  } catch {
    return {};
  }
}

export async function saveChecklistTicks(userId: string, leagueId: string, ticks: ChecklistTicks): Promise<void> {
  try {
    await AsyncStorage.setItem(checklistKey(userId, leagueId), JSON.stringify(ticks));
  } catch {}
}

// --------------------------------------------------------------------------
// The rules sheet before joining, and the rules in League Settings
// --------------------------------------------------------------------------

export type LeaguePreview = {
  name: string;
  tier: LeagueTier;
  members: number;
  maxMembers: number;
  rule: PickRule | null;
  alreadyMember: boolean;
  /** Joining now waits for the next season. */
  queued: boolean;
  isFull: boolean;
};

export type RawLeaguePreview = {
  name: string;
  tier: LeagueTier;
  members: number;
  max_members: number;
  scope: PickRule["scope"] | null;
  top_n: number | null;
  already_member: boolean;
  queued: boolean;
  is_full: boolean;
};

export function toLeaguePreview(raw: RawLeaguePreview[]): LeaguePreview | null {
  const r = raw[0];
  if (!r) return null;
  return {
    name: r.name,
    tier: r.tier,
    members: Number(r.members),
    maxMembers: Number(r.max_members),
    rule: r.scope ? { scope: r.scope, topN: r.top_n == null ? null : Number(r.top_n) } : null,
    alreadyMember: !!r.already_member,
    queued: !!r.queued,
    isFull: !!r.is_full,
  };
}

export type RuleRow = { icon: "people" | "doubleheader" | "minimum"; title: string; body: string };

export type RulesSheet = { eyebrow: string; title: string; intro: string; rows: RuleRow[] };

/** The league's rules as a joiner or member reads them. */
export function rulesSheet(
  league: { name: string; tier: LeagueTier; members: number; rule: PickRule | null; queued?: boolean },
  joining: boolean
): RulesSheet {
  const waits = joining && !!league.queued;
  const rows: RuleRow[] = [
    {
      icon: "people",
      title: `${MIN_MEMBERS} to ${MAX_MEMBERS} players`,
      body: waits
        ? "The season is under way, so you join the rotation when the next one starts. Your picks still count globally."
        : `Matchups start once there are ${MIN_MEMBERS}. Opponents rotate each card.`,
    },
  ];
  // Joining makes the rotation one bigger, unless you wait for the next season.
  const count = league.members + (joining && !waits ? 1 : 0);
  if (hasDoubleheader(count)) {
    rows.push({
      icon: "doubleheader",
      title: "Odd count, doubleheader",
      body: "With an odd number of players, one player has two matchups that card.",
    });
  }
  rows.push({
    icon: "minimum",
    title: `Pick at least ${minimumPhrase(league.tier, league.rule)}`,
    body: "Miss it and you forfeit the week. Your opponent gets half a win.",
  });
  return {
    eyebrow: `${TIER_LABEL[league.tier].toUpperCase()} LEAGUE`,
    title: joining ? "Before you join" : "League rules",
    intro: joining
      ? `The rules in ${league.name}. You can read them again in League Settings.`
      : `How ${league.name} plays.`,
    rows,
  };
}

async function db() {
  return (await import("./supabase")).supabase;
}

/** Too many wrong codes lately; the message says to wait. */
export class RateLimitedError extends Error {}

/** What a failed preview throws. */
export function previewError(error: { message: string; hint?: string | null }): Error {
  return error.hint === "rate_limited" ? new RateLimitedError(error.message) : new Error(error.message);
}

/** A league's rules by invite code; null for a code no league has. A wrong
 * code is recorded, so this must stay a POST (no `get: true`). */
export async function previewLeague(code: string): Promise<LeaguePreview | null> {
  const { data, error } = await (await db()).rpc("league_preview", { code });
  if (error) throw previewError(error);
  return toLeaguePreview((data ?? []) as RawLeaguePreview[]);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}
