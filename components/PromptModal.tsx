import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SERIF, SANS } from "../lib/theme";
import { useTheme } from "./Theme";

type Props = {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export default function PromptModal({
  visible,
  title,
  initialValue = "",
  placeholder,
  confirmLabel = "Save",
  onConfirm,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const [value, setValue] = useState(initialValue);

  // reset whenever reopened
  React.useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.card, { backgroundColor: colors.elevated, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.card },
            ]}
            onSubmitEditing={() => value.trim() && onConfirm(value.trim())}
          />
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.ghostButton,
                { borderColor: colors.borderStrong },
                pressed && { backgroundColor: colors.card },
              ]}
              onPress={onCancel}
            >
              <Text style={{ color: colors.text, fontFamily: SANS.semiBold }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: colors.accent, opacity: value.trim() ? 1 : 0.5 }]}
              disabled={!value.trim()}
              onPress={() => onConfirm(value.trim())}
            >
              <Text style={{ color: colors.onAccent, fontFamily: SANS.semiBold }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10,9,8,0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    width: "100%",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 14,
  },
  title: {
    fontFamily: SERIF.medium,
    fontSize: 19,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 44,
    fontFamily: SANS.regular,
    fontSize: 15,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  button: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
