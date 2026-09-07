import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "@/components/ScreenHeader";
import SongRow from "@/components/SongRow";
import { Empty } from "./songs";
import { useTheme } from "@/components/Theme";
import { getPlaylist, getPlaylistTracks, openDb, removeTrackFromPlaylist } from "@/lib/db";
import { playQueue } from "@/lib/player";
import { Song, TrackRecord } from "@/lib/types";
import { useLibraryStore } from "@/store/library";
import { useTrackMenu } from "@/store/menu";

export default function PlaylistScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const openMenu = useTrackMenu((s) => s.open);
  const [name, setName] = useState("Playlist");
  const [tracks, setTracks] = useState<TrackRecord[]>([]);
  const [reloadSeq, setReloadSeq] = useState(0);

  const reload = useCallback(async () => {
    const db = await openDb();
    const pl = await getPlaylist(db, Number(id));
    if (pl) setName(pl.name);
    setTracks(await getPlaylistTracks(db, Number(id)));
  }, [id]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload, reloadSeq]);

  // refresh when returning here after adding songs elsewhere
  useEffect(() => {
    const unsub = useLibraryStore.subscribe((s, prev) => {
      if (s.playlists !== prev.playlists) setReloadSeq((n) => n + 1);
    });
    return unsub;
  }, []);

  const removeFromPlaylist = useCallback(
    async (trackId: string) => {
      const db = await openDb();
      await removeTrackFromPlaylist(db, Number(id), trackId);
      await refreshLibrary();
      setReloadSeq((n) => n + 1);
    },
    [id]
  );

  const play = (index: number) => {
    const list: Song[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      thumbnail: t.thumbnail,
    }));
    playQueue(list, index, name).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={name} subtitle={`${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`} />
      {tracks.length > 0 && (
        <Pressable
          style={({ pressed }) => [styles.playBar, { backgroundColor: colors.accent }, pressed && { opacity: 0.85 }]}
          onPress={() => play(0)}
        >
          <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
          <Text style={styles.playText}>Play</Text>
        </Pressable>
      )}
      {tracks.length === 0 ? (
        <Empty colors={colors} text="Add songs from the ⋯ menu anywhere in the app" icon="list-outline" />
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item, index }) => (
            <SongRow
              song={item}
              queue={tracks}
              index={index}
              sourceName={name}
              onPress={() => play(index)}
              onLongPress={() =>
                openMenu(item, {
                  playlistId: Number(id),
                  onRemoveFromPlaylist: () => removeFromPlaylist(item.id),
                })
              }
            />
          )}
        />
      )}
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
  playText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
