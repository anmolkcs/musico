import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Alert } from "react-native";
import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/components/Theme";
import { playQueue } from "@/lib/player";
import { Song } from "@/lib/types";
import YtCore from "@/modules/yt-core";
import { useLibraryStore } from "@/store/library";
import { artworkFor } from "@/lib/types";

const STATIONS: { title: string; query: string; colors: [string, string, string] }[] = [
  { title: "Today's Hits", query: "today top hits", colors: ["#FA233B", "#B01423", "#5C0A12"] },
  { title: "Chill Mix", query: "chill relaxing mix", colors: ["#2E7CF6", "#1B4FA8", "#0D2450"] },
  { title: "Throwback", query: "2000s throwback hits", colors: ["#F6A623", "#B96F0E", "#5C3506"] },
  { title: "Rock Classics", query: "classic rock greatest hits", colors: ["#8E44AD", "#5B2C78", "#2E1440"] },
  { title: "Hip-Hop Hits", query: "hip hop hits", colors: ["#1DB954", "#0E7A33", "#063D19"] },
  { title: "Indie Vibes", query: "indie pop hits", colors: ["#E84393", "#962B60", "#4A152F"] },
];

export default function HomeScreen() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const recent = useLibraryStore((s) => s.recent);
  const toggleTheme = useLibraryStore((s) => s.toggleTheme);
  const [loadingStation, setLoadingStation] = useState<string | null>(null);

  const playStation = async (station: (typeof STATIONS)[number]) => {
    if (loadingStation) return;
    setLoadingStation(station.title);
    try {
      const result = await YtCore.search(station.query, "songs");
      const songs: Song[] = result.items
        .filter((i) => i.type === "song")
        .map((i) => ({ id: i.id, title: i.title, artist: i.artist, duration: i.duration, thumbnail: i.thumbnail }));
      if (songs.length > 0) {
        await playQueue(songs, 0, station.title);
      } else {
        Alert.alert("No songs found", `Couldn't find songs for "${station.title}". Try again later.`);
      }
    } catch (e: any) {
      Alert.alert("Station unavailable", e?.message ?? "Could not load this station. Check your connection.");
    } finally {
      setLoadingStation(null);
    }
  };

  const playRecent = (index: number) => {
    const songs: Song[] = recent.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      thumbnail: t.thumbnail,
    }));
    playQueue(songs, index, "Recently played").catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.brand, { color: colors.text }]}>
            musico<Text style={{ color: colors.accent }}>.</Text>
          </Text>
          <Pressable onPress={() => toggleTheme(mode)} style={styles.themeBtn} hitSlop={8}>
            <Ionicons name={mode === "dark" ? "sunny" : "moon"} size={22} color={colors.muted} />
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Stations</Text>
        <FlatList
          horizontal
          data={STATIONS}
          keyExtractor={(s) => s.title}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => playStation(item)} style={styles.stationCard}>
              <LinearGradient colors={item.colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
              {loadingStation === item.title ? (
                <ActivityIndicator color="#fff" style={{ flex: 1 }} />
              ) : (
                <>
                  <Ionicons name="radio" size={22} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.stationTitle}>{item.title}</Text>
                  <View style={styles.stationPlay}>
                    <Ionicons name="play" size={16} color="#fff" style={{ marginLeft: 1 }} />
                  </View>
                </>
              )}
            </Pressable>
          )}
        />

        {recent.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recently played</Text>
            <FlatList
              horizontal
              data={recent}
              keyExtractor={(t) => t.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
              renderItem={({ item, index }) => (
                <Pressable style={styles.recentCard} onPress={() => playRecent(index)}>
                  <Image source={{ uri: item.thumbnail || artworkFor(item.id) }} style={styles.recentArt} contentFit="cover" transition={150} />
                  <Text numberOfLines={1} style={[styles.recentTitle, { color: colors.text }]}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.recentArtist, { color: colors.muted }]}>
                    {item.artist}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={null}
            />
          </>
        )}

        {recent.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="musical-notes" size={40} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing here yet</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>
              Search for a song or tap a station to start listening.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  brand: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  themeBtn: {
    padding: 6,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  stationCard: {
    width: 150,
    height: 150,
    borderRadius: 16,
    padding: 14,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  stationTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 21,
  },
  stationPlay: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  recentCard: {
    width: 130,
    gap: 6,
  },
  recentArt: {
    width: 130,
    height: 130,
    borderRadius: 12,
    backgroundColor: "#2A2A33",
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  recentArtist: {
    fontSize: 12,
  },
  emptyWrap: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptyBody: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
