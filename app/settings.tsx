import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ScreenHeader from "@/components/ScreenHeader";
import { useTheme } from "@/components/Theme";
import { ACCENT_THEMES, SERIF, SANS } from "@/lib/theme";
import { useLibraryStore } from "@/store/library";

const BACKEND_KEY = "musico.backend";

function WebBackendCard({ colors }: { colors: ReturnType<typeof useTheme>["colors"] }) {
  const [backend, setBackend] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      setBackend(window.localStorage.getItem(BACKEND_KEY) ?? "");
    } catch {}
  }, []);

  const save = () => {
    try {
      const trimmed = backend.trim();
      if (trimmed) window.localStorage.setItem(BACKEND_KEY, trimmed);
      else window.localStorage.removeItem(BACKEND_KEY);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {}
  };

  return (
    <>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Web backend</Text>
      <Text style={[styles.sectionDescription, { color: colors.muted }]}>
        Musico on web uses public Piped/Invidious instances for search and playback. Public instances
        can be unreliable — pin your own Piped API URL here for consistent results. Leave empty for
        automatic.
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
          styles.backendRow,
        ]}
      >
        <TextInput
          value={backend}
          onChangeText={setBackend}
          placeholder="https://pipedapi.example.org"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.backendInput, { color: colors.text, borderColor: colors.border }]}
          onSubmitEditing={save}
        />
        <Pressable
          onPress={save}
          style={({ pressed }) => [
            styles.backendSave,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.backendSaveText}>{saved ? "Saved" : "Save"}</Text>
        </Pressable>
      </View>
    </>
  );
}

export default function SettingsScreen() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const accentTheme = useLibraryStore((s) => s.accentTheme);
  const profileName = useLibraryStore((s) => s.profileName);
  const setProfileName = useLibraryStore((s) => s.setProfileName);
  const setAccentTheme = useLibraryStore((s) => s.setAccentTheme);
  const toggleTheme = useLibraryStore((s) => s.toggleTheme);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Settings" subtitle="Make Musico feel like yours" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile</Text>
        <Text style={[styles.sectionDescription, { color: colors.muted }]}>Choose the name shown on your home screen.</Text>
        <TextInput
          value={profileName}
          onChangeText={(value) => setProfileName(value).catch(() => {})}
          placeholder="Your name"
          placeholderTextColor={colors.muted}
          style={[styles.profileInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
          maxLength={40}
          returnKeyType="done"
        />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
              style={({ pressed }) => [
              styles.modeButton,
              { borderColor: colors.borderStrong },
              pressed && { backgroundColor: colors.card },
            ]}
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
                  {selected && <Ionicons name="checkmark" size={17} color={colors.onAccent} />}
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
            <Ionicons name="play" size={18} color={colors.onAccent} style={{ marginLeft: 2 }} />
          </View>
        </View>

        {Platform.OS === "web" && <WebBackendCard colors={colors} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
  },
  profileInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontFamily: SANS.regular,
    fontSize: 14,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: SERIF.medium,
    fontSize: 20,
    lineHeight: 26,
    marginTop: 14,
    marginBottom: 10,
  },
  sectionDescription: {
    fontFamily: SANS.regular,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
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
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(247,244,238,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: SANS.semiBold,
    fontSize: 15,
  },
  rowSubtitle: {
    fontFamily: SANS.regular,
    fontSize: 12,
  },
  modeButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 14,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonText: {
    fontFamily: SANS.semiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  themeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 8,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  themeOption: {
    width: "20%",
    alignItems: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 8,
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
    borderColor: "#F7F4EE",
  },
  themeLabel: {
    fontFamily: SANS.regular,
    fontSize: 11,
  },
  preview: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 16,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  previewEyebrow: {
    fontFamily: SANS.semiBold,
    fontSize: 9,
    letterSpacing: 1.3,
    marginBottom: 5,
  },
  previewTitle: {
    fontFamily: SERIF.medium,
    fontSize: 18,
    lineHeight: 23,
  },
  previewPlay: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  backendRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backendInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  backendSave: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginLeft: 10,
  },
  backendSaveText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});
