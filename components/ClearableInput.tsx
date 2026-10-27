import { Ionicons } from "@expo/vector-icons";
import { TextInput, TextInputProps, View } from "react-native";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeSettingsStyles } from "../styles/settings";
import PressableScale from "./PressableScale";

type ClearableInputProps = TextInputProps & {
  value: string;
  onChangeText: (text: string) => void;
};

/** A settings text field with a button that clears it. */
export default function ClearableInput({ value, onChangeText, multiline, style, ...rest }: ClearableInputProps) {
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
