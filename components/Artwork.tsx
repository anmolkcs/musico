import { Image } from "expo-image";
import { StyleSheet, View, ViewStyle } from "react-native";
import { artworkFor } from "../lib/types";

type Props = {
  song: { id: string; thumbnail?: string };
  size: number;
  radius?: number;
  style?: ViewStyle;
};

export default function Artwork({ song, size, radius = 8, style }: Props) {
  const uri = song.thumbnail && song.thumbnail.length > 0 ? song.thumbnail : artworkFor(song.id);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: "#262320",
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={150}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%" },
});
