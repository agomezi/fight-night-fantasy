import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { LeagueTier, PickRule } from "../services/leagues";
import {
  bannerText,
  dismissUntil,
  leagueShortfalls,
  loadDismissed,
  minimumBanner,
  saveDismissed,
  type MinimumBout,
} from "../services/pickMinimum";
import PressableScale from "./PressableScale";

/**
 * Under the header on Home: a league's minimum picks you haven't met yet,
 * from the day before the card. The suspended-account banner's box, so it
 * reads as something to act on. ✕ hides it until the next section's lock
 * reminder; a minimum already missed stays, with no ✕.
 */
export default function PickMinimumBanner({
  eventId,
  card,
  firstLock,
  leagues,
  saved,
  now,
}: {
  eventId: string;
  /** The whole card, main event first, void fights included. */
  card: MinimumBout[];
  firstLock: Date;
  leagues: { name: string; tier: LeagueTier; rule?: PickRule | null }[];
  /** Saved picks only: a draft doesn't count for a league. */
  saved: (boutId: string) => boolean;
  now: Date;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const [dismissed, setDismissed] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    loadDismissed(eventId).then((v) => current && setDismissed(v));
    return () => {
      current = false;
    };
  }, [eventId]);

  // Nothing until the dismissal is read, so a dismissed banner doesn't flash.
  if (dismissed === undefined) return null;
  const banner = minimumBanner(leagueShortfalls(leagues, card, saved, now), firstLock, now, dismissed);
  if (!banner) return null;
  const { title, body } = bannerText(banner, now);

  const dismiss = () => {
    if (banner.kind !== "short") return;
    const until = dismissUntil(banner.soonest, now);
    setDismissed(until);
    saveDismissed(eventId, until);
  };

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: c.redTint,
        borderColor: c.red,
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        paddingRight: banner.kind === "short" ? 40 : 12,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: c.red, fontWeight: "800", fontSize: 13 }}>{title}</Text>
      <Text style={{ color: c.text2, fontSize: 12.5, marginTop: 3, lineHeight: 17 }}>{body}</Text>
      {banner.kind === "short" && (
        <>
          <PressableScale onPress={() => router.navigate("/picks")} hitSlop={8} style={{ alignSelf: "flex-start", marginTop: 9 }}>
            <Text style={{ color: c.red, fontWeight: "800", fontSize: 12, letterSpacing: 1 }}>MAKE PICKS ›</Text>
          </PressableScale>
          <PressableScale
            onPress={dismiss}
            accessibilityLabel="Dismiss"
            hitSlop={6}
            style={{ position: "absolute", top: 6, right: 6, width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="close" size={16} color={c.textMuted} />
          </PressableScale>
        </>
      )}
    </View>
  );
}
