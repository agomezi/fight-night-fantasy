// On-device copy of a profile, kept per account so a different account
// signing in on the same phone never sees it.
export const profileStorageKey = (userId: string) => `fnf.profile.${userId}`;

// The unscoped key used before profiles were per account.
export const LEGACY_PROFILE_KEY = "fnf.profile";
