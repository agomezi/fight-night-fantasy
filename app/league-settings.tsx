import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Share, Switch, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import PressableScale from "../components/PressableScale";
import { ScoreRow, Scorecard } from "../components/Scorecard";
import { LEAGUE, SEASON_STANDINGS } from "../constants/league";
import { appear } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeCommonStyles } from "../styles/common";

/** Six characters, readable aloud — no ambiguous 0/O or 1/I. */
const INVITE_CODE = "APEX7K";

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export default function LeagueSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);

  const [notifyResults, setNotifyResults] = useState(true);
  const [notifyChatter, setNotifyChatter] = useState(false);
  const [lockReminder, setLockReminder] = useState(true);

  const switchColors = {
    trackColor: { false: c.borderStrong, true: c.red },
    thumbColor: "#FFFFFF",
    ios_backgroundColor: c.borderStrong,
  };

  const shareInvite = () => {
    Share.share({
      message: LEAGUE
        ? `Join "${LEAGUE.name}" on Fight Night. Code: ${INVITE_CODE}`
        : `Join me on Fight Night. Code: ${INVITE_CODE}`,
    }).catch(() => {});
  };

  const confirmLeave = () => {
    Alert.alert(
      "Leave this league?",
      "Your picks stay on your record. You drop out of these standings and lose your history here.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => router.back() },
      ],
    );
  };

  const sectionLabel = {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 1.4,
    marginTop: 30,
    marginBottom: 6,
  };

  const toggles = [
    {
      key: "results",
      label: "Bout results",
      sub: "As each fight is scored",
      value: notifyResults,
      set: setNotifyResults,
    },
    {
      key: "lock",
      label: "Card locking",
      sub: "A few hours before picks close",
      value: lockReminder,
      set: setLockReminder,
    },
    {
      key: "chatter",
      label: "League chatter",
      sub: "Every message in the league",
      value: notifyChatter,
      set: setNotifyChatter,
    },
  ];

  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
      >
        <View style={commonStyles.row}>
          <PressableScale onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </PressableScale>
          <Text style={commonStyles.headerLogo}>League</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={commonStyles.divider} />

        <Animated.View entering={appear(0)}>
          <Text
            style={{
              fontFamily: "BebasNeue",
              fontSize: 40,
              color: c.text,
              letterSpacing: 1,
            }}
          >
            {LEAGUE ? LEAGUE.name : "No league"}
          </Text>
          <Text style={{ color: c.textMuted, fontSize: 13, marginTop: -2 }}>
            {LEAGUE ? `${LEAGUE.kind.toLowerCase()} · week ${LEAGUE.week}` : "—"}
          </Text>
        </Animated.View>

        {/* Invite code leads, because getting people in is the whole job of
            this screen for a new league. */}
        <Text style={sectionLabel}>INVITE</Text>
        <Animated.View
          entering={appear(1)}
          style={{
            backgroundColor: c.inset,
            borderRadius: 12,
            padding: 16,
            marginTop: 4,
          }}
        >
          <Text style={{ color: c.textFaint, fontSize: 10.5, letterSpacing: 1.2 }}>
            INVITE CODE
          </Text>
          <Text
            style={{
              color: c.text,
              fontSize: 30,
              fontWeight: "800",
              letterSpacing: 6,
              marginTop: 6,
            }}
          >
            {INVITE_CODE}
          </Text>
          <PressableScale
            onPress={shareInvite}
            style={{
              marginTop: 14,
              backgroundColor: c.red,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 12,
                fontWeight: "800",
                letterSpacing: 1,
              }}
            >
              SHARE INVITE
            </Text>
          </PressableScale>
        </Animated.View>

        <Text style={sectionLabel}>SCORING</Text>
        <Scorecard>
          <ScoreRow index={0} label="Correct winner" value="+100" />
          <ScoreRow index={1} label="Correct method" value="+50" />
          <ScoreRow index={2} label="Correct round" value="+30" />
          <ScoreRow index={3} label="Underdog bonus" value="1.5x" />
          <ScoreRow index={4} label="Missed pick" value="0" last />
        </Scorecard>

        <Text style={sectionLabel}>NOTIFY ME ABOUT</Text>
        {toggles.map((row, i) => (
          <Animated.View
            key={row.key}
            entering={appear(i)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              paddingVertical: 14,
              borderBottomWidth: i === toggles.length - 1 ? 0 : 1,
              borderBottomColor: c.border,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 14.5, fontWeight: "700" }}>
                {row.label}
              </Text>
              <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>
                {row.sub}
              </Text>
            </View>
            <Switch value={row.value} onValueChange={row.set} {...switchColors} />
          </Animated.View>
        ))}

        <Text style={sectionLabel}>
          MEMBERS · {SEASON_STANDINGS.length || (LEAGUE ? LEAGUE.members : 0)}
        </Text>
        {SEASON_STANDINGS.map((s, i) => (
          <Animated.View
            key={s.id}
            entering={appear(i)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: i === SEASON_STANDINGS.length - 1 ? 0 : 1,
              borderBottomColor: c.border,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: c.inset,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: "800" }}>
                {initialsOf(s.name)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: s.isMe ? c.red : c.text,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                {s.name}
              </Text>
              <Text style={{ color: c.textFaint, fontSize: 11.5 }}>{s.team}</Text>
            </View>
            {s.rank === 1 && (
              <Text
                style={{
                  color: c.gold,
                  fontSize: 10,
                  fontWeight: "800",
                  letterSpacing: 1,
                }}
              >
                LEADER
              </Text>
            )}
          </Animated.View>
        ))}

        <Text style={[sectionLabel, { color: c.red }]}>DANGER ZONE</Text>
        <PressableScale
          onPress={confirmLeave}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 15,
          }}
        >
          <Ionicons name="exit-outline" size={20} color={c.red} />
          <Text style={{ flex: 1, color: c.red, fontSize: 15, fontWeight: "700" }}>
            Leave league
          </Text>
          <Ionicons name="chevron-forward" size={18} color={c.red} />
        </PressableScale>
        <Text style={{ color: c.textFaint, fontSize: 12, lineHeight: 18 }}>
          Your picks stay on your record. You drop out of these standings and
          lose your history in this league.
        </Text>
      </ScrollView>

      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
