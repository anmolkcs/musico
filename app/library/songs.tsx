import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "@/components/ScreenHeader";
import SongRow from "@/components/SongRow";
import { useTheme } from "@/components/Theme";
import { SERIF } from "@/lib/theme";
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
      <ScreenHeader title="Songs" subtitle={`${songs.length} ${songs.length === 1 ? "song" : "songs"}`} />
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

export function Empty({ colors, text, icon }: { colors: any; text: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.center}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name={icon} size={26} color={colors.faint} />
      </View>
      <Text style={[styles.text, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 32,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: SERIF.italic,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
