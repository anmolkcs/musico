import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import TrackPlayer, { useProgress } from "react-native-track-player";
import { getLyrics } from "../lib/lyrics";
import { activeLineIndex, LyricLine } from "../lib/lrc";
import { Song } from "../lib/types";
import { SERIF } from "../lib/theme";
import { useTheme } from "./Theme";

type Props = { song: Song };

const LINE_HEIGHT = 64;

export default function LyricsView({ song }: Props) {
  const { colors } = useTheme();
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const listRef = useRef<FlatList<LyricLine>>(null);
  const userScrolling = useRef(false);
  const resumeScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoIndex = useRef(-1);

  useEffect(() => () => {
    if (resumeScrollTimer.current) clearTimeout(resumeScrollTimer.current);
  }, []);

  const { position } = useProgress(250);

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
  }, [song.id, song.title, song.artist, song.duration]);

  const activeIndex = useMemo(
    () => (lyrics ? activeLineIndex(lyrics, position) : -1),
    [lyrics, position]
  );

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
      contentContainerStyle={styles.listContent}
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
          if (resumeScrollTimer.current) clearTimeout(resumeScrollTimer.current);
          resumeScrollTimer.current = setTimeout(() => {
            userScrolling.current = false;
            resumeScrollTimer.current = null;
          }, 3000);
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
                { color: active ? colors.text : colors.faint, fontFamily: active ? SERIF.medium : SERIF.regular },
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
    fontFamily: SERIF.italic,
    fontSize: 16,
  },
  plainWrap: {
    flex: 1,
    padding: 24,
  },
  plainText: {
    fontFamily: SERIF.regular,
    fontSize: 19,
    lineHeight: 30,
  },
  line: {
    fontSize: 21,
    lineHeight: 30,
    textAlign: "center",
    paddingHorizontal: 28,
  },
  listContent: {
    paddingVertical: 20,
    paddingHorizontal: 8,
  },
});
