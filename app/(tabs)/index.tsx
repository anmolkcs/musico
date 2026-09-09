import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/components/Theme";
import { SERIF, SANS, VINYL_SHADOW } from "@/lib/theme";
import { playQueue } from "@/lib/player";
import { artworkFor, Song } from "@/lib/types";
import YtCore from "@/modules/yt-core";
import { useLibraryStore } from "@/store/library";

// Warm umber duotones — the listening-room palette, no neon.
const STATIONS: { title: string; query: string; colors: [string, string, string] }[] = [
  { title: "Late Night Vinyl", query: "late night mellow classics", colors: ["#3A2A1C", "#241B13", "#15110E"] },
  { title: "Morning Rituals", query: "acoustic morning coffeehouse", colors: ["#43301F", "#2A2018", "#171310"] },
  { title: "Analog Throwback", query: "70s 80s classic hits", colors: ["#3D241A", "#261A12", "#161009"] },
  { title: "Velvet Jazz", query: "smooth jazz saxophone", colors: ["#33251E", "#201914", "#121009"] },
  { title: "Rainy Window", query: "rainy day lofi chill", colors: ["#2E2A24", "#1E1B17", "#121110"] },
  { title: "Amber Hour", query: "sunset indie folk", colors: ["#462E1A", "#2B1D10", "#171008"] },
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
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.greeting, { color: colors.faint }]}>Welcome back</Text>
            <Text style={[styles.brand, { color: colors.text }]}>
              musico<Text style={{ color: colors.accent }}>.</Text>
            </Text>
          </View>
          <Pressable
            onPress={() => toggleTheme(mode)}
            style={({ pressed }) => [styles.themeBtn, { borderColor: colors.border }, pressed && { backgroundColor: colors.card }]}
            hitSlop={8}
          >
            <Ionicons name={mode === "dark" ? "sunny-outline" : "moon-outline"} size={20} color={colors.muted} />
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
          <Ionicons name="search" size={18} color={colors.faint} />
          <Text style={[styles.searchPromptText, { color: colors.faint }]}>Songs, artists, albums…</Text>
        </Pressable>

        <View style={styles.quickActions}>
          <QuickAction icon="heart" label="Liked" count={liked.length} colors={colors} onPress={() => router.push("/library/liked")} />
          <QuickAction icon="download-outline" label="Offline" count={downloads.length} colors={colors} onPress={() => router.push("/downloads")} />
          <QuickAction icon="library-outline" label="Library" count={songs.length} colors={colors} onPress={() => router.push("/library")} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Listening rooms</Text>
          <Text style={[styles.sectionHint, { color: colors.faint }]}>Pick a mood</Text>
        </View>
        <FlatList
          horizontal
          data={STATIONS}
          keyExtractor={(s) => s.title}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => playStation(item)}
              style={({ pressed }) => [
                styles.stationCard,
                { borderColor: colors.border },
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Play ${item.title}`}
            >
              <LinearGradient colors={item.colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
              {loadingStation === item.title ? (
                <ActivityIndicator color={colors.accent} style={{ flex: 1 }} />
              ) : (
                <>
                  <Ionicons name="radio-outline" size={20} color={colors.accent} />
                  <Text numberOfLines={2} style={styles.stationTitle}>{item.title}</Text>
                  <View style={styles.stationPlay}>
                    <Ionicons name="play" size={13} color={colors.onAccent} style={{ marginLeft: 1 }} />
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
                {recent.length > 0 ? "Jump back in" : "Your rotation"}
              </Text>
              <Pressable onPress={() => router.push("/library/songs")}>
                <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [styles.heroCard, { borderColor: colors.border }, pressed && { opacity: 0.92 }]}
              onPress={() => playCollection(heroSongs, recent.length > 0 ? "Recently played" : "Your music")}
            >
              <LinearGradient
                colors={mode === "dark" ? ["#2E211A", "#1C1917"] : ["#EFE3D6", "#F7F4EE"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={styles.heroArtStack}>
                {heroSongs.slice(0, 3).map((song, index) => (
                  <Image
                    key={song.id}
                    source={{ uri: song.thumbnail || artworkFor(song.id) }}
                    style={[styles.heroArt, { left: index * 26, zIndex: 3 - index, transform: [{ rotate: `${(index - 1) * 6}deg` }] }]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ))}
              </View>
              <View style={styles.heroMeta}>
                <View style={[styles.heroBadge, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                  <Text style={[styles.heroBadgeText, { color: colors.accent }]}>MIX FOR YOU</Text>
                </View>
                <Text numberOfLines={2} style={[styles.heroTitle, { color: colors.text }]}>
                  {recent.length > 0 ? "Keep the needle moving" : "Start your collection"}
                </Text>
                <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
                  {heroSongs.length} {heroSongs.length === 1 ? "song" : "songs"} ready to play
                </Text>
              </View>
              <View style={[styles.heroPlay, { backgroundColor: colors.accent }, VINYL_SHADOW]}>
                <Ionicons name="play" size={18} color={colors.onAccent} style={{ marginLeft: 2 }} />
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
              contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
              renderItem={({ item, index }) => (
                <Pressable style={styles.recentCard} onPress={() => playRecent(index)}>
                  <Image
                    source={{ uri: item.thumbnail || artworkFor(item.id) }}
                    style={[styles.recentArt, { backgroundColor: colors.card }]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                  />
                  <Text numberOfLines={1} style={[styles.recentTitle, { color: colors.text }]}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.recentArtist, { color: colors.faint }]}>
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
            <Ionicons name="disc-outline" size={40} color={colors.faint} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Your shelf is empty</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>
              Search for a song or drop the tonearm on a listening room to begin.
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
  colors: { card: string; elevated: string; border: string; accent: string; text: string; muted: string; faint: string };
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
      <Text style={[styles.quickCount, { color: colors.faint }]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  brand: {
    fontFamily: SERIF.regular,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -0.5,
  },
  greeting: {
    fontFamily: SANS.semiBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  searchPrompt: {
    marginHorizontal: 20,
    height: 48,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  searchPromptText: {
    flex: 1,
    fontFamily: SANS.regular,
    fontSize: 14,
  },
  quickActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  quickAction: {
    flex: 1,
    minHeight: 76,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    justifyContent: "space-between",
  },
  quickLabel: {
    fontFamily: SANS.semiBold,
    fontSize: 12,
  },
  quickCount: {
    fontFamily: SANS.regular,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingRight: 20,
  },
  sectionTitle: {
    fontFamily: SERIF.medium,
    fontSize: 21,
    lineHeight: 27,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 12,
  },
  sectionHint: {
    fontFamily: SANS.regular,
    fontSize: 12,
    marginTop: 22,
  },
  seeAll: {
    fontFamily: SANS.semiBold,
    fontSize: 13,
  },
  heroSection: {
    marginTop: 4,
  },
  heroCard: {
    minHeight: 156,
    marginHorizontal: 20,
    marginTop: 2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    gap: 14,
  },
  heroArtStack: {
    width: 118,
    height: 110,
    position: "relative",
    justifyContent: "center",
  },
  heroArt: {
    position: "absolute",
    width: 70,
    height: 70,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(247,244,238,0.12)",
  },
  heroMeta: {
    flex: 1,
    gap: 6,
  },
  heroBadge: {
    alignSelf: "flex-start",
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  heroBadgeText: {
    fontFamily: SANS.semiBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontFamily: SERIF.medium,
    fontSize: 20,
    lineHeight: 25,
  },
  heroSubtitle: {
    fontFamily: SANS.regular,
    fontSize: 12,
  },
  heroPlay: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stationCard: {
    width: 146,
    height: 146,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  stationTitle: {
    color: "#F7F4EE",
    fontFamily: SERIF.medium,
    fontSize: 17,
    lineHeight: 22,
    maxWidth: 110,
    paddingRight: 8,
  },
  stationPlay: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(20,19,18,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  recentCard: {
    width: 128,
    gap: 7,
  },
  recentArt: {
    width: 128,
    height: 128,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(247,244,238,0.08)",
  },
  recentTitle: {
    fontFamily: SANS.semiBold,
    fontSize: 13,
  },
  recentArtist: {
    fontFamily: SANS.regular,
    fontSize: 12,
  },
  emptyWrap: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emptyTitle: {
    fontFamily: SERIF.medium,
    fontSize: 19,
  },
  emptyBody: {
    fontFamily: SANS.regular,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
});
