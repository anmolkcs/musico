import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SongRow from "@/components/SongRow";
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
  const { songs, liked, recent, playlists, artists, downloads, historyCount } = useLibraryStore();

  // Liked + Downloads live as bento cards above, so they are intentionally
  // excluded here to avoid showing them twice.
  const rows: Row[] = [
    { icon: "musical-notes", label: "Songs", count: songs.length, route: "/library/songs" },
    { icon: "list", label: "Playlists", count: playlists.length, route: "/library/playlists" },
    { icon: "person", label: "Artists", count: artists.length, route: "/library/artists" },
    { icon: "time", label: "History", count: historyCount, route: "/library/history" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>ARCHIVED WORKS</Text>
            <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>Your Library</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => router.push("/library/songs")}
              style={({ pressed }) => [
                styles.settingsButton,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { backgroundColor: colors.elevated },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Search library"
            >
              <Ionicons name="search" size={20} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/settings" as any)}
              style={({ pressed }) => [
                styles.settingsButton,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { backgroundColor: colors.elevated },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Ionicons name="settings-outline" size={20} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.bento}>
          <Pressable
            onPress={() => router.push("/library/liked" as any)}
            style={({ pressed }) => [
              styles.bentoCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { backgroundColor: colors.elevated },
            ]}
          >
            <View style={[styles.bentoIcon, { backgroundColor: colors.elevated }]}>
              <Ionicons name="heart" size={20} color={colors.accent} />
            </View>
            <Text style={[styles.bentoTag, { color: colors.accent }]}>AUTO</Text>
            <Text style={[styles.bentoTitle, { color: colors.text }]}>Liked Songs</Text>
            <Text style={[styles.bentoSub, { color: colors.muted }]}>
              {liked.length} {liked.length === 1 ? "track" : "tracks"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/downloads" as any)}
            style={({ pressed }) => [
              styles.bentoCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { backgroundColor: colors.elevated },
            ]}
          >
            <View style={[styles.bentoIcon, { backgroundColor: colors.elevated }]}>
              <Ionicons name="download" size={20} color={colors.accent} />
            </View>
            <Text style={[styles.bentoTag, { color: colors.muted }]}>OFFLINE</Text>
            <Text style={[styles.bentoTitle, { color: colors.text }]}>Downloads</Text>
            <Text style={[styles.bentoSub, { color: colors.muted }]}>
              {downloads.length} {downloads.length === 1 ? "track" : "tracks"}
            </Text>
          </Pressable>
        </View>

        {recent.length > 0 && (
          <>
            <View style={styles.listHeader}>
              <Text style={[styles.collectionLabel, { color: colors.muted }]}>RECENTLY ADDED</Text>
              <Pressable onPress={() => router.push("/library/history" as any)}>
                <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
              </Pressable>
            </View>
            <View>
              {recent.slice(0, 5).map((item, i) => (
                <SongRow
                  key={item.id}
                  song={{ id: item.id, title: item.title, artist: item.artist, duration: item.duration, thumbnail: item.thumbnail }}
                  index={i}
                  queue={recent.slice(0, 5).map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration, thumbnail: t.thumbnail }))}
                  sourceName="Recently played"
                  dense
                />
              ))}
            </View>
          </>
        )}

        <Text style={[styles.collectionLabel, { color: colors.muted, paddingTop: 18 }]}>YOUR COLLECTION</Text>
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
  collectionLabel: { fontFamily: SANS.semiBold, fontSize: 10, letterSpacing: 1.1, paddingHorizontal: 20, paddingBottom: 10 },
  listHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingRight: 20, paddingBottom: 2 },
  seeAll: { fontFamily: SANS.semiBold, fontSize: 13 },
  bento: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6 },
  bentoCard: { flex: 1, minHeight: 144, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 14, justifyContent: "flex-end", gap: 2 },
  bentoIcon: { position: "absolute", top: 12, left: 12, width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bentoTag: { position: "absolute", top: 14, right: 12, fontFamily: SANS.semiBold, fontSize: 9, letterSpacing: 1.1 },
  bentoTitle: { fontFamily: SERIF.medium, fontSize: 18, lineHeight: 23, marginTop: 30 },
  bentoSub: { fontFamily: SANS.regular, fontSize: 12 },
  tile: {
    width: "48%",
    aspectRatio: 1.6,
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
});
