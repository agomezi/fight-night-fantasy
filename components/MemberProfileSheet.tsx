import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getInitials } from "../context/ProfileContext";
import { useTheme } from "../context/ThemeContext";
import { divisionLabel } from "../services/events";
import {
  loadMemberProfile,
  REPORT_REASONS,
  reportMember,
  type MemberProfile,
  type ReportReason,
} from "../services/leagues";
import PressableScale from "./PressableScale";
import { StatBox, StatBoxRow } from "./StatBox";

type Step = "profile" | "report" | "sent" | "already";

/**
 * A league mate's profile: name, accuracy this season and favorite division.
 * Reporting sits behind the menu in the corner so it stays out of the way.
 * Open it by passing a member's id; null closes it.
 */
export default function MemberProfileSheet({
  leagueId,
  userId,
  onClose,
}: {
  leagueId: string;
  userId: string | null;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<MemberProfile | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [step, setStep] = useState<Step>("profile");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    setProfile(undefined);
    setFailed(false);
    setMenuOpen(false);
    setStep("profile");
    setReason(null);
    setNote("");
    setError(null);
    loadMemberProfile(leagueId, userId)
      .then((p) => current && setProfile(p))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [leagueId, userId]);

  const send = async () => {
    if (!userId || !reason || sending) return;
    setSending(true);
    setError(null);
    try {
      const added = await reportMember(leagueId, userId, reason, note);
      setStep(added ? "sent" : "already");
      setProfile((p) => (p ? { ...p, reported: true } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const title = { color: c.text, fontSize: 20, fontWeight: "800" as const };
  const muted = { color: c.textMuted, fontSize: 13.5, lineHeight: 19 };

  const body = () => {
    if (failed || profile === null) {
      return <Text style={[muted, { textAlign: "center", paddingVertical: 24 }]}>Couldn&apos;t load this profile.</Text>;
    }
    if (!profile) return <ActivityIndicator color={c.red} style={{ paddingVertical: 32 }} />;

    if (step === "sent" || step === "already") {
      return (
        <View style={{ alignItems: "center", paddingVertical: 16, gap: 10 }}>
          <Ionicons name={step === "sent" ? "checkmark-circle" : "information-circle"} size={40} color={step === "sent" ? c.green : c.textMuted} />
          <Text style={title}>{step === "sent" ? "Report sent" : "Already reported"}</Text>
          <Text style={[muted, { textAlign: "center" }]}>
            {step === "sent"
              ? `Thanks. We'll review ${profile.name}'s name.`
              : `You've already reported ${profile.name}'s name. We'll review it.`}
          </Text>
          <PressableScale onPress={onClose} style={{ paddingVertical: 12 }}>
            <Text style={{ color: c.text2, fontSize: 15, fontWeight: "700" }}>Done</Text>
          </PressableScale>
        </View>
      );
    }

    if (step === "report") {
      return (
        <View>
          <Text style={title}>Report {profile.name}</Text>
          <Text style={[muted, { marginTop: 4, marginBottom: 14 }]}>What&apos;s wrong with this name?</Text>
          {REPORT_REASONS.map((r) => {
            const on = reason === r.value;
            return (
              <PressableScale
                key={r.value}
                onPress={() => setReason(r.value)}
                scaleTo={0.98}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 13,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                }}
              >
                <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? c.red : c.textFaint} />
                <Text style={{ color: c.text, fontSize: 15, fontWeight: on ? "700" : "500" }}>{r.label}</Text>
              </PressableScale>
            );
          })}
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note (optional)"
            placeholderTextColor={c.textFaint}
            maxLength={500}
            multiline
            style={{
              marginTop: 14,
              minHeight: 72,
              textAlignVertical: "top",
              backgroundColor: c.inset,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: c.text,
              fontSize: 14.5,
            }}
          />
          {error && <Text style={{ color: c.red, fontSize: 13, marginTop: 10 }}>{error}</Text>}
          <PressableScale
            onPress={send}
            disabled={!reason || sending}
            style={{
              marginTop: 16,
              backgroundColor: c.red,
              opacity: reason ? 1 : 0.45,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 1 }}>SEND REPORT</Text>
            )}
          </PressableScale>
          <PressableScale onPress={() => setStep("profile")} disabled={sending} style={{ paddingVertical: 13, alignItems: "center" }}>
            <Text style={{ color: c.text2, fontSize: 15, fontWeight: "700" }}>Cancel</Text>
          </PressableScale>
        </View>
      );
    }

    return (
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: profile.isMe ? c.red : c.inset,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: profile.isMe ? "#FFFFFF" : c.textMuted, fontSize: 17, fontWeight: "800" }}>
              {getInitials(profile.name)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={title} numberOfLines={1}>{profile.name}</Text>
            {profile.isMe && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>That&apos;s you</Text>}
          </View>
          {profile.canReport && (
            <PressableScale onPress={() => setMenuOpen((o) => !o)} hitSlop={12} accessibilityLabel="More options">
              <Ionicons name="ellipsis-horizontal" size={22} color={c.textMuted} />
            </PressableScale>
          )}
        </View>

        {menuOpen && (
          <View
            style={{
              position: "absolute",
              top: 34,
              right: 0,
              zIndex: 2,
              backgroundColor: c.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: c.border,
              paddingVertical: 4,
              minWidth: 170,
            }}
          >
            <PressableScale
              onPress={() => {
                setMenuOpen(false);
                if (!profile.reported) setStep("report");
              }}
              disabled={profile.reported}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}
            >
              <Ionicons name="flag-outline" size={17} color={profile.reported ? c.textFaint : c.red} />
              <Text style={{ color: profile.reported ? c.textFaint : c.text, fontSize: 14.5, fontWeight: "600" }}>
                {profile.reported ? "Reported" : "Report"}
              </Text>
            </PressableScale>
          </View>
        )}

        <View style={{ marginTop: 20 }}>
          <StatBoxRow>
            <StatBox value={profile.accuracy == null ? "—" : `${profile.accuracy}%`} label="ACCURACY" accent />
            <StatBox value={profile.favoriteDivision ? divisionLabel(profile.favoriteDivision) : "—"} label="FAVORITE DIVISION" />
          </StatBoxRow>
        </View>
        {profile.accuracy == null && profile.favoriteDivision == null && (
          <Text style={[muted, { marginTop: 12, fontSize: 12.5 }]}>No scored picks yet. Stats fill in after a few cards.</Text>
        )}
      </View>
    );
  };

  return (
    <Modal visible={!!userId} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={sending ? undefined : onClose} />
        <View
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: c.border,
            paddingHorizontal: 22,
            paddingTop: 10,
            paddingBottom: insets.bottom + 18,
          }}
        >
          <View style={{ alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 18 }} />
          {body()}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
