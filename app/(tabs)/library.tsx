import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/components/Theme";
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
  const { songs, liked, playlists, artists, downloads } = useLibraryStore();

  const rows: Row[] = [
    { icon: "musical-notes", label: "Songs", count: songs.length, route: "/library/songs" },
    { icon: "heart", label: "Liked", count: liked.length, route: "/library/liked" },
    { icon: "list", label: "Playlists", count: playlists.length, route: "/library/playlists" },
    { icon: "person", label: "Artists", count: artists.length, route: "/library/artists" },
    { icon: "download", label: "Downloads", count: downloads.length, route: "/downloads" },
    { icon: "time", label: "History", count: 0, route: "/library/history" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Library</Text>
        <View style={styles.grid}>
          {rows.map((row) => (
            <Pressable
              key={row.label}
              style={({ pressed }) => [
                styles.tile,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
              android_ripple={{ color: colors.border }}
              onPress={() => router.push(row.route as any)}
            >
              <Ionicons name={row.icon} size={26} color={colors.accent} />
              <Text style={[styles.tileLabel, { color: colors.text }]}>{row.label}</Text>
              <Text style={[styles.tileCount, { color: colors.muted }]}>
                {row.label === "History" ? "" : `${row.count}`}
              </Text>
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
                <View style={[styles.plIcon, { backgroundColor: colors.elevated }]}>
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
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
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
    fontSize: 30,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
  },
  tile: {
    width: "30.5%",
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  tileLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  tileCount: {
    fontSize: 13,
  },
  section: {
    fontSize: 20,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 6,
  },
  plRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  plIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  plName: {
    fontSize: 15,
    fontWeight: "600",
  },
  plCount: {
    fontSize: 13,
  },
});
