import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import TrackPlayer, { useProgress } from "react-native-track-player";
import { getLyrics } from "../lib/lyrics";
import { activeLineIndex, LyricLine } from "../lib/lrc";
import { Song } from "../lib/types";
import { SANS, SERIF } from "../lib/theme";
import { useTheme } from "./Theme";

type Props = { song: Song };

const LINE_HEIGHT = 82;

// Active line sits on an always-dark gradient wash, so its text is fixed
// ivory — theme text turns dark in light mode and becomes unreadable.
const ACTIVE_LYRICS_TEXT = "#F7F4EE";

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
    const current = { ...song };
    getLyrics(current)
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
    // Depend on the stable track id: the parent may recreate the song
    // object on unrelated renders, which must not refetch lyrics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

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
          <Pressable onPress={() => TrackPlayer.seekTo(item.time)}>
            {active ? (
              <LinearGradient
                colors={["rgba(217,119,54,0.20)", "rgba(33,31,30,0.95)", "rgba(20,19,18,0)"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.activeLine}
              >
                <View style={[styles.playMarker, { backgroundColor: colors.accent }]}>
                  <Ionicons name="play" size={10} color={colors.onAccent} style={styles.playMarkerIcon} />
                </View>
                <View style={styles.activeCopy}>
                  <Text numberOfLines={3} style={[styles.line, styles.activeText, { color: ACTIVE_LYRICS_TEXT }]}>
                    {item.text || "···"}
                  </Text>
                  <Text style={[styles.cue, { color: colors.accent }]}>[{formatCueTime(item.time)}]</Text>
                </View>
              </LinearGradient>
            ) : (
              <View style={styles.lineRow}>
            <Text
              numberOfLines={2}
              style={[
                styles.line,
                { color: colors.faint, fontFamily: SERIF.regular },
              ]}
            >
              {item.text || "···"}
            </Text>
              </View>
            )}
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
    fontSize: 22,
    lineHeight: 34,
    paddingHorizontal: 20,
  },
  listContent: {
    paddingTop: 18,
    paddingBottom: 120,
    gap: 8,
  },
  lineRow: {
    minHeight: LINE_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  activeLine: {
    minHeight: 104,
    marginHorizontal: -0,
    paddingHorizontal: 20,
    paddingVertical: 17,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  playMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },
  playMarkerIcon: {
    marginLeft: 1,
  },
  activeCopy: { flex: 1 },
  activeText: { fontFamily: SERIF.italic, paddingHorizontal: 0 },
  cue: { fontFamily: SANS.semiBold, fontSize: 10, letterSpacing: 0.7, marginTop: 5 },
});

function formatCueTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}
