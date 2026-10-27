import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ActionSheet, { type SheetAction } from "../components/ActionSheet";
import ClearableInput from "../components/ClearableInput";
import PressableScale from "../components/PressableScale";
import { DIVISIONS } from "../constants/divisions";
import { useAuth } from "../context/AuthContext";
import { getInitials, useProfile } from "../context/ProfileContext";
import { loadBadges, type AwardId } from "../services/awards";
import { loadNameReview } from "../services/nameReview";
import { cleanHandle, HandleBlockedError, handleProblem, HandleTakenError, HandleTooSoonError, HANDLE_MAX } from "../services/profile";
import { titleName, titleOptions, type TitleOption } from "../services/titles";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeSettingsStyles } from "../styles/settings";

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
  const { profile, updateProfile, setTitle, setUsername: saveUsername, renameUnderReview, refreshName, nameChangeableAt } =
    useProfile();
  const { session } = useAuth();
  // While reports hide your name, the first rename skips the weekly limit.
  const [underReview, setUnderReview] = useState(false);
  const nameLocked = !!nameChangeableAt && !underReview;
  const nextChangeLabel = nameChangeableAt
    ? nameChangeableAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : null;
  const [saving, setSaving] = useState(false);

  const [username, setUsername] = useState(profile.username);
  // A moderator may have changed the name since it was loaded: read it again,
  // and follow it until the player starts typing.
  const typed = useRef(false);
  useEffect(() => {
    refreshName();
    let current = true;
    loadNameReview()
      .then((r) => {
        if (current) setUnderReview(r.hidden && !r.renamed);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [refreshName]);
  useEffect(() => {
    if (!typed.current) setUsername(profile.username);
  }, [profile.username]);
  const [favDivision, setFavDivision] = useState(profile.favDivision);

  // Titles are the awards you've won; null until they've loaded.
  const [titles, setTitles] = useState<TitleOption[] | null>(null);
  // Undefined until a title is picked, so a title still loading isn't cleared.
  const [picked, setTitleChoice] = useState<AwardId | null | undefined>(undefined);
  const title = picked === undefined ? profile.title : picked;
  const [choosingTitle, setChoosingTitle] = useState(false);
  const myId = session?.user.id;
  useEffect(() => {
    if (!myId) return;
    let current = true;
    loadBadges(myId)
      .then((b) => current && setTitles(titleOptions(b)))
      .catch(() => current && setTitles([]));
    return () => {
      current = false;
    };
  }, [myId]);
  const titleActions: SheetAction[] = [
    ...(titles ?? []).map((t) => ({
      label: t.title,
      icon: t.icon,
      note: t.award === title ? "Wearing" : t.where,
      onPress: () => setTitleChoice(t.award),
    })),
    { label: "No title", icon: "remove-circle-outline", note: title == null ? "Wearing" : undefined, onPress: () => setTitleChoice(null) },
  ];

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
        await (underReview ? renameUnderReview(username) : saveUsername(username));
      } catch (e) {
        if (e instanceof HandleTakenError) Alert.alert("That name is taken", "Try another one.");
        else if (e instanceof HandleBlockedError) Alert.alert("That name isn't allowed", "Pick another one.");
        else if (e instanceof HandleTooSoonError)
          Alert.alert(
            "Name changed recently",
            e.nextChange
              ? `You can change it again on ${e.nextChange.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
              : "You can change your name once a week."
          );
        else Alert.alert("Couldn't save your name", e instanceof Error ? e.message : "Please try again.");
        setSaving(false);
        return;
      }
    }
    if (picked !== undefined && picked !== profile.title) {
      setSaving(true);
      try {
        await setTitle(picked);
      } catch (e) {
        Alert.alert("Couldn't save your title", e instanceof Error ? e.message : "Please try again.");
        setSaving(false);
        return;
      }
    }
    updateProfile({ favDivision, bio: profile.bio });
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
        {nameLocked ? (
          <TextInput style={[styles.input, styles.inputDisabled]} value={profile.username} editable={false} />
        ) : (
          <ClearableInput
            value={username}
            onChangeText={(t) => {
              typed.current = true;
              setUsername(cleanHandle(t));
            }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={HANDLE_MAX}
            placeholder="Username"
          />
        )}
        <Text style={styles.hint}>
          {nameLocked
            ? `You can change your name again on ${nextChangeLabel}.`
            : `3–${HANDLE_MAX} letters, numbers or underscores. Must be unique. You can change it once a week.`}
        </Text>

        <Text style={styles.fieldLabel}>TITLE</Text>
        {titles?.length ? (
          <PressableScale
            onPress={() => setChoosingTitle(true)}
            style={[styles.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
            accessibilityRole="button"
            accessibilityLabel={`Title: ${titleName(title) ?? "none"}`}
          >
            <Text style={{ color: title ? c.text : c.textFaint, fontSize: 15 }}>{titleName(title) ?? "No title"}</Text>
            <Ionicons name="chevron-down" size={18} color={c.textFaint} />
          </PressableScale>
        ) : (
          <TextInput style={[styles.input, styles.inputDisabled]} value="" editable={false} />
        )}
        <Text style={styles.hint}>
          {titles?.length
            ? "Wear an award you've won. It shows next to your pro record, and to anyone who opens your card."
            : titles
              ? "Titles are earned at award drops. Join a league and make your picks to earn your first one."
              : " "}
        </Text>

        <Text style={styles.fieldLabel}>FAVORITE DIVISION</Text>
        <DivisionPicker value={favDivision} onChange={setFavDivision} />

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
      <ActionSheet visible={choosingTitle} title="YOUR TITLE" actions={titleActions} onClose={() => setChoosingTitle(false)} />
    </SafeAreaView>
  );
}
