import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SERIF } from "../lib/theme";
import { useTheme } from "./Theme";

export default function ScreenHeader({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 10 }]}>
      <Pressable
        hitSlop={10}
        onPress={onBack ?? (() => router.back())}
        style={({ pressed }) => [
          styles.back,
          { borderColor: colors.border },
          pressed && { backgroundColor: colors.elevated },
        ]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.faint }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  back: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: SERIF.medium,
    fontSize: 23,
    lineHeight: 29,
  },
  subtitle: {
    fontFamily: SERIF.regular,
    fontSize: 13,
    lineHeight: 17,
  },
});
