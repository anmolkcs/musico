import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SERIF, SANS } from "../lib/theme";
import { useTheme } from "./Theme";

export type PlaylistMenuTarget = {
  id: number;
  name: string;
  description: string;
  coverUri: string;
  count: number;
};

type MenuProps = {
  playlist: PlaylistMenuTarget | null;
  onClose: () => void;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Long-press sheet for playlists. Mirrors TrackMenu's bottom-sheet design
 * (same backdrop, grabber, rows) so the two dialogs stay consistent.
 */
export function PlaylistMenu({ playlist, onClose, onPlay, onEdit, onDelete }: MenuProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!playlist) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.elevated, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
        <View style={styles.header}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {playlist.name}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>
            {playlist.count} {playlist.count === 1 ? "song" : "songs"}
            {playlist.description ? ` · ${playlist.description}` : ""}
          </Text>
        </View>
        <MenuRow icon="play-outline" label="Play" onPress={onPlay} />
        <MenuRow icon="pencil-outline" label="Edit details" onPress={onEdit} />
        <MenuRow icon="trash-outline" label="Delete playlist" danger onPress={onDelete} />
      </View>
    </Modal>
  );
}

function MenuRow({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHighest }]}
      android_ripple={{ color: colors.border }}
      onPress={onPress}
    >
      <Ionicons name={icon} size={22} color={danger ? colors.accent : colors.text} />
      <Text style={[styles.rowLabel, { color: danger ? colors.accent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export type PlaylistDetails = { name: string; description: string; coverUri: string | null };

/** Edit name, description, and cover art for a playlist. */
export function PlaylistEditModal({
  visible,
  initial,
  onSave,
  onCancel,
}: {
  visible: boolean;
  initial: PlaylistDetails;
  onSave: (details: PlaylistDetails) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [coverUri, setCoverUri] = useState<string | null>(initial.coverUri);
  const [coverBroken, setCoverBroken] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial.name);
      setDescription(initial.description);
      setCoverUri(initial.coverUri);
      setCoverBroken(false);
    }
  }, [visible, initial.name, initial.description, initial.coverUri]);

  const pickCover = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setCoverUri(result.assets[0].uri);
        setCoverBroken(false);
      }
    } catch {
      Alert.alert("Couldn't open photos", "Check the app's photo permission and try again.");
    }
  };

  const canSave = name.trim().length > 0;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.elevated, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>Edit playlist</Text>
          <View style={styles.coverRow}>
            <View style={[styles.cover, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {coverUri && !coverBroken ? (
                <Image
                  source={{ uri: coverUri }}
                  style={styles.coverImage}
                  contentFit="cover"
                  onError={() => setCoverBroken(true)}
                />
              ) : (
                <Ionicons name="musical-notes" size={30} color={colors.accent} />
              )}
            </View>
            <View style={styles.coverActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.smallButton,
                  { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                  pressed && { backgroundColor: colors.surfaceHighest },
                ]}
                onPress={pickCover}
              >
                <Text style={[styles.smallButtonText, { color: colors.text }]}>
                  {coverUri ? "Change image" : "Add image"}
                </Text>
              </Pressable>
              {coverUri && (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setCoverUri(null);
                    setCoverBroken(false);
                  }}
                >
                  <Text style={[styles.removeText, { color: colors.accent }]}>Remove</Text>
                </Pressable>
              )}
            </View>
          </View>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            maxLength={80}
            returnKeyType="next"
          />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>DESCRIPTION</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add a description…"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            multiline
            maxLength={280}
          />
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.ghostButton,
                { borderColor: colors.borderStrong },
                pressed && { backgroundColor: colors.card },
              ]}
              onPress={onCancel}
            >
              <Text style={{ color: colors.text, fontFamily: SANS.semiBold }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: colors.accent, opacity: canSave ? 1 : 0.5 }]}
              disabled={!canSave}
              onPress={() =>
                onSave({ name: name.trim(), description: description.trim(), coverUri })
              }
            >
              <Text style={{ color: colors.onAccent, fontFamily: SANS.semiBold }}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,9,8,0.62)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 2,
  },
  title: {
    fontFamily: SERIF.medium,
    fontSize: 17,
    lineHeight: 23,
  },
  subtitle: {
    fontFamily: SANS.regular,
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  rowLabel: {
    fontFamily: SANS.regular,
    fontSize: 15,
    flex: 1,
  },
  card: {
    margin: 32,
    marginTop: "auto",
    marginBottom: "auto",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 10,
  },
  cardTitle: {
    fontFamily: SERIF.medium,
    fontSize: 19,
    marginBottom: 4,
  },
  coverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 4,
  },
  cover: {
    width: 84,
    height: 84,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverActions: {
    flex: 1,
    gap: 8,
  },
  smallButton: {
    borderRadius: 6,
    paddingHorizontal: 14,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  smallButtonText: {
    fontFamily: SANS.semiBold,
    fontSize: 13,
  },
  removeText: {
    fontFamily: SANS.semiBold,
    fontSize: 13,
    paddingVertical: 4,
  },
  fieldLabel: {
    fontFamily: SANS.semiBold,
    fontSize: 10,
    letterSpacing: 1.1,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    minHeight: 44,
    fontFamily: SANS.regular,
    fontSize: 15,
    textAlignVertical: "center",
  },
  multiline: {
    minHeight: 72,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
  button: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
