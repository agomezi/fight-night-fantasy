import { View } from "react-native";
import Skeleton from "./Skeleton";

/**
 * Placeholders shaped like the screen that's loading, in place of a spinner.
 *
 * - leagues: league chips, the matchup card, two buttons, standings rows
 * - list: a column of rows, for standings, matchups and the inbox
 * - sheet: a profile card's name, stats and buttons
 */
export default function ScreenSkeleton({
  variant,
  rows = 6,
}: {
  variant: "leagues" | "list" | "sheet";
  rows?: number;
}) {
  if (variant === "sheet") {
    return (
      <View testID="screen-skeleton" style={{ paddingVertical: 16, gap: 12, alignItems: "center" }}>
        <Skeleton width={64} height={64} radius={32} />
        <Skeleton width="50%" height={20} />
        <View style={{ flexDirection: "row", gap: 8, alignSelf: "stretch" }}>
          <Skeleton height={56} radius={10} style={{ flex: 1 }} />
          <Skeleton height={56} radius={10} style={{ flex: 1 }} />
        </View>
        <Skeleton height={44} radius={10} />
      </View>
    );
  }

  const list = (
    <View style={{ gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Skeleton width={36} height={36} radius={18} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width={`${60 - (i % 3) * 10}%`} height={13} />
            <Skeleton width="30%" height={10} />
          </View>
          <Skeleton width={36} height={18} />
        </View>
      ))}
    </View>
  );

  if (variant === "list") {
    return (
      <View testID="screen-skeleton" style={{ marginTop: 16 }}>
        {list}
      </View>
    );
  }

  return (
    <View testID="screen-skeleton" style={{ marginTop: 12, gap: 16 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Skeleton width={90} height={36} radius={18} />
        <Skeleton width={80} height={36} radius={18} />
      </View>
      <Skeleton height={252} radius={18} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Skeleton height={48} radius={10} style={{ flex: 1 }} />
        <Skeleton height={48} radius={10} style={{ flex: 1 }} />
      </View>
      <Skeleton width="40%" height={22} />
      {list}
    </View>
  );
}
