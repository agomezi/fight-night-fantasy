import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, ActivityIndicator, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import EmptyState from "../components/EmptyState";
import PressableScale from "../components/PressableScale";
import ScoringRules from "../components/ScoringRules";
import { appear } from "../constants/motion";
import { getInitials } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useLeague } from "../hooks/useLeague";
import {
  inviteMessage,
  leaveLeague,
  removeMember,
  TIER_BLURB,
  TIER_LABEL,
  type LeagueStanding,
} from "../services/leagues";
import { makeCommonStyles } from "../styles/common";

const MEMBER_NOTE: Partial<Record<LeagueStanding["status"], string>> = {
  queued: "Joins next season",
  left: "Leaving at season end",
  former: "Deleted account",
};

export default function LeagueSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const state = useLeague(id);

  const league = state.status === "ready" ? state.league : null;
  const members = state.status === "ready" ? (state.standings?.rows ?? []) : [];
  const me = members.find((m) => m.isMe);

  const sectionLabel = {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 1.4,
    marginTop: 30,
    marginBottom: 6,
  };

  const header = (
    <>
      <View style={commonStyles.row}>
        <PressableScale onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </PressableScale>
        <Text style={commonStyles.headerLogo}>League</Text>
        <View style={{ width: 26 }} />
      </View>
      <View style={commonStyles.divider} />
    </>
  );

  /*
   * Nothing on this screen means anything without a league: there is no code
   * to hand out and no member list. So the whole screen becomes the one thing
   * that is actually true — you need a league first.
   */
  if (!league) {
    return (
      <SafeAreaView style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]} edges={["top", "left", "right"]}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
          {header}
          {state.status === "loading" ? (
            <ActivityIndicator color={c.red} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState
              icon="settings-outline"
              title="No league to set up"
              message="Create a league or join one with a code — the invite code, scoring and member list all live here once you're in."
              actionLabel="GO TO LEAGUES"
              onAction={() => router.replace("/leagues")}
            />
          )}

          {/* The rules are worth reading before you commit to a league, so
              they stay visible even with nothing joined. */}
          <Text style={sectionLabel}>HOW SCORING WORKS</Text>
          <ScoringRules />
        </ScrollView>
        <View style={{ height: insets.bottom }} />
      </SafeAreaView>
    );
  }

  const shareInvite = () => {
    Share.share({ message: inviteMessage(league) }).catch(() => {});
  };

  const fail = (e: unknown) => Alert.alert("Something went wrong", (e as Error).message);

  // An active member stays in this season's rotation, so their opponents'
  // schedules don't change; anyone queued just goes.
  const leaveText =
    me?.status === "active"
      ? "You'll finish this season's matchups — your opponents still play you — and drop out when the next season starts. Your picks stay on your record."
      : "You'll be removed from the league now. Your picks stay on your record.";

  const confirmLeave = () => {
    Alert.alert(`Leave ${league.name}?`, leaveText, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => leaveLeague(league.id).then(() => router.replace("/leagues"), fail),
      },
    ]);
  };

  const confirmRemove = (member: LeagueStanding) => {
    Alert.alert(
      `Remove ${member.name}?`,
      member.status === "active"
        ? "They finish this season's matchups and leave when the next season starts."
        : "They're removed from the league now.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeMember(league.id, member.userId).then(state.reload, fail) },
      ]
    );
  };

  return (
    <SafeAreaView style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]} edges={["top", "left", "right"]}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        {header}

        <Animated.View entering={appear(0)}>
          <Text style={{ fontFamily: "BebasNeue", fontSize: 40, color: c.text, letterSpacing: 1 }}>{league.name}</Text>
          <Text style={{ color: c.textMuted, fontSize: 13, marginTop: -2 }}>
            {TIER_LABEL[league.tier].toLowerCase()} league · {state.status === "ready" ? state.standings?.season.toLowerCase() : ""}
          </Text>
        </Animated.View>

        {/* Invite code leads, because getting people in is the whole job of
            this screen for a new league. */}
        <Text style={sectionLabel}>INVITE</Text>
        <Animated.View entering={appear(1)} style={{ backgroundColor: c.inset, borderRadius: 12, padding: 16, marginTop: 4 }}>
          <Text style={{ color: c.textFaint, fontSize: 10.5, letterSpacing: 1.2 }}>INVITE CODE</Text>
          <Text selectable style={{ color: c.text, fontSize: 30, fontWeight: "800", letterSpacing: 6, marginTop: 6 }}>
            {league.inviteCode}
          </Text>
          <PressableScale
            onPress={shareInvite}
            style={{ marginTop: 14, backgroundColor: c.red, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 1 }}>SHARE INVITE</Text>
          </PressableScale>
        </Animated.View>

        <Text style={sectionLabel}>SCORING · {TIER_LABEL[league.tier].toUpperCase()}</Text>
        {league.tier !== "hardcore" && (
          <Text style={{ color: c.text2, fontSize: 13.5, lineHeight: 19, marginBottom: 10 }}>{TIER_BLURB[league.tier]}</Text>
        )}
        <ScoringRules />

        <Text style={sectionLabel}>MEMBERS · {league.members}</Text>
        {members.map((m, i) => (
          <Animated.View
            key={m.userId}
            entering={appear(i)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: i === members.length - 1 ? 0 : 1,
              borderBottomColor: c.border,
            }}
          >
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.inset, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: "800" }}>{getInitials(m.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: m.isMe ? c.red : c.text, fontSize: 14, fontWeight: "700" }}>{m.name}</Text>
              {MEMBER_NOTE[m.status] && <Text style={{ color: c.textFaint, fontSize: 11.5 }}>{MEMBER_NOTE[m.status]}</Text>}
            </View>
            {m.isOwner && <Text style={{ color: c.gold, fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>OWNER</Text>}
            {league.isOwner && !m.isMe && (m.status === "active" || m.status === "queued") && (
              <PressableScale onPress={() => confirmRemove(m)} hitSlop={10}>
                <Ionicons name="close-circle-outline" size={20} color={c.textFaint} />
              </PressableScale>
            )}
          </Animated.View>
        ))}

        <Text style={[sectionLabel, { color: c.red }]}>DANGER ZONE</Text>
        <PressableScale onPress={confirmLeave} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15 }}>
          <Ionicons name="exit-outline" size={20} color={c.red} />
          <Text style={{ flex: 1, color: c.red, fontSize: 15, fontWeight: "700" }}>Leave league</Text>
          <Ionicons name="chevron-forward" size={18} color={c.red} />
        </PressableScale>
        <Text style={{ color: c.textFaint, fontSize: 12, lineHeight: 18 }}>
          {leaveText}
          {league.isOwner ? " Ownership passes to the longest-standing member." : ""}
        </Text>
      </ScrollView>

      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
