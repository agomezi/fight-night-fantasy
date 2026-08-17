import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PressableScale from "../components/PressableScale";
import { getInitials, useProfile } from "../context/ProfileContext";
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

export default function EditProfile() {
  const router = useRouter();
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  const { profile, updateProfile } = useProfile();

  const [username, setUsername] = useState(profile.username);
  const [specialist, setSpecialist] = useState(profile.title);
  const [favDivision, setFavDivision] = useState(profile.favDivision);
  const [bio, setBio] = useState(profile.bio);

  const save = () => {
    updateProfile({ username, title: specialist, favDivision, bio });
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
          onChangeText={setUsername}
          autoCapitalize="sentences"
          placeholder="Username"
        />

        <Text style={styles.fieldLabel}>TITLE</Text>
        <ClearableInput
          value={specialist}
          onChangeText={setSpecialist}
          placeholder="e.g. Tactical Specialist"
        />

        <Text style={styles.fieldLabel}>FAVORITE DIVISION</Text>
        <ClearableInput
          value={favDivision}
          onChangeText={setFavDivision}
          placeholder="e.g. Lightweight"
        />

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
