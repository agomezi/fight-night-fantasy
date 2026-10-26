import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { nameReviewCopy, renameErrorMessage } from "../services/nameReview";
import { cleanHandle, handleProblem, HANDLE_MAX } from "../services/profile";
import { makeSettingsStyles } from "../styles/settings";
import ClearableInput from "./ClearableInput";
import PressableScale from "./PressableScale";

/** Offered on Home while reports hide your name: pick a new one now, or keep
 * yours and wait for a moderator. */
export default function NameReviewSheet({
  visible,
  alias,
  currentName,
  onRename,
  onSkip,
}: {
  visible: boolean;
  alias: number | null;
  currentName: string;
  onRename: (name: string) => Promise<void>;
  onSkip: () => void;
}) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  const insets = useSafeAreaInsets();
  const copy = nameReviewCopy(alias);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName("");
      setError(null);
    }
  }, [visible]);

  const problem = name ? handleProblem(name) : null;
  const unchanged = name.toLowerCase() === currentName.toLowerCase();
  const canSave = !!name && !problem && !unchanged && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(name);
    } catch (e) {
      setError(renameErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={busy ? () => {} : onSkip}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.overlay }}
          onPress={busy ? undefined : onSkip}
          accessibilityLabel={copy.skip}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: c.borderStrong,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 20 + insets.bottom,
          }}
        >
          <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: 18 }} />
          <Text style={{ color: c.red, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>{copy.eyebrow}</Text>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 24, fontWeight: "800", marginTop: 4 }}>
            {copy.title}
          </Text>
          <Text style={{ color: c.textMuted, fontSize: 13.5, lineHeight: 19, marginTop: 6 }}>{copy.body}</Text>

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>NEW USERNAME</Text>
          <ClearableInput
            value={name}
            onChangeText={(t) => {
              setName(cleanHandle(t));
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={HANDLE_MAX}
            placeholder="New username"
            editable={!busy}
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <Text style={styles.hint}>
            {problem ?? `3–${HANDLE_MAX} letters, numbers or underscores. Must be unique.`}
          </Text>

          {error ? (
            <Text style={{ color: c.red, fontSize: 13.5, fontWeight: "700", marginTop: 12, textAlign: "center" }}>{error}</Text>
          ) : null}

          <PressableScale
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            style={{
              marginTop: 20,
              height: 54,
              borderRadius: 14,
              backgroundColor: c.red,
              opacity: canSave || busy ? 1 : 0.5,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800", letterSpacing: 1.4 }}>{copy.action}</Text>
            )}
          </PressableScale>
          <PressableScale onPress={onSkip} disabled={busy} accessibilityRole="button" style={{ marginTop: 14, alignItems: "center", padding: 6 }}>
            <Text style={{ color: c.textMuted, fontSize: 14, fontWeight: "700" }}>{copy.skip}</Text>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
