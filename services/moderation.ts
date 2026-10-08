// Moderation: the queue of open cases, one case in full, the history of
// decisions, and acting on a case. Every call is checked on the server; only
// moderators get anything back. The shaping is pure so it can be tested
// without a database.

export type Standing = "active" | "suspended" | "banned";
export type Action = "dismiss" | "warn" | "reset_name" | "suspend" | "ban" | "lift";

export type QueueItem = {
  caseId: number;
  player: string;
  /** Null once the name has been cleared. */
  name: string | null;
  reporters: number;
  reasons: string[];
  openedAt: Date;
  strikes: number;
  standing: Standing;
  protected: boolean;
};

export type CaseReport = {
  id: number;
  reportedName: string;
  reason: string | null;
  note: string | null;
  league: string | null;
  reporter: string | null;
  reporterEstablished: boolean;
  at: Date;
};

export type PastAction = {
  id: number;
  caseId: number;
  action: Action;
  reason: string | null;
  note: string | null;
  expiresAt: Date | null;
  /** Null when it was run from the SQL editor. */
  moderator: string | null;
  at: Date;
};

export type CaseDetail = {
  id: number;
  status: "open" | "actioned" | "dismissed";
  openedAt: Date;
  resolvedAt: Date | null;
  player: {
    id: string;
    name: string | null;
    pastNames: string[];
    standing: Standing;
    until: Date | null;
    strikes: number;
    protected: boolean;
  };
  reports: CaseReport[];
  actions: PastAction[];
};

export type HistoryItem = {
  actionId: number;
  caseId: number;
  playerName: string | null;
  action: Action;
  reason: string | null;
  note: string | null;
  expiresAt: Date | null;
  moderator: string | null;
  at: Date;
};

/** How each action reads in a list. */
export const ACTION_LABEL: Record<Action, string> = {
  dismiss: "Dismissed",
  warn: "Warned",
  reset_name: "Name reset",
  suspend: "Suspended",
  ban: "Banned",
  lift: "Lifted",
};

/** Suspension lengths offered on the case screen, in days. */
export const SUSPENSION_DAYS = [1, 7, 30] as const;

/** The escalation policy's next step after this many strikes. */
export function suggestion(strikes: number): string {
  if (strikes === 0) return "Reset the name and warn";
  if (strikes === 1) return "Reset the name and suspend for 7 days";
  return "Ban";
}

/** What can be done to a case: dismiss only while it is open, lift only
 * while the player is suspended or banned. */
export function availableActions(c: Pick<CaseDetail, "status" | "player">): Action[] {
  const actions: Action[] = [];
  if (c.status === "open") actions.push("dismiss");
  if (c.status !== "dismissed") actions.push("warn", "reset_name", "suspend", "ban");
  if (c.player.standing !== "active") actions.push("lift");
  return actions;
}

/** "5m", "3h", "2d" since a case opened. */
export function openFor(since: Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const date = (v: string | null | undefined) => (v ? new Date(v) : null);

type RawQueue = {
  case_id: number;
  player: string;
  name: string | null;
  reporters: number;
  reasons: string[] | null;
  opened_at: string;
  strikes: number;
  standing: Standing;
  protected: boolean;
};

export function toQueue(raw: RawQueue[]): QueueItem[] {
  return raw.map((r) => ({
    caseId: r.case_id,
    player: r.player,
    name: r.name,
    reporters: r.reporters,
    reasons: r.reasons ?? [],
    openedAt: new Date(r.opened_at),
    strikes: r.strikes,
    standing: r.standing,
    protected: r.protected,
  }));
}

type RawCase = {
  id: number;
  status: CaseDetail["status"];
  openedAt: string;
  resolvedAt: string | null;
  player: {
    id: string;
    name: string | null;
    pastNames: string[] | null;
    standing: Standing;
    until: string | null;
    strikes: number;
    protected: boolean;
  };
  reports: (Omit<CaseReport, "at"> & { at: string })[] | null;
  actions: (Omit<PastAction, "at" | "expiresAt"> & { at: string; expiresAt: string | null })[] | null;
};

export function toCase(raw: RawCase): CaseDetail {
  return {
    id: raw.id,
    status: raw.status,
    openedAt: new Date(raw.openedAt),
    resolvedAt: date(raw.resolvedAt),
    player: {
      id: raw.player.id,
      name: raw.player.name ?? null,
      pastNames: raw.player.pastNames ?? [],
      standing: raw.player.standing,
      until: date(raw.player.until),
      strikes: raw.player.strikes,
      protected: !!raw.player.protected,
    },
    reports: (raw.reports ?? []).map((r) => ({
      id: r.id,
      reportedName: r.reportedName,
      reason: r.reason ?? null,
      note: r.note ?? null,
      league: r.league ?? null,
      reporter: r.reporter ?? null,
      reporterEstablished: !!r.reporterEstablished,
      at: new Date(r.at),
    })),
    actions: (raw.actions ?? []).map((a) => ({
      id: a.id,
      caseId: a.caseId,
      action: a.action,
      reason: a.reason ?? null,
      note: a.note ?? null,
      expiresAt: date(a.expiresAt),
      moderator: a.moderator ?? null,
      at: new Date(a.at),
    })),
  };
}

type RawHistory = {
  action_id: number;
  case_id: number;
  player_name: string | null;
  action: Action;
  reason: string | null;
  note: string | null;
  expires_at: string | null;
  moderator: string | null;
  created_at: string;
};

export function toHistory(raw: RawHistory[]): HistoryItem[] {
  return raw.map((r) => ({
    actionId: r.action_id,
    caseId: r.case_id,
    playerName: r.player_name,
    action: r.action,
    reason: r.reason,
    note: r.note,
    expiresAt: date(r.expires_at),
    moderator: r.moderator,
    at: new Date(r.created_at),
  }));
}

/* ------------------------------------------------------------------ *
 * Database
 * ------------------------------------------------------------------ */

async function db() {
  return (await import("./supabase")).supabase;
}

export async function isModerator(): Promise<boolean> {
  const { data, error } = await (await db()).rpc("am_moderator");
  if (error) throw new Error(error.message);
  return data === true;
}

export async function loadQueue(): Promise<QueueItem[]> {
  const { data, error } = await (await db()).rpc("moderation_queue");
  if (error) throw new Error(error.message);
  return toQueue((data ?? []) as RawQueue[]);
}

export async function loadCase(caseId: number): Promise<CaseDetail> {
  const { data, error } = await (await db()).rpc("moderation_case", { case_id: caseId });
  if (error) throw new Error(error.message);
  return toCase(data as RawCase);
}

export async function loadHistory(maxRows = 50): Promise<HistoryItem[]> {
  const { data, error } = await (await db()).rpc("moderation_history", { max_rows: maxRows });
  if (error) throw new Error(error.message);
  return toHistory((data ?? []) as RawHistory[]);
}

/** Records a decision. `reason` is shown to the player; `note` is not. */
export async function moderate(
  caseId: number,
  action: Action,
  opts: { reason?: string; note?: string; days?: number } = {}
): Promise<void> {
  const { error } = await (await db()).rpc("moderate", {
    case_id: caseId,
    action,
    reason: opts.reason?.trim() || null,
    note: opts.note?.trim() || null,
    duration: action === "suspend" && opts.days ? `${opts.days} days` : null,
  });
  if (error) throw new Error(error.message);
}
