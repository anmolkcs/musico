import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SongRow from "@/components/SongRow";
import { useTheme } from "@/components/Theme";
import { Song, SearchResultItem } from "@/lib/types";
import YtCore from "@/modules/yt-core";

const FILTERS = [
  { key: "songs", label: "Songs" },
  { key: "videos", label: "Videos" },
  { key: "artists", label: "Artists" },
  { key: "albums", label: "Albums" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

export default function SearchScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("songs");
  const [results, setResults] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        id: item.id || item.url,
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
      <View style={styles.searchBarWrap}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.accent : colors.border },
              ]}
            >
              <Text style={{ color: active ? "#fff" : colors.text, fontWeight: active ? "700" : "500", fontSize: 13 }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && results.length === 0 && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
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
                onPress={() => {}}
                trailing={
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginRight: 8 }} />
                }
              />
            ) : (
              <SongRow song={item} index={undefined} queue={songs} sourceName={`Search: ${query}`} />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
  },
});
