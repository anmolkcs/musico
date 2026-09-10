import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import PromptModal from "@/components/PromptModal";
import ScreenHeader from "@/components/ScreenHeader";
import { PlaylistEditModal, PlaylistMenu, PlaylistMenuTarget } from "@/components/PlaylistMenu";
import { Empty } from "./songs";
import { useTheme } from "@/components/Theme";
import { SANS } from "@/lib/theme";
import { useLibraryStore } from "@/store/library";
import { getPlaylistTracks, openDb } from "@/lib/db";
import { playQueue } from "@/lib/player";
import { Song } from "@/lib/types";

export default function PlaylistsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const playlists = useLibraryStore((s) => s.playlists);
  const { refresh, newPlaylist, removePlaylist, updateDetails } = useLibraryStore.getState();
  const [creating, setCreating] = useState(false);
  const [menuTarget, setMenuTarget] = useState<PlaylistMenuTarget | null>(null);
  const [editing, setEditing] = useState<PlaylistMenuTarget | null>(null);
  // URIs that failed to load, per playlist — compared against the current
  // URI so a newly-picked cover is retried instead of staying hidden.
  const [brokenCovers, setBrokenCovers] = useState<Record<number, string>>({});

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const handleCreate = useCallback(
    async (value: string) => {
      setCreating(false);
      await newPlaylist(value);
    },
    [newPlaylist]
  );

  const playPlaylist = useCallback(
    async (target: PlaylistMenuTarget) => {
      setMenuTarget(null);
      try {
        const db = await openDb();
        const tracks = await getPlaylistTracks(db, target.id);
        if (tracks.length === 0) {
          Alert.alert("Empty playlist", "Add songs from the ⋯ menu anywhere in the app.");
          return;
        }
        const list: Song[] = tracks.map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          duration: t.duration,
          thumbnail: t.thumbnail,
        }));
        await playQueue(list, 0, target.name);
      } catch (e: any) {
        Alert.alert("Playback error", e?.message ?? "Could not play this playlist.");
      }
    },
    []
  );

  const confirmDelete = useCallback(
    (target: PlaylistMenuTarget) => {
      setMenuTarget(null);
      Alert.alert("Delete playlist?", `"${target.name}" will be removed. Songs stay in your library.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => removePlaylist(target.id).catch(() => {}) },
      ]);
    },
    [removePlaylist]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Playlists"
        subtitle={`${playlists.length} playlists`}
        action={
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable
              hitSlop={10}
              onPress={() => router.push("/library/import-spotify" as any)}
              style={{ padding: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Import from Spotify"
            >
              <Ionicons name="download-outline" size={24} color={colors.accent} />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => setCreating(true)} style={{ padding: 8 }}>
              <Ionicons name="add" size={28} color={colors.accent} />
            </Pressable>
          </View>
        }
      />
      {playlists.length === 0 ? (
        <Empty colors={colors} text="Tap + to create a playlist" icon="list-outline" />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item }) => {
            const target: PlaylistMenuTarget = {
              id: item.id,
              name: item.name,
              description: item.description ?? "",
              coverUri: item.coverUri ?? "",
              count: item.count,
            };
            const showCover = !!target.coverUri && brokenCovers[item.id] !== target.coverUri;
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                android_ripple={{ color: colors.border }}
                onPress={() => router.push({ pathname: "/library/playlist", params: { id: String(item.id) } })}
                onLongPress={() => setMenuTarget(target)}
              >
                <View style={[styles.icon, { backgroundColor: colors.elevated }]}>
                  {showCover ? (
                    <Image
                      source={{ uri: target.coverUri }}
                      style={styles.cover}
                      contentFit="cover"
                      onError={() => setBrokenCovers((m) => ({ ...m, [item.id]: target.coverUri }))}
                    />
                  ) : (
                    <Ionicons name="musical-notes" size={20} color={colors.accent} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                    {item.name}
                  </Text>
                  <Text numberOfLines={1} style={[styles.count, { color: colors.muted }]}>
                    {item.count} {item.count === 1 ? "song" : "songs"}
                    {target.description ? ` · ${target.description}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.faint} />
              </Pressable>
            );
          }}
        />
      )}

      <PromptModal
        visible={creating}
        title="New playlist"
        initialValue=""
        placeholder="Playlist name"
        confirmLabel="Create"
        onConfirm={handleCreate}
        onCancel={() => setCreating(false)}
      />

      <PlaylistMenu
        playlist={menuTarget}
        onClose={() => setMenuTarget(null)}
        onPlay={() => menuTarget && playPlaylist(menuTarget)}
        onEdit={() => {
          if (menuTarget) setEditing(menuTarget);
          setMenuTarget(null);
        }}
        onDelete={() => menuTarget && confirmDelete(menuTarget)}
      />

      <PlaylistEditModal
        visible={editing !== null}
        initial={{
          name: editing?.name ?? "",
          description: editing?.description ?? "",
          coverUri: editing?.coverUri || null,
        }}
        onCancel={() => setEditing(null)}
        onSave={async (details) => {
          const id = editing?.id;
          setEditing(null);
          if (id == null) return;
          try {
            await updateDetails(id, {
              name: details.name,
              description: details.description,
              coverUri: details.coverUri,
            });
          } catch {
            Alert.alert("Couldn't save", "Try again.");
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 68,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cover: {
    width: "100%",
    height: "100%",
  },
  name: {
    fontFamily: SANS.semiBold,
    fontSize: 15,
  },
  count: {
    fontFamily: SANS.regular,
    fontSize: 12,
  },
});
