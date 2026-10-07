import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { loadUnreadCount } from "../services/inbox";
import { makeCommonStyles } from "../styles/common";
import { NotificationBell, ProfileBadge } from "./svg/icons";
import PressableScale from "./PressableScale";

/*
 * The header every screen shares.
 *
 * It existed as copy-pasted JSX on five screens, which meant the avatar and
 * the bell were decoration — nothing happened when you tapped them. Pulling
 * it into one component gives both a single destination and stops the next
 * screen forgetting to wire them. The bell shows a dot while anything in the
 * inbox is unread, checked each time the screen comes into view.
 */
export default function HeaderBar({ title = "Fight Night Fantasy" }: { title?: string }) {
  const router = useRouter();
  const [hasNotifications, setHasNotifications] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let current = true;
      loadUnreadCount()
        .then((n) => current && setHasNotifications(n > 0))
        .catch(() => {});
      return () => {
        current = false;
      };
    }, [])
  );
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);

  return (
    <>
      <View style={commonStyles.row}>
        <PressableScale
          onPress={() => router.push("/profile")}
          hitSlop={8}
          scaleTo={0.92}
        >
          <ProfileBadge />
        </PressableScale>

        <Text style={commonStyles.headerLogo} numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>

        <PressableScale
          onPress={() => router.push("/notifications")}
          hitSlop={8}
          scaleTo={0.92}
        >
          <NotificationBell hasNotifications={hasNotifications} />
        </PressableScale>
      </View>
      <View style={[commonStyles.divider, { backgroundColor: c.border }]} />
    </>
  );
}
