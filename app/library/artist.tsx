import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "@/components/ScreenHeader";
import SongRow from "@/components/SongRow";
import { Empty } from "./songs";
import { useTheme } from "@/components/Theme";
import { getTracksByArtist, openDb } from "@/lib/db";
import { playQueue } from "@/lib/player";
import { Song, TrackRecord } from "@/lib/types";

export default function ArtistScreen() {
  const { colors } = useTheme();
  const { name } = useLocalSearchParams<{ name: string }>();
  const [tracks, setTracks] = useState<TrackRecord[]>([]);

  useEffect(() => {
    openDb()
      .then((db) => getTracksByArtist(db, name ?? ""))
      .then(setTracks)
      .catch(() => {});
  }, [name]);

  const play = (index: number) => {
    const list: Song[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      thumbnail: t.thumbnail,
    }));
    playQueue(list, index, name ?? "Artist").catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={name ?? "Artist"} subtitle={`${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`} />
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
        <Empty colors={colors} text="No songs for this artist yet" icon="person-outline" />
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item, index }) => (
            <SongRow song={item} queue={tracks} index={index} sourceName={name ?? "Artist"} onPress={() => play(index)} />
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
