import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeSettingsStyles } from "../styles/settings";

export default function EditProfile() {
  const router = useRouter();
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);

  const [username, setUsername] = useState("ELITE_STRIKER");
  const [specialist, setSpecialist] = useState("Tactical Specialist");
  const [favDivision, setFavDivision] = useState("Heavyweight");
  const [bio, setBio] = useState("Never missed a main event. Locked in since UFC 280.");

  const save = () => {
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={c.text2} />
          <Text style={styles.headerBack}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Pressable style={styles.headerBtnRight} onPress={save} hitSlop={10}>
          <Text style={styles.headerAction}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>ES</Text>
          </View>
          <Pressable onPress={() => Alert.alert("Change Photo", "Photo upload coming soon.")}>
            <Text style={styles.changePhoto}>Change Photo</Text>
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>USERNAME</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="sentences"
          placeholder="Username"
          placeholderTextColor={c.textFaint}
        />

        <Text style={styles.fieldLabel}>TITLE</Text>
        <TextInput
          style={styles.input}
          value={specialist}
          onChangeText={setSpecialist}
          placeholder="e.g. Tactical Specialist"
          placeholderTextColor={c.textFaint}
        />

        <Text style={styles.fieldLabel}>FAVORITE DIVISION</Text>
        <TextInput
          style={styles.input}
          value={favDivision}
          onChangeText={setFavDivision}
          placeholder="e.g. Lightweight"
          placeholderTextColor={c.textFaint}
        />

        <Text style={styles.fieldLabel}>BIO</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bio}
          onChangeText={setBio}
          multiline
          placeholder="Tell the crew about yourself"
          placeholderTextColor={c.textFaint}
        />

        <Text style={styles.fieldLabel}>EMAIL</Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value="alex.gomezd02@gmail.com"
          editable={false}
        />
        <Text style={styles.hint}>Your email is used for sign-in and can&apos;t be changed here.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
