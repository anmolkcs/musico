import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "@/components/ScreenHeader";
import { Empty } from "./songs";
import { useTheme } from "@/components/Theme";
import { useLibraryStore } from "@/store/library";

export default function ArtistsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const artists = useLibraryStore((s) => s.artists);
  const refresh = useLibraryStore((s) => s.refresh);

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Artists" subtitle={`${artists.length} artists`} />
      {artists.length === 0 ? (
        <Empty colors={colors} text="Artists from your listening history will appear here" icon="person-outline" />
      ) : (
        <FlatList
          data={artists}
          keyExtractor={(a) => a.name}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              android_ripple={{ color: colors.border }}
              onPress={() =>
                router.push({ pathname: "/library/artist", params: { name: item.name } })
              }
            >
              <View style={[styles.avatar, { backgroundColor: colors.elevated }]}>
                <Ionicons name="person" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                  {item.name}
                </Text>
                <Text style={[styles.count, { color: colors.muted }]}>
                  {item.count} {item.count === 1 ? "song" : "songs"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
  },
  count: {
    fontSize: 13,
  },
});
