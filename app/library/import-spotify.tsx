import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import ScreenHeader from "@/components/ScreenHeader";
import { useTheme } from "@/components/Theme";
import { SANS, SERIF } from "@/lib/theme";
import { Song } from "@/lib/types";
import { fetchSpotifyCollection, SpotifyCollection } from "@/lib/spotify-import";
import { addTracksToPlaylist, openDb } from "@/lib/db";
import YtCore from "@/modules/yt-core";
import { useLibraryStore } from "@/store/library";

type MatchState = "idle" | "matching" | "matched" | "failed";

type Row = {
  key: string;
  title: string;
  artist: string;
  state: MatchState;
  matched?: Song;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ImportSpotifyScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [collection, setCollection] = useState<SpotifyCollection | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [matching, setMatching] = useState(false);
  const [matched, setMatched] = useState(0);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelMatchRef = useRef(false);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelMatchRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  const handleFetch = async () => {
    // A new fetch invalidates any in-flight match loop from a previous list.
    fetchIdRef.current += 1;
    cancelMatchRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFetching(true);
    setCollection(null);
    setRows([]);
    setMatched(0);
    try {
      const col = await fetchSpotifyCollection(link, controller.signal);
      setCollection(col);
      setRows(
        col.tracks.map((t, i) => ({
          key: `${i}-${t.title}-${t.artist}`,
          title: t.title,
          artist: t.artist,
          state: "idle" as MatchState,
        }))
      );
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        Alert.alert("Couldn't read link", e?.message ?? "Try a different Spotify link.");
      }
    } finally {
      setFetching(false);
    }
  };

  const handleMatch = async () => {
    if (matching || rows.length === 0) return;
    // Snapshot the list: state updates during the loop must not change
    // what we iterate, and a newer fetch invalidates this run entirely.
    const snapshot = rows.map((r) => ({ title: r.title, artist: r.artist }));
    const fetchId = fetchIdRef.current;
    cancelMatchRef.current = false;
    setMatching(true);
    let done = 0;
    const alive = () => mountedRef.current && fetchIdRef.current === fetchId && !cancelMatchRef.current;
    for (let i = 0; i < snapshot.length; i++) {
      if (!alive()) break;
      setRows((prev) => prev.map((r, j) => (j === i ? { ...r, state: "matching" } : r)));
      const row = snapshot[i];
      try {
        const res = await YtCore.search(`${row.title} ${row.artist}`.trim(), "songs");
        if (!alive()) break;
        const hit = res.items.find((item) => item.type === "song" || item.type === undefined) ?? res.items[0];
        if (hit) {
          const song: Song = {
            id: hit.id,
            title: hit.title,
            artist: hit.artist || row.artist,
            duration: hit.duration,
            thumbnail: hit.thumbnail,
          };
          setRows((prev) => prev.map((r, j) => (j === i ? { ...r, state: "matched", matched: song } : r)));
          done += 1;
          setMatched(done);
        } else {
          setRows((prev) => prev.map((r, j) => (j === i ? { ...r, state: "failed" } : r)));
        }
      } catch {
        if (!alive()) break;
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, state: "failed" } : r)));
      }
      // Be gentle with the search backend on long playlists.
      if (i < snapshot.length - 1) await sleep(350);
    }
    if (mountedRef.current && fetchIdRef.current === fetchId) setMatching(false);
  };

  const handleSave = async () => {
    const songs = rows.map((r) => r.matched).filter((s): s is Song => !!s);
    if (songs.length === 0 || saving) return;
    setSaving(true);
    let playlistId: number | null = null;
    try {
      const name = collection?.name ?? "Spotify import";
      const db = await openDb();
      playlistId = await useLibraryStore.getState().newPlaylist(name);
      await addTracksToPlaylist(db, playlistId, songs);
      await useLibraryStore.getState().refresh();
      router.replace({ pathname: "/library/playlist", params: { id: String(playlistId) } });
    } catch (e: any) {
      // The bulk insert rolls back on failure; remove the empty playlist
      // shell so a failed save leaves no trace.
      if (playlistId !== null) {
        try {
          await useLibraryStore.getState().removePlaylist(playlistId);
        } catch {}
      }
      Alert.alert("Save failed", e?.message ?? "Could not create the playlist.");
    } finally {
      setSaving(false);
    }
  };

  const failed = rows.filter((r) => r.state === "failed").length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Import from Spotify" subtitle="No Spotify account needed" />
      <View style={styles.inputWrap}>
        <View
          style={[
            styles.inputBar,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Ionicons name="link" size={18} color={colors.muted} />
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="Paste a public Spotify playlist link…"
            placeholderTextColor={colors.faint}
            style={[styles.input, { color: colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleFetch}
          />
          {link.length > 0 && (
            <Pressable hitSlop={8} onPress={() => setLink("")}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={handleFetch}
          disabled={fetching || link.trim().length === 0}
          style={({ pressed }) => [
            styles.fetchButton,
            { backgroundColor: colors.accent, opacity: fetching || link.trim().length === 0 ? 0.5 : 1 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {fetching ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.fetchText, { color: colors.onAccent }]}>Fetch tracks</Text>
          )}
        </Pressable>
        <Text style={[styles.tip, { color: colors.faint }]}>
          Public playlists, albums, and tracks work. Liked Songs are private to your Spotify account — on desktop,
          select them all, add to a new public playlist, then paste that link here.
        </Text>
      </View>

      {collection && (
        <View style={styles.collectionHeader}>
          <Text numberOfLines={1} style={[styles.collectionName, { color: colors.text }]}>
            {collection.name}
          </Text>
          <Text style={[styles.collectionMeta, { color: colors.muted }]}>
            {rows.length} tracks
            {collection.totalCount != null && collection.totalCount > rows.length
              ? ` of ${collection.totalCount}`
              : ""}
            {matched > 0 ? ` • ${matched} matched` : ""}
            {failed > 0 ? ` • ${failed} not found` : ""}
          </Text>
          {collection.truncated && (
            <Text style={[styles.truncatedNote, { color: colors.accent }]}>
              Spotify only exposed the first {rows.length}
              {collection.totalCount != null && collection.totalCount > rows.length
                ? ` of ${collection.totalCount}`
                : ""}
              {" "}tracks — the rest could not be read without a Spotify login.
            </Text>
          )}
          {matching && (
            <View style={[styles.progressTrack, { backgroundColor: colors.elevated }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.accent,
                    width: `${Math.round(((matched + failed) / Math.max(1, rows.length)) * 100)}%`,
                  },
                ]}
              />
            </View>
          )}
          <View style={styles.actions}>
            <Pressable
              onPress={matching ? () => (cancelMatchRef.current = true) : handleMatch}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                pressed && { backgroundColor: colors.elevated },
              ]}
            >
              <Text style={[styles.actionText, { color: colors.text }]}>
                {matching ? "Stop matching" : matched > 0 ? "Match again" : "Match on YouTube"}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={matched === 0 || matching || saving}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.accent, opacity: matched === 0 || matching || saving ? 0.5 : 1 },
                pressed && { opacity: 0.85 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[styles.actionText, { color: colors.onAccent }]}>
                  Save {matched > 0 ? `(${matched}) ` : ""}as playlist
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <StatusIcon state={item.state} />
            <View style={styles.meta}>
              <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
                {item.matched?.title ?? item.title}
              </Text>
              <Text numberOfLines={1} style={[styles.artist, { color: colors.muted }]}>
                {item.matched ? item.matched.artist : item.artist || "Unknown artist"}
                {item.state === "failed" ? " • not found on YouTube" : ""}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function StatusIcon({ state }: { state: MatchState }) {
  const { colors } = useTheme();
  if (state === "matching") return <ActivityIndicator size="small" color={colors.accent} />;
  if (state === "matched") return <Ionicons name="checkmark-circle" size={20} color={colors.accent} />;
  if (state === "failed") return <Ionicons name="close-circle-outline" size={20} color={colors.faint} />;
  return <Ionicons name="ellipse-outline" size={20} color={colors.faint} />;
}

const styles = StyleSheet.create({
  inputWrap: { paddingHorizontal: 20, paddingBottom: 8 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
  },
  input: { flex: 1, fontFamily: SANS.regular, fontSize: 14, paddingVertical: 0 },
  fetchButton: {
    marginTop: 10,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fetchText: { fontFamily: SANS.semiBold, fontSize: 14 },
  tip: { fontFamily: SANS.regular, fontSize: 12, lineHeight: 17, marginTop: 10 },
  truncatedNote: { fontFamily: SANS.regular, fontSize: 12, lineHeight: 17, marginTop: 6 },
  collectionHeader: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  collectionName: { fontFamily: SERIF.medium, fontSize: 22, lineHeight: 28 },
  collectionMeta: { fontFamily: SANS.regular, fontSize: 13, marginTop: 2 },
  progressTrack: { height: 4, borderRadius: 2, marginTop: 10, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionButton: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  actionText: { fontFamily: SANS.semiBold, fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  meta: { flex: 1, gap: 2 },
  title: { fontFamily: SANS.semiBold, fontSize: 14, lineHeight: 19 },
  artist: { fontFamily: SANS.regular, fontSize: 12, lineHeight: 16 },
});
