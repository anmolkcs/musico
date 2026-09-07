import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import TrackPlayer, { usePlaybackState, useProgress, State } from "react-native-track-player";
import { getLyrics, LyricLine } from "../lib/lyrics";
import { Song } from "../lib/types";
import { useTheme } from "./Theme";

type Props = { song: Song };

const LINE_HEIGHT = 72; // fixed height per line so scrollToIndex is exact

export default function LyricsView({ song }: Props) {
  const { colors } = useTheme();
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const listRef = useRef<FlatList<LyricLine>>(null);
  const userScrolling = useRef(false);
  const lastAutoIndex = useRef(-1);

  const { position } = useProgress(250);
  const playbackState = usePlaybackState();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLyrics(null);
    setPlain(null);
    setNotFound(false);
    lastAutoIndex.current = -1;
    getLyrics(song)
      .then((result) => {
        if (!alive) return;
        setLyrics(result.synced);
        setPlain(result.plain);
        setNotFound(!result.synced && !result.plain);
      })
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [song.id]);

  const activeIndex = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= position + 0.35) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, position]);

  useEffect(() => {
    if (!lyrics || activeIndex < 0 || userScrolling.current) return;
    if (activeIndex === lastAutoIndex.current) return;
    lastAutoIndex.current = activeIndex;
    try {
      listRef.current?.scrollToIndex({
        index: activeIndex,
        viewPosition: 0.35,
        animated: true,
      });
    } catch {}
  }, [activeIndex, lyrics]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={styles.center}>
        <Text style={[styles.emptyText, { color: colors.muted }]}>No lyrics found</Text>
      </View>
    );
  }

  if (plain && !lyrics) {
    return (
      <View style={styles.plainWrap}>
        <Text style={[styles.plainText, { color: colors.text }]}>{plain}</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={lyrics ?? []}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={{ paddingVertical: 24 }}
      showsVerticalScrollIndicator={false}
      getItemLayout={(_, index) => ({
        length: LINE_HEIGHT,
        offset: LINE_HEIGHT * index,
        index,
      })}
      onScrollBeginDrag={() => {
        userScrolling.current = true;
      }}
      onMomentumScrollEnd={() => {
        setTimeout(() => (userScrolling.current = false), 3000);
      }}
      renderItem={({ item, index }) => {
        const active = index === activeIndex;
        return (
          <Pressable
            style={{ height: LINE_HEIGHT, justifyContent: "center" }}
            onPress={() => TrackPlayer.seekTo(item.time)}
          >
            <Text
              numberOfLines={2}
              style={[
                styles.line,
                { color: active ? colors.text : colors.muted, fontWeight: active ? "800" : "500" },
              ]}
            >
              {item.text || "···"}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
  },
  plainWrap: {
    flex: 1,
    padding: 24,
  },
  plainText: {
    fontSize: 17,
    lineHeight: 28,
  },
  line: {
    fontSize: 22,
    lineHeight: 28,
  },
});
