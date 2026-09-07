import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "@/components/ScreenHeader";
import SongRow from "@/components/SongRow";
import { useTheme } from "@/components/Theme";
import { playQueue } from "@/lib/player";
import { Song } from "@/lib/types";
import { useLibraryStore } from "@/store/library";

export default function SongsScreen() {
  const { colors } = useTheme();
  const songs = useLibraryStore((s) => s.songs);
  const refresh = useLibraryStore((s) => s.refresh);

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const playAll = (index: number) => {
    const list: Song[] = songs.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      thumbnail: t.thumbnail,
    }));
    playQueue(list, index, "Songs").catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Songs" subtitle={`${songs.length} songs`} />
      {songs.length === 0 ? (
        <Empty colors={colors} text="Songs you play will appear here" icon="musical-notes-outline" />
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item, index }) => (
            <SongRow
              song={item}
              queue={songs}
              index={index}
              sourceName="Songs"
              onPress={() => playAll(index)}
              trailing={renderTrailing(item.liked, colors)}
            />
          )}
        />
      )}
    </View>
  );
}

function renderTrailing(liked: boolean, colors: any) {
  return liked ? <Ionicons name="heart" size={14} color={colors.accent} style={{ marginRight: 4 }} /> : undefined;
}

export function Empty({ colors, text, icon }: { colors: any; text: string; icon: keyof typeof Ionicons.IconMap }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={36} color={colors.muted} />
      <Text style={[styles.text, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 32,
  },
  text: {
    fontSize: 14,
    textAlign: "center",
  },
});
