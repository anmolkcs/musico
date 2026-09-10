import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/components/Theme";
import { SERIF, SANS, VINYL_SHADOW } from "@/lib/theme";
import { playQueue } from "@/lib/player";
import { artworkFor, Song } from "@/lib/types";
import SongRow from "@/components/SongRow";
import { LogoMark } from "@/components/Logo";
import { useLibraryStore } from "@/store/library";

// Mood shortcuts — each runs a real search, no staged mixes.
const MOODS = [
  { label: "Late Night Vinyl", query: "late night vinyl jazz" },
  { label: "Deep Focus", query: "deep focus ambient" },
  { label: "Warm Indie Folk", query: "indie folk acoustic" },
  { label: "Nordic Ambient", query: "nordic ambient" },
] as const;

// Warm umber duotones — the listening-room palette, no neon.
export default function HomeScreen() {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const recent = useLibraryStore((s) => s.recent);
  const liked = useLibraryStore((s) => s.liked);
  const songs = useLibraryStore((s) => s.songs);
  const downloads = useLibraryStore((s) => s.downloads);
  const profileName = useLibraryStore((s) => s.profileName);
  const heroSongs = recent.length > 0 ? recent : liked.length > 0 ? liked : songs;
  // In Rotation: your own recent + liked tracks, newest activity first.
  // (Named honestly — this is your library rotation, not editorial picks.)
  const editorialCuts = React.useMemo(() => {
    const seen = new Set<string>();
    const picks: typeof heroSongs = [];
    for (const t of [...recent, ...liked, ...songs]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      picks.push(t);
      if (picks.length >= 5) break;
    }
    return picks;
  }, [recent, liked, songs]);

  const editorialQueue: Song[] = React.useMemo(
    () =>
      editorialCuts.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        thumbnail: t.thumbnail,
      })),
    [editorialCuts]
  );

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
            <Text style={[styles.greeting, { color: colors.accent }]}>LISTENING ROOM</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <LogoMark size={26} />
              <Text style={[styles.brand, { color: colors.text }]}>Musico</Text>
            </View>
            <Text style={[styles.homeLabel, { color: colors.muted }]}>HOME</Text>
          </View>
          <Pressable
            onPress={() => router.push("/search")}
            style={({ pressed }) => [styles.themeBtn, { borderColor: colors.border }, pressed && { backgroundColor: colors.card }]}
            hitSlop={8}
          >
            <Ionicons name="search" size={20} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.greetingBlock}>
          <Text style={[styles.greetingTitle, { color: colors.text }]}>{profileName ? `Good evening, ${profileName}` : "Your listening room"}</Text>
          <Text style={[styles.greetingBody, { color: colors.muted }]}>
            {recent.length > 0 ? "Pick up where you left off." : "Search for music to start your collection."}
          </Text>
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

        <View style={styles.moodRow}>
          {MOODS.map((mood) => (
            <Pressable
              key={mood.label}
              onPress={() => router.push({ pathname: "/search", params: { q: mood.query } })}
              style={({ pressed }) => [
                styles.moodChip,
                { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                pressed && { backgroundColor: colors.elevated },
              ]}
            >
              <Text style={[styles.moodText, { color: colors.muted }]}>{mood.label}</Text>
            </Pressable>
          ))}
        </View>

        {heroSongs.length > 0 && (
          <View style={styles.heroSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {recent.length > 0 ? "Jump back in" : "Your rotation"}
              </Text>
              <Pressable hitSlop={8} onPress={() => router.push("/library/songs")}>
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
              <Pressable hitSlop={8} onPress={() => router.push("/library/history")}>
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

        {editorialCuts.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={{ gap: 2 }}>
                <Text style={[styles.eyebrow, { color: colors.accent }]}>FROM YOUR LIBRARY</Text>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>In Rotation</Text>
              </View>
              <Pressable hitSlop={8} onPress={() => router.push("/library/songs")}>
                <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
              </Pressable>
            </View>
            <View style={{ gap: 2 }}>
              {editorialCuts.map((item, i) => (
                <SongRow
                  key={item.id}
                  song={{ id: item.id, title: item.title, artist: item.artist, duration: item.duration, thumbnail: item.thumbnail }}
                  index={i}
                  queue={editorialQueue}
                  sourceName="In Rotation"
                />
              ))}
              <Text style={[styles.badgeHint, { color: colors.faint }]}>
                Badges reflect your library — liked and downloaded tracks are marked in the menu.
              </Text>
            </View>
          </>
        )}

        <View style={[styles.hiresCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.hiresIcon, { backgroundColor: colors.elevated }]}>
            <Ionicons name="stats-chart" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hiresTitle, { color: colors.text }]}>
              {downloads.length > 0 ? `${downloads.length} offline ${downloads.length === 1 ? "track" : "tracks"}` : "Streaming ready"}
            </Text>
            <Text style={[styles.hiresBody, { color: colors.muted }]}>
              {downloads.length > 0
                ? "Your downloads live in the Library for offline listening."
                : "Download tracks to keep them offline in your Library."}
            </Text>
          </View>
        </View>

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
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: -0.5,
  },
  homeLabel: { fontFamily: SANS.semiBold, fontSize: 10, letterSpacing: 1.2 },
  greeting: {
    fontFamily: SANS.semiBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  greetingBlock: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  greetingTitle: { fontFamily: SERIF.italic, fontSize: 31, lineHeight: 38 },
  greetingBody: { fontFamily: SANS.regular, fontSize: 14, marginTop: 7 },
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
  moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingTop: 12 },
  moodChip: { height: 32, borderRadius: 16, paddingHorizontal: 14, justifyContent: "center" },
  moodText: { fontFamily: SANS.semiBold, fontSize: 11 },
  eyebrow: { fontFamily: SANS.semiBold, fontSize: 10, letterSpacing: 1.2 },
  badgeHint: { fontFamily: SANS.regular, fontSize: 11, paddingHorizontal: 20, paddingTop: 8, lineHeight: 16 },
  hiresCard: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20, marginTop: 20, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  hiresIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  hiresTitle: { fontFamily: SANS.semiBold, fontSize: 14 },
  hiresBody: { fontFamily: SANS.regular, fontSize: 12, lineHeight: 17, marginTop: 3 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: SERIF.medium,
    fontSize: 21,
    lineHeight: 27,
  },
  seeAll: {
    fontFamily: SANS.semiBold,
    fontSize: 13,
    paddingBottom: 3,
  },
  heroSection: {},
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
