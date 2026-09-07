import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./Theme";
import { useTrackMenu } from "../store/menu";
import { useLibraryStore } from "../store/library";
import { useQueueStore } from "../store/queue";
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
  const { songs, liked: likedSongs, playlists } = useLibraryStore();
  const { like, newPlaylist } = useLibraryStore.getState();
  const { start, cancel, remove, items } = useDownloadsStore();

  const [mode, setMode] = useState<"options" | "playlists" | "new">("options");
  const [name, setName] = useState("");

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
        useQueueStore.getState().insertNext(song);
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
      like(song, !liked).catch(() => {});
    },
  });

  if (!download || download.status === "error") {
    options.push({
      icon: "download-outline",
      label: "Download",
      onPress: () => {
        close();
        ensureTrack().then(() => start(song)).catch(() => {});
      },
    });
  } else if (download.status === "downloading") {
    options.push({
      icon: "close-circle-outline",
      label: "Cancel download",
      onPress: () => {
        close();
        cancel(song.id).catch(() => {});
      },
    });
  } else if (download.status === "done") {
    options.push({
      icon: "trash-outline",
      label: "Delete download",
      danger: true,
      onPress: () => {
        close();
        remove(song.id).catch(() => {});
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
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 12 }]}>
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
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.elevated }]}
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
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.elevated }]}
              onPress={() => setMode("new")}
            >
              <Ionicons name="add" size={22} color={colors.accent} />
              <Text style={[styles.rowLabel, { color: colors.accent }]}>New playlist</Text>
            </Pressable>
            {playlists.map((p) => (
              <Pressable
                key={p.id}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.elevated }]}
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
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.elevated }]}
              onSubmitEditing={handleNewPlaylist}
              returnKeyType="done"
            />
            <View style={styles.buttonRow}>
              <Pressable style={[styles.button, { backgroundColor: colors.elevated }]} onPress={() => setMode("playlists")}>
                <Text style={{ color: colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.button, { backgroundColor: colors.accent }]} onPress={handleNewPlaylist}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Create</Text>
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
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 8,
    paddingTop: 16,
  },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  rowLabel: {
    fontSize: 16,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  empty: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    paddingVertical: 10,
    borderRadius: 10,
  },
});
