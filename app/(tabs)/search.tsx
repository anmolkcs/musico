import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SongRow, { SongRowSkeleton } from "@/components/SongRow";
import { useTheme } from "@/components/Theme";
import { SERIF, SANS } from "@/lib/theme";
import { Song } from "@/lib/types";
import YtCore, { SearchResultItem } from "@/modules/yt-core";

const FILTERS = [
  { key: "songs", label: "Songs" },
  { key: "videos", label: "Videos" },
  { key: "artists", label: "Artists" },
  { key: "albums", label: "Albums" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("songs");
  const [results, setResults] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const runSearch = async (q: string, f: Filter) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await YtCore.search(trimmed, f);
      if (seq !== seqRef.current) return;
      const songs: Song[] = res.items.map((item: SearchResultItem) => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        duration: item.duration,
        thumbnail: item.thumbnail,
        type: item.type,
      }));
      setResults(songs);
    } catch (e: any) {
      if (seq !== seqRef.current) return;
      setError(e?.message ?? "Search failed");
      setResults([]);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query, filter), 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filter]);

  const songs = results.filter((r) => r.type === "song" || r.type === undefined);
  const songIndexes = useMemo(() => new Map(songs.map((song, index) => [song.id, index])), [songs]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
      <View style={styles.searchHeading}>
        <Text style={[styles.heading, { color: colors.text }]}>Search</Text>
        <Text style={[styles.helper, { color: colors.muted }]}>Find your next favorite song</Text>
      </View>
      <View style={styles.searchBarWrap}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.card, borderColor: inputFocused ? colors.accent : colors.border },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Songs, artists, albums…"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text }]}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            autoCorrect={false}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
          {query.length > 0 && (
            <Pressable hitSlop={8} onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.accentSoft : colors.card,
                  borderColor: active ? colors.accent : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? colors.text : colors.muted,
                  fontFamily: SANS.semiBold,
                  fontSize: 12,
                  letterSpacing: 0.3,
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && results.length === 0 && (
        <FlatList
          data={Array.from({ length: 6 }, (_, index) => index)}
          keyExtractor={(item) => `song-skeleton-${item}`}
          renderItem={() => <SongRowSkeleton />}
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {error && (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.muted} />
          <Text style={[styles.errorText, { color: colors.muted }]}>{error}</Text>
        </View>
      )}

      {!loading && !error && results.length === 0 && (
        <View style={styles.center}>
          <Ionicons name={query ? "sad-outline" : "search"} size={36} color={colors.muted} />
          <Text style={[styles.errorText, { color: colors.muted }]}>
            {query ? "No results" : "Search YouTube Music"}
          </Text>
        </View>
      )}

      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item, i) => `${item.id}-${i}`}
          contentContainerStyle={{ paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) =>
            item.type === "artist" || item.type === "album" ? (
              <SongRow
                song={item}
                showArtist={item.type === "album"}
                onPress={
                  item.type === "artist"
                    ? () =>
                        router.push({
                          pathname: "/library/artist",
                          params: { name: item.title, thumbnail: item.thumbnail },
                        })
                    : undefined
                }
                trailing={
                  item.type === "artist" ? (
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginRight: 8 }} />
                  ) : undefined
                }
              />
            ) : (
              <SongRow
                song={item}
                index={songIndexes.get(item.id) ?? 0}
                queue={songs}
                sourceName={`Search: ${query}`}
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBarWrap: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchHeading: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  heading: {
    fontFamily: SERIF.regular,
    fontSize: 32,
    lineHeight: 39,
    letterSpacing: -0.5,
  },
  helper: {
    fontFamily: SERIF.regular,
    fontSize: 14,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    fontFamily: SANS.regular,
    fontSize: 15,
    paddingVertical: 0,
  },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  errorText: {
    fontFamily: SANS.regular,
    fontSize: 14,
    textAlign: "center",
  },
});
