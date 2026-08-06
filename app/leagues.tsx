import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Share, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import LiveDot from "../components/LiveDot";
import PressableScale from "../components/PressableScale";
import { appear } from "../constants/motion";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import EmptyState from "../components/EmptyState";
import { NotificationBell, ProfileBadge } from "../components/HeaderIcons";
import StandingRow from "../components/StandingRow";
import {
    CHATTER,
    LEAGUE,
    RISING_STARS,
    RIVALRY,
    SEASON_STANDINGS,
} from "../constants/league";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeCommonStyles } from "../styles/common";
import { makeLeaguesStyles } from "../styles/leagues";

export default function Leagues() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const styles = useThemedStyles(makeLeaguesStyles);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(CHATTER);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), author: "You", time: "just now", text },
    ]);
    setDraft("");
  };

  const inviteFriends = () => {
    Share.share({
      message: LEAGUE
        ? `Join "${LEAGUE.name}" on Fight Night and take your shot at the #1 spot 🥊`
        : "Join me on Fight Night and take your shot at the #1 spot 🥊",
    }).catch(() => {});
  };

  const yourShare = RIVALRY
    ? (RIVALRY.you.proj / (RIVALRY.you.proj + RIVALRY.rival.proj)) * 100
    : 50;

  // No league joined yet — the whole screen becomes an onboarding prompt.
  if (!LEAGUE) {
    return (
      <SafeAreaView
        style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]}
        edges={["top", "left", "right"]}
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        >
          <View style={commonStyles.row}>
            <ProfileBadge />
            <Text style={commonStyles.headerLogo}>Fight Night</Text>
            <NotificationBell />
          </View>
          <View style={commonStyles.divider} />

          <Animated.Text entering={appear(0)} style={styles.eyebrow}>
            LEAGUES
          </Animated.Text>
          <Animated.Text entering={appear(1)} style={styles.leagueName}>
            No League Yet
          </Animated.Text>
          <Animated.View entering={appear(2)} style={styles.memberRow}>
            <Ionicons name="people-outline" size={15} color={c.textMuted} />
            <Text style={styles.memberText}>You are not in a league</Text>
          </Animated.View>

          <Animated.View entering={appear(3)} style={styles.card}>
            <EmptyState
              icon="trophy-outline"
              title="Start competing"
              message="Create a league and invite friends, or join one with an invite code. Standings, rivalries and chatter unlock once you are in."
            />
            <PressableScale style={styles.primaryButton} onPress={inviteFriends}>
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>CREATE A LEAGUE</Text>
            </PressableScale>
            <PressableScale style={styles.ghostButton} onPress={inviteFriends}>
              <Text style={styles.ghostButtonText}>JOIN WITH A CODE</Text>
            </PressableScale>
          </Animated.View>

          <Animated.View entering={appear(4)} style={styles.card}>
            <Text style={styles.cardTitle}>What you unlock</Text>
            {[
              { icon: "podium-outline" as const, text: "Live season and event standings" },
              { icon: "flash-outline" as const, text: "Weekly head-to-head rivalries" },
              { icon: "chatbubbles-outline" as const, text: "League chatter with your friends" },
            ].map((row, i) => (
              <Animated.View key={row.text} entering={appear(5 + i)} style={styles.riserRow}>
                <View style={styles.avatar}>
                  <Ionicons name={row.icon} size={18} color={c.textFaint} />
                </View>
                <View style={styles.playerCell}>
                  <Text style={styles.playerName}>{row.text}</Text>
                </View>
              </Animated.View>
            ))}
          </Animated.View>
        </ScrollView>

        <View style={{ paddingBottom: insets.bottom }}>
          <BottomNav active="leagues" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={commonStyles.row}>
          <ProfileBadge />
          <Text style={commonStyles.headerLogo}>Fight Night</Text>
          <NotificationBell hasNotifications />
        </View>
        <View style={commonStyles.divider} />

        {/* League hero */}
        <Text style={styles.eyebrow}>{LEAGUE.kind}</Text>
        <Text style={styles.leagueName}>{LEAGUE.name}</Text>
        <View style={styles.memberRow}>
          <Ionicons name="people" size={15} color={c.textMuted} />
          <Text style={styles.memberText}>{LEAGUE.members} Members</Text>
        </View>

        <View style={styles.actionRow}>
          <PressableScale style={styles.actionButton} onPress={inviteFriends}>
            <Ionicons name="person-add-outline" size={15} color={c.text} />
            <Text style={styles.actionButtonText}>INVITE</Text>
          </PressableScale>
          <PressableScale style={styles.actionButton} onPress={() => router.push("/settings")}>
            <Ionicons name="settings-outline" size={15} color={c.text} />
            <Text style={styles.actionButtonText}>SETTINGS</Text>
          </PressableScale>
        </View>

        {/* Standings preview */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Standings</Text>
            <Text style={styles.cardMeta}>WEEK {LEAGUE.week}</Text>
          </View>

          {SEASON_STANDINGS.length === 0 ? (
            <EmptyState
              compact
              icon="podium-outline"
              title="No standings yet"
              message="Standings appear after the league's first scored event."
            />
          ) : (
            <>
              <View style={styles.columnHeader}>
                <Text style={[styles.columnLabel, { width: 42, textAlign: "center" }]}>RNK</Text>
                <Text style={[styles.columnLabel, { flex: 1, marginLeft: 12 }]}>FIGHTER</Text>
                <Text style={styles.columnLabel}>FPTS</Text>
              </View>

              {SEASON_STANDINGS.slice(0, 4).map((s, i) => (
                <StandingRow key={s.id} standing={s} index={i} />
              ))}
            </>
          )}

          <PressableScale style={styles.ghostButton} onPress={() => router.push("/league-standings")}>
            <Text style={styles.ghostButtonText}>VIEW FULL STANDINGS</Text>
          </PressableScale>
        </View>

        {/* Active rivalry */}
        {RIVALRY ? (
        <View style={[styles.card, styles.rivalryCard]}>
          <View style={commonStyles.row}>
            <View style={styles.liveRow}>
              <LiveDot />
              <Text style={styles.liveText}>ACTIVE RIVALRY</Text>
            </View>
            <Ionicons name="flash" size={20} color={c.red} />
          </View>

          <Text style={styles.rivalryTitle}>
            {RIVALRY.you.name} <Text style={styles.rivalryTitleAccent}>vs.</Text> {RIVALRY.rival.name}
          </Text>
          <Text style={styles.rivalrySub}>
            Only {RIVALRY.gap}pts apart. The battle for the #1 spot is heating up this week.
          </Text>

          <View style={styles.projRow}>
            <View>
              <Text style={styles.projLabel}>Your Proj</Text>
              <Text style={styles.projValue}>{RIVALRY.you.proj.toFixed(1)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.projLabel}>{RIVALRY.rival.name}&apos;s Proj</Text>
              <Text style={styles.projValue}>{RIVALRY.rival.proj.toFixed(1)}</Text>
            </View>
          </View>
          <View style={styles.projTrack}>
            <View style={[styles.projFill, { width: `${yourShare}%` }]} />
          </View>

          <PressableScale style={styles.primaryButton} onPress={() => router.push("/matchup")}>
            <Text style={styles.primaryButtonText}>VIEW MATCHUP</Text>
          </PressableScale>
        </View>
        ) : (
          <View style={styles.card}>
            <EmptyState
              compact
              icon="flash-outline"
              title="No rivalry yet"
              message="Your first head-to-head matchup is set once the next event opens."
            />
          </View>
        )}

        {/* Rising stars */}
        <View style={styles.card}>
          <View style={styles.liveRow}>
            <Ionicons name="trending-up" size={16} color={c.green} />
            <Text style={styles.cardTitle}>Rising Stars</Text>
          </View>
          {RISING_STARS.length === 0 && (
            <EmptyState
              compact
              icon="trending-up-outline"
              title="Nobody is moving yet"
              message="Risers show up once the league has some scored events."
            />
          )}
          {RISING_STARS.map((r) => (
            <View key={r.id} style={styles.riserRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={18} color={c.textFaint} />
              </View>
              <View style={styles.playerCell}>
                <Text style={styles.playerName}>{r.name}</Text>
                <Text style={styles.playerTeam}>{r.sub}</Text>
              </View>
              <Text style={styles.riserDelta}>{r.delta}</Text>
            </View>
          ))}
        </View>

        {/* League chatter */}
        <View style={styles.card}>
          <View style={styles.liveRow}>
            <Ionicons name="chatbubbles-outline" size={16} color={c.text2} />
            <Text style={styles.cardTitle}>League Chatter</Text>
          </View>

          {messages.length === 0 && (
            <EmptyState
              compact
              icon="chatbubble-ellipses-outline"
              title="No messages yet"
              message="Say something to get the league talking."
            />
          )}

          {messages.map((m) => (
            <View key={m.id} style={styles.chatRow}>
              <View style={[styles.avatar, { width: 32, height: 32, borderRadius: 16 }]}>
                <Ionicons name="person" size={15} color={c.textFaint} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                  <Text style={styles.chatAuthor}>{m.author}</Text>
                  <Text style={styles.chatTime}>{m.time}</Text>
                </View>
                <View style={styles.chatBubble}>
                  <Text style={styles.chatText}>{m.text}</Text>
                </View>
              </View>
            </View>
          ))}

          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
              placeholder="Say something..."
              placeholderTextColor={c.textFaint}
            />
            <PressableScale onPress={sendMessage} hitSlop={10}>
              <Ionicons name="send" size={18} color={draft.trim() ? c.red : c.textFaint} />
            </PressableScale>
          </View>
        </View>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom }}>
        <BottomNav active="leagues" />
      </View>
    </SafeAreaView>
  );
}
