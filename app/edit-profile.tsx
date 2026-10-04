import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PressableScale from "../components/PressableScale";
import { DIVISIONS } from "../constants/divisions";
import { getInitials, useProfile } from "../context/ProfileContext";
import { cleanHandle, HandleBlockedError, handleProblem, HandleTakenError, HANDLE_MAX } from "../services/profile";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeSettingsStyles } from "../styles/settings";

type ClearableInputProps = TextInputProps & {
  value: string;
  onChangeText: (text: string) => void;
};

function ClearableInput({ value, onChangeText, multiline, style, ...rest }: ClearableInputProps) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  return (
    <View style={styles.inputWrap}>
      <TextInput
        style={[styles.input, multiline && styles.textArea, { paddingRight: 38 }, style]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor={c.textFaint}
        {...rest}
      />
      {value.length > 0 && (
        <PressableScale
          style={multiline ? styles.clearBtnMultiline : styles.clearBtn}
          onPress={() => onChangeText("")}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={18} color={c.textFaint} />
        </PressableScale>
      )}
    </View>
  );
}

/** Favorite division as a choice from the UFC's weight classes, men's and women's. */
function DivisionPicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  const [open, setOpen] = useState(false);
  const choose = (d: string) => {
    onChange(d);
    setOpen(false);
  };

  const option = (d: string, label = d) => (
    <PressableScale
      key={label}
      onPress={() => choose(d)}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13 }}
    >
      <Text style={{ color: d === value ? c.text : c.text2, fontSize: 16, fontWeight: d === value ? "800" : "500" }}>
        {label}
      </Text>
      {d === value && <Ionicons name="checkmark" size={18} color={c.red} />}
    </PressableScale>
  );

  return (
    <>
      <PressableScale
        onPress={() => setOpen(true)}
        style={[styles.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
        accessibilityRole="button"
        accessibilityLabel={`Favorite division: ${value || "none"}`}
      >
        <Text style={{ color: value ? c.text : c.textFaint, fontSize: 15 }}>{value || "Choose a division"}</Text>
        <Ionicons name="chevron-down" size={18} color={c.textFaint} />
      </PressableScale>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.modalOverlay, { justifyContent: "flex-end", padding: 0 }]} onPress={() => setOpen(false)}>
          <Pressable style={[styles.modalCard, { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: "80%", paddingBottom: 36 }]}>
            <Text style={[styles.modalTitle, { textAlign: "left" }]}>Favorite division</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>MEN&apos;S</Text>
              {DIVISIONS.men.map((d) => option(d))}
              <Text style={styles.fieldLabel}>WOMEN&apos;S</Text>
              {DIVISIONS.women.map((d) => option(d))}
              <View style={{ height: 8 }} />
              {option("", "No favorite")}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function EditProfile() {
  const router = useRouter();
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  const { profile, updateProfile, setUsername: saveUsername } = useProfile();
  const [saving, setSaving] = useState(false);

  const [username, setUsername] = useState(profile.username);
  const [favDivision, setFavDivision] = useState(profile.favDivision);
  const [bio, setBio] = useState(profile.bio);

  const save = async () => {
    if (saving) return;
    // The name lives on the server and has rules; the rest stays on this phone.
    if (username !== profile.username) {
      const problem = handleProblem(username);
      if (problem) {
        Alert.alert("Check your name", problem);
        return;
      }
      setSaving(true);
      try {
        await saveUsername(username);
      } catch (e) {
        if (e instanceof HandleTakenError) Alert.alert("That name is taken", "Try another one.");
        else if (e instanceof HandleBlockedError) Alert.alert("That name isn't allowed", "Pick another one.");
        else Alert.alert("Couldn't save your name", e instanceof Error ? e.message : "Please try again.");
        setSaving(false);
        return;
      }
    }
    updateProfile({ title: profile.title, favDivision, bio });
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <PressableScale style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={c.text2} />
          <Text style={styles.headerBack}>Cancel</Text>
        </PressableScale>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <PressableScale style={styles.headerBtnRight} onPress={save} hitSlop={10}>
          <Text style={styles.headerAction}>Save</Text>
        </PressableScale>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(username)}</Text>
          </View>
          <PressableScale onPress={() => Alert.alert("Change Photo", "Photo upload coming soon.")}>
            <Text style={styles.changePhoto}>Change Photo</Text>
          </PressableScale>
        </View>

        <Text style={styles.fieldLabel}>USERNAME</Text>
        <ClearableInput
          value={username}
          onChangeText={(t) => setUsername(cleanHandle(t))}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={HANDLE_MAX}
          placeholder="Username"
        />
        <Text style={styles.hint}>3–{HANDLE_MAX} letters, numbers or underscores. Must be unique.</Text>

        <Text style={styles.fieldLabel}>TITLE</Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value={profile.title}
          editable={false}
        />
        <Text style={styles.hint}>Titles are earned from your picks. Coming soon.</Text>

        <Text style={styles.fieldLabel}>FAVORITE DIVISION</Text>
        <DivisionPicker value={favDivision} onChange={setFavDivision} />

        <Text style={styles.fieldLabel}>BIO</Text>
        <ClearableInput
          value={bio}
          onChangeText={setBio}
          multiline
          placeholder="Tell the crew about yourself"
        />

        <Text style={styles.fieldLabel}>EMAIL</Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value=""
          placeholder="Set once you sign in"
          placeholderTextColor={c.textFaint}
          editable={false}
        />
        <Text style={styles.hint}>Your email is used for sign-in and can&apos;t be changed here.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
