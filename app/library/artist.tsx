import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "@/components/ScreenHeader";
import SongRow from "@/components/SongRow";
import { Empty } from "./songs";
import { useTheme } from "@/components/Theme";
import { getTracksByArtist, openDb } from "@/lib/db";
import { playQueue } from "@/lib/player";
import { Song, TrackRecord } from "@/lib/types";
import YtCore, { SearchResultItem } from "@/modules/yt-core";
import { ArtistDetails, getArtistDetails } from "@/lib/artist-details";

export default function ArtistScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ name?: string | string[]; thumbnail?: string | string[] }>();
  const name = Array.isArray(params.name) ? params.name[0] : params.name;
  const thumbnail = Array.isArray(params.thumbnail) ? params.thumbnail[0] : params.thumbnail;
  const [tracks, setTracks] = useState<TrackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<ArtistDetails | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    const artistName = name?.trim() ?? "";
    setLoading(true);
    setError(null);
    setDetails(null);
    setTracks([]);
    if (!artistName) {
      setLoading(false);
      setError("Artist name is missing");
      return () => {
        alive = false;
      };
    }
    (async () => {
      const results = await Promise.allSettled([
        openDb().then((db) => getTracksByArtist(db, artistName)),
        YtCore.search(artistName, "songs"),
        getArtistDetails(artistName, thumbnail),
      ]);
      const localTracks = results[0].status === "fulfilled" ? results[0].value : [];
      const result = results[1].status === "fulfilled" ? results[1].value : null;
      const artistDetails = results[2].status === "fulfilled" ? results[2].value : null;
      const remoteTracks = (result?.items ?? [])
        .filter((item: SearchResultItem) => item.type === "song")
        .map((item) => ({
          id: item.id,
          title: item.title,
          artist: item.artist || artistName,
          duration: item.duration,
          thumbnail: item.thumbnail,
          liked: false,
          likedAt: null,
          playCount: 0,
          lastPlayedAt: null,
          downloadStatus: 0 as const,
          localPath: null,
        }));
      const merged = new Map<string, TrackRecord>();
      for (const track of localTracks) merged.set(track.id, track);
      for (const track of remoteTracks) {
        if (!merged.has(track.id)) merged.set(track.id, track);
      }
      if (alive) {
        setTracks([...merged.values()]);
        setDetails(artistDetails);
        if (merged.size === 0 && !artistDetails) setError("Could not load this artist");
      }
    })().catch((e) => {
      if (alive) setError(e instanceof Error ? e.message : "Could not load artist details");
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [name, thumbnail, retry]);

  const play = (index: number) => {
    const list: Song[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      thumbnail: t.thumbnail,
    }));
    playQueue(list, index, name ?? "Artist").catch((e) => {
      Alert.alert("Playback error", e instanceof Error ? e.message : "Could not play this artist");
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={name ?? "Artist"} subtitle={`${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`} />
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingBottom: 140 }}
        ListHeaderComponent={
          <>
            <View style={styles.artistHeader}>
              {(thumbnail || details?.imageUrl || tracks[0]?.thumbnail) ? (
                <Image
                  source={{ uri: thumbnail || details?.imageUrl || tracks[0]?.thumbnail }}
                  style={styles.artistImage}
                />
              ) : (
                <View style={styles.artistImage} />
              )}
      <View style={styles.artistCopy}>
        <Text style={[styles.artistEyebrow, { color: colors.accent }]}>ARTIST</Text>
        <Text numberOfLines={2} style={[styles.artistName, { color: colors.text }]}>
          {name ?? "Unknown artist"}
        </Text>
        <Text style={[styles.artistMeta, { color: colors.muted }]}>
          {[details?.country, details?.formed && `Since ${details.formed}`, tracks.length && `${tracks.length} songs`]
            .filter(Boolean)
            .join("  • ") || "Explore songs by this artist"}
        </Text>
      </View>
    </View>
    {!loading && details?.biography && (
      <Text numberOfLines={4} style={[styles.bio, { color: colors.muted }]}>
        {details.biography}
      </Text>
    )}
    {!loading && details?.genres && details.genres.length > 0 && (
      <View style={styles.tags}>
        {details.genres.map((genre) => (
          <View key={genre} style={[styles.tag, { backgroundColor: colors.elevated }]}>
            <Text style={[styles.tagText, { color: colors.muted }]}>{genre}</Text>
          </View>
        ))}
      </View>
    )}
    {tracks.length > 0 && (
        <Pressable
          style={({ pressed }) => [styles.playBar, { backgroundColor: colors.accent }, pressed && { opacity: 0.85 }]}
          onPress={() => play(0)}
        >
          <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
          <Text style={styles.playText}>Play</Text>
        </Pressable>
      )}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
          ) : error ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={34} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>{error}</Text>
              <Pressable onPress={() => setRetry((value) => value + 1)} style={[styles.retryButton, { backgroundColor: colors.accent }]}>
                <Text style={styles.playText}>Retry</Text>
              </Pressable>
            </View>
          ) : <Empty colors={colors} text="No songs for this artist yet" icon="person-outline" />
        }
        renderItem={({ item, index }) => (
          <SongRow song={item} queue={tracks} index={index} sourceName={name ?? "Artist"} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  playBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  artistHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(128,128,128,0.08)",
  },
  artistImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#2A2A33",
  },
  artistCopy: {
    flex: 1,
    gap: 4,
  },
  artistEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  artistName: {
    fontSize: 20,
    fontWeight: "800",
  },
  artistMeta: {
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
  },
  retryButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 14,
  },
  bio: {
    fontSize: 13,
    lineHeight: 19,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  playText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
