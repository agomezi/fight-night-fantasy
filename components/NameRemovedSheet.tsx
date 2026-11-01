import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { holdModal, modalsFree, useModalsFree } from "../services/modalGate";
import { NAME_REMOVED_COPY as copy, renameErrorMessage } from "../services/nameReview";
import { cleanHandle, handleProblem, HANDLE_MAX } from "../services/profile";
import { makeSettingsStyles } from "../styles/settings";
import ClearableInput from "./ClearableInput";
import PressableScale from "./PressableScale";

/** A full screen over the whole app while your name is removed: pick a new
 * one to keep playing. It can't be dismissed. It waits for any open card, then holds the
 * gate so no other card opens on top of it. */
export default function NameRemovedSheet({
  removed,
  onSave,
}: {
  removed: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  const insets = useSafeAreaInsets();
  const free = useModalsFree();
  const [open, setOpen] = useState(false);
  const release = useRef<(() => void) | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read the gate now, not as of the last render, so another card that
    // took it in the meantime isn't opened over.
    if (removed && free && modalsFree() && !release.current) {
      release.current = holdModal();
      setName("");
      setError(null);
      setOpen(true);
    }
    if (!removed && release.current) {
      release.current();
      release.current = null;
      setOpen(false);
    }
  }, [removed, free]);
  useEffect(() => () => release.current?.(), []);

  const problem = name ? handleProblem(name) : null;
  const canSave = !!name && !problem && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(name);
    } catch (e) {
      setError(renameErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
        style={{ flex: 1, backgroundColor: c.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 56, paddingBottom: 24 }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: c.redTint,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Ionicons name="person-remove" size={26} color={c.red} />
          </View>
          <Text style={{ color: c.red, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>{copy.eyebrow}</Text>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 24, fontWeight: "800", marginTop: 4 }}>
            {copy.title}
          </Text>
          <Text style={{ color: c.textMuted, fontSize: 13.5, lineHeight: 19, marginTop: 6 }}>{copy.body}</Text>
          <Text style={{ color: c.red, fontSize: 13.5, lineHeight: 19, fontWeight: "700", marginTop: 8 }}>{copy.warning}</Text>

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
        </ScrollView>

        {/* Pinned to the bottom, above the keyboard while typing. */}
        <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 + insets.bottom }}>
          <PressableScale
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            style={{
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
