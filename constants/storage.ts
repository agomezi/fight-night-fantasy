// On-device copy of a profile, kept per account so a different account
// signing in on the same phone never sees it.
export const profileStorageKey = (userId: string) => `fnf.profile.${userId}`;

// The unscoped key used before profiles were per account.
export const LEGACY_PROFILE_KEY = "fnf.profile";

// The league the Leagues tab shows, per account.
export const selectedLeagueKey = (userId: string) => `fnf.league.selected.${userId}`;

// Picks edited but not locked in yet, per account and event.
export const pickDraftKey = (userId: string, eventId: string) => `fnf.picks.draft.${userId}.${eventId}`;

// A league's table before the latest card, for the up/down arrows, per account.
export const rankMovesKey = (userId: string, leagueId: string) => `fnf.league.moves.${userId}.${leagueId}`;

// Set once the first launch's boot animation has played on this phone.
export const BOOT_SEEN_KEY = "fnf.boot.seen";

// The newest "what's new" entry this account has closed on this phone.
export const whatsNewSeenKey = (userId: string) => `fnf.whatsnew.seen.${userId}`;

// The newest award drop this account has seen revealed, per league.
export const awardsSeenKey = (userId: string, leagueId: string) => `fnf.awards.seen.${userId}.${leagueId}`;
