// Blocking players. A blocked player shows as "Blocked player" to you in
// leagues, matchups, the leaderboard and your inbox, and their league joins
// aren't sent to you. They aren't told, and leagues are unchanged.

export type BlockedPlayer = { userId: string; name: string; blockedAt: Date };

type Raw = { player: string; display_name: string; blocked_at: string };

export function toBlocked(raw: Raw[]): BlockedPlayer[] {
  return raw.map((r) => ({ userId: r.player, name: r.display_name, blockedAt: new Date(r.blocked_at) }));
}

async function db() {
  return (await import("./supabase")).supabase;
}

export async function blockPlayer(userId: string): Promise<void> {
  const { error } = await (await db()).rpc("block_player", { player: userId });
  if (error) throw new Error(error.message);
}

export async function unblockPlayer(userId: string): Promise<void> {
  const { error } = await (await db()).rpc("unblock_player", { player: userId });
  if (error) throw new Error(error.message);
}

export async function loadBlocked(): Promise<BlockedPlayer[]> {
  const { data, error } = await (await db()).rpc("my_blocks");
  if (error) throw new Error(error.message);
  return toBlocked((data ?? []) as Raw[]);
}
