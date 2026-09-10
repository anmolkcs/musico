import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SERIF, SANS } from "../lib/theme";
import { useTheme } from "./Theme";
import { useTrackMenu } from "../store/menu";
import { useLibraryStore } from "../store/library";
import { enqueueLast, enqueueNext } from "../lib/player";
import { useDownloadsStore } from "../lib/downloads";
import { addTrackToPlaylist, openDb, upsertTrack } from "../lib/db";

type Option = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
};

export default function TrackMenu() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const track = useTrackMenu((s) => s.track);
  const context = useTrackMenu((s) => s.context);
  const close = useTrackMenu((s) => s.close);
  const songs = useLibraryStore((s) => s.songs);
  const likedSongs = useLibraryStore((s) => s.liked);
  const playlists = useLibraryStore((s) => s.playlists);
  const { like, newPlaylist } = useLibraryStore.getState();
  const { start, cancel, remove, items } = useDownloadsStore();

  const [mode, setMode] = useState<"options" | "playlists" | "new">("options");
  const [name, setName] = useState("");

  // Reset to the options view whenever a different track's menu opens —
  // otherwise a stale "playlists"/"new" view leaks into the next menu.
  const trackId = track?.id;
  React.useEffect(() => {
    setMode("options");
    setName("");
  }, [trackId]);

  const song = track;
  const liked = song ? likedSongs.some((t) => t.id === song.id) || songs.find((t) => t.id === song.id)?.liked : false;
  const download = song ? items[song.id] : undefined;

  if (!song) return null;

  const ensureTrack = async () => {
    const db = await openDb();
    await upsertTrack(db, song);
  };

  const options: Option[] = [];

  if (context.playlistId && context.onRemoveFromPlaylist) {
    options.push({
      icon: "remove-circle-outline",
      label: "Remove from playlist",
      danger: true,
      onPress: () => {
        close();
        context.onRemoveFromPlaylist?.();
      },
    });
  }

  if (songs.length > 0) {
    options.push({
      icon: "play-forward-outline",
      label: "Play next",
      onPress: () => {
        enqueueNext(song).catch(() => {});
        close();
      },
    });
    options.push({
      icon: "list-outline",
      label: "Add to queue",
      onPress: () => {
        enqueueLast(song).catch(() => {});
        close();
      },
    });
  }

  options.push({
    icon: "add-circle-outline",
    label: "Add to playlist",
    onPress: () => setMode("playlists"),
  });

  options.push({
    icon: liked ? "heart" : "heart-outline",
    label: liked ? "Remove from Liked" : "Add to Liked",
    onPress: () => {
      close();
      like(song, !liked).catch((e) => {
        Alert.alert("Library error", e instanceof Error ? e.message : "Could not update liked songs");
      });
    },
  });

  if (!download || download.status === "error") {
    options.push({
      icon: "download-outline",
      label: "Download",
      onPress: () => {
        close();
        ensureTrack()
          .then(() => start(song))
          .catch((error) => Alert.alert("Download error", error instanceof Error ? error.message : "Could not download this song"));
      },
    });
  } else if (download.status === "downloading") {
    options.push({
      icon: "close-circle-outline",
      label: "Cancel download",
      onPress: () => {
        close();
        cancel(song.id).catch(() => Alert.alert("Download error", "Could not cancel the download"));
      },
    });
  } else if (download.status === "done") {
    options.push({
      icon: "trash-outline",
      label: "Delete download",
      danger: true,
      onPress: () => {
        close();
        remove(song.id).catch(() => Alert.alert("Download error", "Could not delete the download"));
      },
    });
  }

  const handleNewPlaylist = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const id = await newPlaylist(trimmed);
      const db = await openDb();
      await upsertTrack(db, song);
      await addTrackToPlaylist(db, id, song);
      await useLibraryStore.getState().refresh();
      setName("");
      setMode("options");
      close();
      Alert.alert("Added", `Added to "${trimmed}"`);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not create the playlist");
    }
  };

  const addToPlaylist = async (playlistId: number, playlistName: string) => {
    try {
      const db = await openDb();
      await upsertTrack(db, song);
      await addTrackToPlaylist(db, playlistId, song);
      await useLibraryStore.getState().refresh();
      setMode("options");
      close();
      Alert.alert("Added", `Added to "${playlistName}"`);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not add to the playlist");
    }
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { backgroundColor: colors.elevated, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
        {mode === "options" && (
          <>
            <View style={styles.header}>
              <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
                {song.title}
              </Text>
              <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>
                {song.artist || "Unknown artist"}
              </Text>
            </View>
            {options.map((opt) => (
              <Pressable
                key={opt.label}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHighest }]}
                android_ripple={{ color: colors.border }}
                onPress={opt.onPress}
              >
                <Ionicons name={opt.icon} size={22} color={opt.danger ? colors.accent : colors.text} />
                <Text style={[styles.rowLabel, { color: opt.danger ? colors.accent : colors.text }]}>{opt.label}</Text>
              </Pressable>
            ))}
          </>
        )}

        {mode === "playlists" && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Add to playlist</Text>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHighest }]}
              onPress={() => setMode("new")}
            >
              <Ionicons name="add" size={22} color={colors.accent} />
              <Text style={[styles.rowLabel, { color: colors.accent }]}>New playlist</Text>
            </Pressable>
            {playlists.map((p) => (
              <Pressable
                key={p.id}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHighest }]}
                onPress={() => addToPlaylist(p.id, p.name)}
              >
                <Ionicons name="musical-notes-outline" size={22} color={colors.text} />
                <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
            {playlists.length === 0 && (
              <Text style={[styles.empty, { color: colors.muted }]}>No playlists yet</Text>
            )}
          </>
        )}

        {mode === "new" && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>New playlist</Text>
            <TextInput
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder="Playlist name"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              onSubmitEditing={handleNewPlaylist}
              returnKeyType="done"
            />
            <View style={styles.buttonRow}>
              <Pressable style={[styles.button, { backgroundColor: colors.elevated }]} onPress={() => setMode("playlists")}>
                <Text style={{ color: colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.button, { backgroundColor: colors.accent }]} onPress={handleNewPlaylist}>
                <Text style={{ color: colors.onAccent, fontFamily: SANS.semiBold }}>Create</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,9,8,0.62)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 2,
  },
  title: {
    fontFamily: SERIF.medium,
    fontSize: 17,
    lineHeight: 23,
  },
  subtitle: {
    fontFamily: SANS.regular,
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  rowLabel: {
    fontFamily: SANS.regular,
    fontSize: 15,
    flex: 1,
  },
  sectionTitle: {
    fontFamily: SERIF.medium,
    fontSize: 18,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  empty: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    fontFamily: SANS.regular,
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 44,
    fontFamily: SANS.regular,
    fontSize: 15,
    marginHorizontal: 12,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    padding: 12,
  },
  button: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
