import React, { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "@/components/ScreenHeader";
import SongRow from "@/components/SongRow";
import { Empty } from "./songs";
import { useTheme } from "@/components/Theme";
import { clearHistory, getHistoryEntries, openDb } from "@/lib/db";
import { playQueue } from "@/lib/player";
import { Song, TrackRecord } from "@/lib/types";

type Entry = { track: TrackRecord; playedAt: number };

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const [entries, setEntries] = useState<Entry[]>([]);

  const reload = () => {
    openDb()
      .then((db) => getHistoryEntries(db, 200))
      .then(setEntries)
      .catch(() => {});
  };

  useEffect(reload, []);

  const confirmClear = () => {
    Alert.alert("Clear history?", "This removes your listening history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          const db = await openDb();
          await clearHistory(db);
          reload();
        },
      },
    ]);
  };

  const play = (index: number) => {
    const list: Song[] = entries.map((e) => ({
      id: e.track.id,
      title: e.track.title,
      artist: e.track.artist,
      duration: e.track.duration,
      thumbnail: e.track.thumbnail,
    }));
    playQueue(list, index, "History").catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="History"
        subtitle={`${entries.length} plays`}
        action={
          entries.length > 0 ? (
            <Pressable hitSlop={10} onPress={confirmClear} style={{ padding: 8 }}>
              <Ionicons name="trash-outline" size={22} color={colors.muted} />
            </Pressable>
          ) : undefined
        }
      />
      {entries.length === 0 ? (
        <Empty colors={colors} text="Your listening history will appear here" icon="time-outline" />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e, i) => `${e.track.id}-${i}`}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item, index }) => (
            <SongRow
              song={item.track}
              queue={entries.map((e) => e.track)}
              index={index}
              sourceName="History"
              onPress={() => play(index)}
              trailing={
                <Text style={{ color: colors.muted, fontSize: 12, marginRight: 6 }}>{timeAgo(item.playedAt)}</Text>
              }
            />
          )}
        />
      )}
    </View>
  );
}
