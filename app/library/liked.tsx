import React, { useEffect } from "react";
import { FlatList, View } from "react-native";
import ScreenHeader from "@/components/ScreenHeader";
import SongRow from "@/components/SongRow";
import { useTheme } from "@/components/Theme";
import { Empty } from "./songs";
import { playQueue } from "@/lib/player";
import { Song } from "@/lib/types";
import { useLibraryStore } from "@/store/library";

export default function LikedScreen() {
  const { colors } = useTheme();
  const liked = useLibraryStore((s) => s.liked);
  const refresh = useLibraryStore((s) => s.refresh);

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const play = (index: number) => {
    const list: Song[] = liked.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      thumbnail: t.thumbnail,
    }));
    playQueue(list, index, "Liked Songs").catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Liked Songs" subtitle={`${liked.length} songs`} />
      {liked.length === 0 ? (
        <Empty colors={colors} text="Songs you like will appear here" icon="heart-outline" />
      ) : (
        <FlatList
          data={liked}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item, index }) => (
            <SongRow song={item} queue={liked} index={index} sourceName="Liked Songs" onPress={() => play(index)} />
          )}
        />
      )}
    </View>
  );
}
