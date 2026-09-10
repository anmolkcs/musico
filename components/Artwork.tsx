import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { artworkFor } from "../lib/types";
import { useSaavnArtwork } from "../lib/saavn-art";
import { useTheme } from "./Theme";

type Props = {
  song: { id: string; thumbnail?: string; title?: string; artist?: string };
  size: number;
  radius?: number;
  style?: ViewStyle;
  /**
   * Resolve a high-res JioSaavn cover for songs. Leave false for videos,
   * albums, artists, and anything else whose YouTube thumbnail must stay.
   */
  enhance?: boolean;
};

export default function Artwork({ song, size, radius = 8, style, enhance = true }: Props) {
  const { colors } = useTheme();
  const saavn = useSaavnArtwork(song.title, song.artist, enhance);
  const fallback = song.thumbnail && song.thumbnail.length > 0 ? song.thumbnail : artworkFor(song.id);
  const [saavnBad, setSaavnBad] = useState(false);
  const [fallbackBad, setFallbackBad] = useState(false);
  // A new source clears previous load errors; the YouTube thumbnail (or the
  // generated placeholder URL) always remains as the fallback underneath.
  React.useEffect(() => {
    setSaavnBad(false);
    setFallbackBad(false);
  }, [saavn, fallback]);
  const uri = !saavnBad && saavn ? saavn : fallback;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: "#262320",
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {fallbackBad ? (
        <Ionicons name="musical-note" size={Math.max(16, size * 0.4)} color={colors.faint} />
      ) : (
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={song.id}
          transition={150}
          onError={() => (uri === saavn ? setSaavnBad(true) : setFallbackBad(true))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%" },
});
