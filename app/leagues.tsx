import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
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
      message: `Join "${LEAGUE.name}" on Fight Night and take your shot at the #1 spot 🥊`,
    }).catch(() => {});
  };

  const total = RIVALRY.you.proj + RIVALRY.rival.proj;
  const yourShare = (RIVALRY.you.proj / total) * 100;

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
          <Pressable style={styles.actionButton} onPress={inviteFriends}>
            <Ionicons name="person-add-outline" size={15} color={c.text} />
            <Text style={styles.actionButtonText}>INVITE</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => router.push("/settings")}>
            <Ionicons name="settings-outline" size={15} color={c.text} />
            <Text style={styles.actionButtonText}>SETTINGS</Text>
          </Pressable>
        </View>

        {/* Standings preview */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Standings</Text>
            <Text style={styles.cardMeta}>WEEK {LEAGUE.week}</Text>
          </View>

          <View style={styles.columnHeader}>
            <Text style={[styles.columnLabel, { width: 42, textAlign: "center" }]}>RNK</Text>
            <Text style={[styles.columnLabel, { flex: 1, marginLeft: 12 }]}>FIGHTER</Text>
            <Text style={styles.columnLabel}>FPTS</Text>
          </View>

          {SEASON_STANDINGS.slice(0, 4).map((s) => (
            <StandingRow key={s.id} standing={s} />
          ))}

          <Pressable style={styles.ghostButton} onPress={() => router.push("/league-standings")}>
            <Text style={styles.ghostButtonText}>VIEW FULL STANDINGS</Text>
          </Pressable>
        </View>

        {/* Active rivalry */}
        <View style={[styles.card, styles.rivalryCard]}>
          <View style={commonStyles.row}>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
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

          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>VIEW MATCHUP</Text>
          </Pressable>
        </View>

        {/* Rising stars */}
        <View style={styles.card}>
          <View style={styles.liveRow}>
            <Ionicons name="trending-up" size={16} color={c.green} />
            <Text style={styles.cardTitle}>Rising Stars</Text>
          </View>
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
            <Pressable onPress={sendMessage} hitSlop={10}>
              <Ionicons name="send" size={18} color={draft.trim() ? c.red : c.textFaint} />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom }}>
        <BottomNav active="leagues" />
      </View>
    </SafeAreaView>
  );
}
