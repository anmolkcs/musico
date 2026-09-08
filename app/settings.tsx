import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ScreenHeader from "@/components/ScreenHeader";
import { useTheme } from "@/components/Theme";
import { ACCENT_THEMES } from "@/lib/theme";
import { useLibraryStore } from "@/store/library";

export default function SettingsScreen() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const accentTheme = useLibraryStore((s) => s.accentTheme);
  const setAccentTheme = useLibraryStore((s) => s.setAccentTheme);
  const toggleTheme = useLibraryStore((s) => s.toggleTheme);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Settings" subtitle="Make Musico feel like yours" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.elevated }]}>
              <Ionicons name={mode === "dark" ? "moon" : "sunny"} size={20} color={colors.accent} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Display mode</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
                {mode === "dark" ? "Dark" : "Light"} mode
              </Text>
            </View>
            <Pressable
              onPress={() => toggleTheme(mode)}
              style={({ pressed }) => [styles.modeButton, { borderColor: colors.border }, pressed && { backgroundColor: colors.elevated }]}
            >
              <Text style={[styles.modeButtonText, { color: colors.accent }]}>Switch</Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>App theme</Text>
        <Text style={[styles.sectionDescription, { color: colors.muted }]}>
          Choose the accent color used across buttons, tabs, highlights, and playback controls.
        </Text>
        <View style={[styles.themeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {ACCENT_THEMES.map((theme) => {
            const selected = theme.key === accentTheme;
            return (
              <Pressable
                key={theme.key}
                onPress={() => setAccentTheme(theme.key)}
                style={({ pressed }) => [
                  styles.themeOption,
                  pressed && { backgroundColor: colors.elevated },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${theme.label} app theme`}
              >
                <View style={[styles.swatch, { backgroundColor: theme.color }, selected && styles.selectedSwatch]}>
                  {selected && <Ionicons name="checkmark" size={17} color="#fff" />}
                </View>
                <Text style={[styles.themeLabel, { color: colors.text }]}>{theme.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.preview, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.previewEyebrow, { color: colors.accent }]}>PREVIEW</Text>
            <Text style={[styles.previewTitle, { color: colors.text }]}>Your sound, your color</Text>
            <Text style={[styles.rowSubtitle, { color: colors.muted }]}>Accent theme preview</Text>
          </View>
          <View style={[styles.previewPlay, { backgroundColor: colors.accent }]}>
            <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 10,
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  rowSubtitle: {
    fontSize: 12,
  },
  modeButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  themeCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 8,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  themeOption: {
    width: "20%",
    alignItems: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 12,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedSwatch: {
    borderWidth: 3,
    borderColor: "#fff",
  },
  themeLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  preview: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  previewEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
    marginBottom: 4,
  },
  previewTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  previewPlay: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
