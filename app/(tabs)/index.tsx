import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/components/Theme";
import { playQueue } from "@/lib/player";
import { artworkFor, Song } from "@/lib/types";
import YtCore from "@/modules/yt-core";
import { useLibraryStore } from "@/store/library";

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const recent = useLibraryStore((s) => s.recent);
  const liked = useLibraryStore((s) => s.liked);
  const downloads = useLibraryStore((s) => s.downloads);
  const songs = useLibraryStore((s) => s.songs);
  const toggleTheme = useLibraryStore((s) => s.toggleTheme);
  const [loadingStation, setLoadingStation] = useState<string | null>(null);
  const heroSongs = recent.length > 0 ? recent : liked.length > 0 ? liked : songs;

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
    const queue: Song[] = recent.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      thumbnail: t.thumbnail,
    }));
    playQueue(queue, index, "Recently played").catch((e) => {
      Alert.alert("Playback error", e instanceof Error ? e.message : "Could not play this song");
    });
  };

  const playCollection = (collection: typeof heroSongs, sourceName: string) => {
    const queue: Song[] = collection.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      thumbnail: t.thumbnail,
    }));
    if (queue.length > 0) {
      playQueue(queue, 0, sourceName).catch((e) => {
        Alert.alert("Playback error", e instanceof Error ? e.message : "Could not play this song");
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.greeting, { color: colors.muted }]}>WELCOME BACK</Text>
            <Text style={[styles.brand, { color: colors.text }]}>
            musico<Text style={{ color: colors.accent }}>.</Text>
            </Text>
          </View>
          <Pressable onPress={() => toggleTheme(mode)} style={styles.themeBtn} hitSlop={8}>
            <Ionicons name={mode === "dark" ? "sunny" : "moon"} size={22} color={colors.muted} />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.searchPrompt,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { backgroundColor: colors.elevated },
          ]}
          onPress={() => router.push("/search")}
        >
          <Ionicons name="search" size={20} color={colors.accent} />
          <Text style={[styles.searchPromptText, { color: colors.muted }]}>What do you want to listen to?</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.muted} />
        </Pressable>

        <View style={styles.quickActions}>
          <QuickAction icon="heart" label="Liked songs" count={liked.length} colors={colors} onPress={() => router.push("/library/liked")} />
          <QuickAction icon="download" label="Downloads" count={downloads.length} colors={colors} onPress={() => router.push("/downloads")} />
          <QuickAction icon="library" label="Your library" count={songs.length} colors={colors} onPress={() => router.push("/library")} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Made for you</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>Pick a mood</Text>
        </View>
        <FlatList
          horizontal
          data={STATIONS}
          keyExtractor={(s) => s.title}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => playStation(item)}
              style={({ pressed }) => [styles.stationCard, pressed && { transform: [{ scale: 0.97 }] }]}
              accessibilityRole="button"
              accessibilityLabel={`Play ${item.title}`}
            >
              <LinearGradient colors={item.colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
              {loadingStation === item.title ? (
                <ActivityIndicator color="#fff" style={{ flex: 1 }} />
              ) : (
                <>
                  <Ionicons name="radio" size={22} color="rgba(255,255,255,0.9)" />
                  <Text numberOfLines={2} style={styles.stationTitle}>{item.title}</Text>
                  <View style={styles.stationPlay}>
                    <Ionicons name="play" size={16} color="#fff" style={{ marginLeft: 1 }} />
                  </View>
                </>
              )}
            </Pressable>
          )}
        />

        {heroSongs.length > 0 && (
          <View style={styles.heroSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {recent.length > 0 ? "Jump back in" : "Your music"}
              </Text>
              <Pressable onPress={() => router.push("/library/songs")}>
                <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [styles.heroCard, pressed && { opacity: 0.9 }]}
              onPress={() => playCollection(heroSongs, recent.length > 0 ? "Recently played" : "Your music")}
            >
              <LinearGradient
                colors={mode === "dark" ? ["#3C101A", "#1C1720"] : ["#FFE4E8", "#F5EAF0"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={styles.heroArtStack}>
                {heroSongs.slice(0, 3).map((song, index) => (
                  <Image
                    key={song.id}
                    source={{ uri: song.thumbnail || artworkFor(song.id) }}
                    style={[styles.heroArt, { left: index * 28, zIndex: 3 - index, transform: [{ rotate: `${(index - 1) * 7}deg` }] }]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ))}
              </View>
              <View style={styles.heroMeta}>
                <Text style={[styles.heroEyebrow, { color: colors.accent }]}>MIX FOR YOU</Text>
                <Text numberOfLines={2} style={[styles.heroTitle, { color: colors.text }]}>
                  {recent.length > 0 ? "Keep the music going" : "Build your soundtrack"}
                </Text>
                <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
                  {heroSongs.length} {heroSongs.length === 1 ? "song" : "songs"} ready to play
                </Text>
              </View>
              <View style={[styles.heroPlay, { backgroundColor: colors.accent }]}>
                <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
              </View>
            </Pressable>
          </View>
        )}

        {recent.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Recently played</Text>
              <Pressable onPress={() => router.push("/library/history")}>
                <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
              </Pressable>
            </View>
            <FlatList
              horizontal
              data={recent}
              keyExtractor={(t) => t.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
              renderItem={({ item, index }) => (
                <Pressable style={styles.recentCard} onPress={() => playRecent(index)}>
                  <Image
                    source={{ uri: item.thumbnail || artworkFor(item.id) }}
                    style={styles.recentArt}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                  />
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

        {recent.length === 0 && liked.length === 0 && songs.length === 0 && (
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

function QuickAction({
  icon,
  label,
  count,
  colors,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  colors: { card: string; elevated: string; border: string; accent: string; text: string; muted: string };
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { backgroundColor: colors.elevated },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text numberOfLines={1} style={[styles.quickLabel, { color: colors.text }]}>
        {label}
      </Text>
      <Text style={[styles.quickCount, { color: colors.muted }]}>{count}</Text>
    </Pressable>
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
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  greeting: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  searchPrompt: {
    marginHorizontal: 16,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  searchPromptText: {
    flex: 1,
    fontSize: 14,
  },
  quickActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  quickAction: {
    flex: 1,
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    justifyContent: "space-between",
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  quickCount: {
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingRight: 16,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionHint: {
    fontSize: 12,
    marginTop: 16,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: "700",
  },
  heroSection: {
    marginTop: 2,
  },
  heroCard: {
    minHeight: 156,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    gap: 12,
  },
  heroArtStack: {
    width: 122,
    height: 112,
    position: "relative",
    justifyContent: "center",
  },
  heroArt: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#2A2A33",
  },
  heroMeta: {
    flex: 1,
    gap: 5,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  heroTitle: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "800",
  },
  heroSubtitle: {
    fontSize: 12,
  },
  heroPlay: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
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
    maxWidth: 112,
    paddingRight: 8,
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
