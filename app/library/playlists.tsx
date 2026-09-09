import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import PromptModal from "@/components/PromptModal";
import ScreenHeader from "@/components/ScreenHeader";
import { Empty } from "./songs";
import { useTheme } from "@/components/Theme";
import { SANS } from "@/lib/theme";
import { useLibraryStore } from "@/store/library";

type Mode = { kind: "none" } | { kind: "create" } | { kind: "rename"; id: number; name: string };

export default function PlaylistsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const playlists = useLibraryStore((s) => s.playlists);
  const { refresh, newPlaylist, removePlaylist, rename } = useLibraryStore.getState();
  const [mode, setMode] = useState<Mode>({ kind: "none" });

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const showActions = (id: number, name: string) => {
    Alert.alert(name, undefined, [
      { text: "Rename", onPress: () => setMode({ kind: "rename", id, name }) },
      { text: "Delete", style: "destructive", onPress: () => removePlaylist(id) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleConfirm = useCallback(
    async (value: string) => {
      const current = mode;
      setMode({ kind: "none" });
      if (current.kind === "create") await newPlaylist(value);
      else if (current.kind === "rename") await rename(current.id, value);
    },
    [mode]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Playlists"
        subtitle={`${playlists.length} playlists`}
        action={
          <Pressable hitSlop={10} onPress={() => setMode({ kind: "create" })} style={{ padding: 8 }}>
            <Ionicons name="add" size={28} color={colors.accent} />
          </Pressable>
        }
      />
      {playlists.length === 0 ? (
        <Empty colors={colors} text="Tap + to create a playlist" icon="list-outline" />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              android_ripple={{ color: colors.border }}
              onPress={() => router.push({ pathname: "/library/playlist", params: { id: String(item.id) } })}
              onLongPress={() => showActions(item.id, item.name)}
            >
              <View style={[styles.icon, { backgroundColor: colors.elevated }]}>
                <Ionicons name="musical-notes" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                  {item.name}
                </Text>
                <Text style={[styles.count, { color: colors.muted }]}>
                  {item.count} {item.count === 1 ? "song" : "songs"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </Pressable>
          )}
        />
      )}

      <PromptModal
        visible={mode.kind !== "none"}
        title={mode.kind === "rename" ? "Rename playlist" : "New playlist"}
        initialValue={mode.kind === "rename" ? mode.name : ""}
        placeholder="Playlist name"
        confirmLabel={mode.kind === "rename" ? "Rename" : "Create"}
        onConfirm={handleConfirm}
        onCancel={() => setMode({ kind: "none" })}
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
