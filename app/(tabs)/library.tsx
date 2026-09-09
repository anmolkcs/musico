import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/components/Theme";
import { SERIF, SANS } from "@/lib/theme";
import { useLibraryStore } from "@/store/library";

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  route: string;
};

export default function LibraryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { songs, liked, playlists, artists, downloads, historyCount } = useLibraryStore();

  const rows: Row[] = [
    { icon: "musical-notes", label: "Songs", count: songs.length, route: "/library/songs" },
    { icon: "heart", label: "Liked", count: liked.length, route: "/library/liked" },
    { icon: "list", label: "Playlists", count: playlists.length, route: "/library/playlists" },
    { icon: "person", label: "Artists", count: artists.length, route: "/library/artists" },
    { icon: "download", label: "Downloads", count: downloads.length, route: "/downloads" },
    { icon: "time", label: "History", count: historyCount, route: "/library/history" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headingRow}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.faint }]}>YOUR COLLECTION</Text>
            <Text style={[styles.title, { color: colors.text }]}>Library</Text>
          </View>
          <Pressable
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [
              styles.settingsButton,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { backgroundColor: colors.elevated },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Ionicons name="settings-outline" size={21} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.grid}>
          {rows.map((row) => (
            <Pressable
              key={row.label}
              style={({ pressed }) => [
                styles.tile,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { backgroundColor: colors.elevated, transform: [{ scale: 0.98 }] },
              ]}
              android_ripple={{ color: colors.border }}
              onPress={() => router.push(row.route as any)}
            >
              <Ionicons name={row.icon} size={26} color={colors.accent} />
              <Text style={[styles.tileLabel, { color: colors.text }]}>{row.label}</Text>
              <Text style={[styles.tileCount, { color: colors.muted }]}>{row.count}</Text>
            </Pressable>
          ))}
        </View>

        {playlists.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.text }]}>Recent playlists</Text>
            {playlists.slice(0, 5).map((p) => (
              <Pressable
                key={p.id}
                style={({ pressed }) => [styles.plRow, pressed && { opacity: 0.7 }]}
                android_ripple={{ color: colors.border }}
                onPress={() => router.push({ pathname: "/library/playlist", params: { id: String(p.id) } })}
              >
                <View style={[styles.plIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="musical-notes" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.plName, { color: colors.text }]}>
                    {p.name}
                  </Text>
                  <Text style={[styles.plCount, { color: colors.muted }]}>
                    {p.count} {p.count === 1 ? "song" : "songs"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.faint} />
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: SERIF.regular,
    fontSize: 32,
    lineHeight: 39,
    letterSpacing: -0.5,
    paddingBottom: 14,
  },
  headingRow: {
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingsButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontFamily: SANS.semiBold,
    fontSize: 10,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 10,
  },
  tile: {
    width: "30.5%",
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    justifyContent: "space-between",
  },
  tileLabel: {
    fontFamily: SANS.semiBold,
    fontSize: 14,
  },
  tileCount: {
    fontFamily: SANS.regular,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  section: {
    fontFamily: SERIF.medium,
    fontSize: 19,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  plRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  plIcon: {
    width: 44,
    height: 44,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  plName: {
    fontFamily: SANS.semiBold,
    fontSize: 15,
  },
  plCount: {
    fontFamily: SANS.regular,
    fontSize: 12,
  },
});
