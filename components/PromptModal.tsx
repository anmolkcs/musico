import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.card, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.elevated },
            ]}
            onSubmitEditing={() => value.trim() && onConfirm(value.trim())}
          />
          <View style={styles.actions}>
            <Pressable style={[styles.button, { backgroundColor: colors.elevated }]} onPress={onCancel}>
              <Text style={{ color: colors.text }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: colors.accent, opacity: value.trim() ? 1 : 0.5 }]}
              disabled={!value.trim()}
              onPress={() => onConfirm(value.trim())}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>{confirmLabel}</Text>
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
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    padding: 18,
    gap: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
