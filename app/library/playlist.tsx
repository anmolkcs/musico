import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "@/components/ScreenHeader";
import SongRow from "@/components/SongRow";
import { PlaylistEditModal } from "@/components/PlaylistMenu";
import { Empty } from "./songs";
import { useTheme } from "@/components/Theme";
import { SANS } from "@/lib/theme";
import { getPlaylist, getPlaylistTracks, openDb, removeTrackFromPlaylist } from "@/lib/db";
import { playQueue } from "@/lib/player";
import { Song, TrackRecord } from "@/lib/types";
import { useLibraryStore } from "@/store/library";
import { useTrackMenu } from "@/store/menu";

export default function PlaylistScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistId = Number(id);
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const updateDetails = useLibraryStore((s) => s.updateDetails);
  const openMenu = useTrackMenu((s) => s.open);
  const [name, setName] = useState("Playlist");
  const [description, setDescription] = useState("");
  const [coverUri, setCoverUri] = useState("");
  const [coverBroken, setCoverBroken] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tracks, setTracks] = useState<TrackRecord[]>([]);
  const [reloadSeq, setReloadSeq] = useState(0);

  const reload = useCallback(async () => {
    const db = await openDb();
    const pl = await getPlaylist(db, playlistId);
    if (pl) {
      setName(pl.name);
      setDescription(pl.description ?? "");
      setCoverUri(pl.coverUri ?? "");
    }
    setTracks(await getPlaylistTracks(db, playlistId));
  }, [playlistId]);

  useEffect(() => {
    setCoverBroken(false);
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
      await removeTrackFromPlaylist(db, playlistId, trackId);
      await refreshLibrary();
      setReloadSeq((n) => n + 1);
    },
    [playlistId, refreshLibrary]
  );

  const play = (index: number) => {
    const list: Song[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      thumbnail: t.thumbnail,
    }));
    playQueue(list, index, name).catch((error) => {
      Alert.alert("Playback error", error instanceof Error ? error.message : "Could not play this playlist");
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={name}
        subtitle={`${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`}
        action={
          <Pressable
            hitSlop={10}
            onPress={() => setEditing(true)}
            style={{ padding: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Edit playlist details"
          >
            <Ionicons name="pencil-outline" size={22} color={colors.accent} />
          </Pressable>
        }
      />
      <View style={styles.hero}>
        <View style={[styles.cover, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
          {coverUri && !coverBroken ? (
            <Image
              source={{ uri: coverUri }}
              style={styles.coverImage}
              contentFit="cover"
              onError={() => setCoverBroken(true)}
            />
          ) : (
            <Ionicons name="musical-notes" size={34} color={colors.accent} />
          )}
        </View>
        <View style={styles.heroMeta}>
          <Text numberOfLines={1} style={[styles.heroName, { color: colors.text }]}>
            {name}
          </Text>
          {description ? (
            <Text numberOfLines={3} style={[styles.heroDesc, { color: colors.muted }]}>
              {description}
            </Text>
          ) : (
            <Pressable hitSlop={8} onPress={() => setEditing(true)}>
              <Text style={[styles.addDesc, { color: colors.faint }]}>Add a description…</Text>
            </Pressable>
          )}
        </View>
      </View>
      {tracks.length > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.playBar,
            { backgroundColor: pressed ? colors.copper : colors.accent },
          ]}
          onPress={() => play(0)}
        >
          <Ionicons name="play" size={16} color={colors.onAccent} style={{ marginLeft: 2 }} />
          <Text style={[styles.playText, { color: colors.onAccent }]}>Play all</Text>
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
                  playlistId,
                  onRemoveFromPlaylist: () => removeFromPlaylist(item.id),
                })
              }
            />
          )}
        />
      )}

      <PlaylistEditModal
        visible={editing}
        initial={{ name, description, coverUri: coverUri || null }}
        onCancel={() => setEditing(false)}
        onSave={async (details) => {
          setEditing(false);
          try {
            await updateDetails(playlistId, {
              name: details.name,
              description: details.description,
              coverUri: details.coverUri,
            });
            setReloadSeq((n) => n + 1);
          } catch {
            Alert.alert("Couldn't save", "Try again.");
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  cover: {
    width: 84,
    height: 84,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  heroMeta: {
    flex: 1,
    gap: 4,
  },
  heroName: {
    fontFamily: SANS.semiBold,
    fontSize: 17,
  },
  heroDesc: {
    fontFamily: SANS.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  addDesc: {
    fontFamily: SANS.regular,
    fontSize: 13,
    fontStyle: "italic",
  },
  playBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  playText: {
    fontFamily: SANS.semiBold,
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
