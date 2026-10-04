// Sending claimed notifications through Expo's push service, which forwards
// them to Apple and Google. No credentials are needed here: the app's push
// key lives with Expo, set up when the build is made.

import { notificationText, type NotificationKind } from "../../../services/notificationText.ts";

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";
// Expo accepts up to 100 messages a request.
const BATCH = 100;

export type Claimed = { user_id: string; kind: NotificationKind; payload: unknown; tokens: string[]; wanted: boolean };

type Ticket = { status: "ok" | "error"; details?: { error?: string } };

/** Sends every claimed notification the player wants to every phone they
 * have. Returns how many went out and the tokens Expo says are dead, which
 * the caller removes.
 */
export async function sendClaimed(claimed: Claimed[]): Promise<{ sent: number; deadTokens: string[] }> {
  const messages = claimed
    .filter((c) => c.wanted && c.tokens.length)
    .flatMap((c) => {
      const { title, body, data } = notificationText(c.kind, c.payload);
      return c.tokens.map((to) => ({ to, title, body, data, sound: "default" as const }));
    });

  let sent = 0;
  const deadTokens: string[] = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    const response = await fetch(EXPO_PUSH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from Expo push`);
    const { data } = (await response.json()) as { data: Ticket[] };
    data.forEach((ticket, j) => {
      if (ticket.status === "ok") sent += 1;
      else if (ticket.details?.error === "DeviceNotRegistered") deadTokens.push(batch[j].to);
    });
  }
  return { sent, deadTokens };
}
