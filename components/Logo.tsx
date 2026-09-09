import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/components/Theme";
import { SERIF } from "@/lib/theme";

// Brand colors fixed by the identity; the disc follows the user's accent.
const LABEL = "#F7F4EE";
const MONO = "#C2632B";
const GROOVE = "rgba(20,19,18,0.22)";

// Groove rings as a fraction of the disc diameter, matching the pressed mark.
const GROOVES = [0.895, 0.813, 0.723, 0.625, 0.545];

/**
 * The musico record — terracotta disc, vinyl grooves, ivory label with the
 * italic serif "m". Pure views, so it stays crisp at any size.
 */
export function LogoMark({ size = 32, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  const disc = color ?? colors.accent;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: disc,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {GROOVES.map((frac) => (
        <View
          key={frac}
          style={{
            position: "absolute",
            width: size * frac,
            height: size * frac,
            borderRadius: (size * frac) / 2,
            borderWidth: Math.max(StyleSheet.hairlineWidth * 2, size * 0.011),
            borderColor: GROOVE,
          }}
        />
      ))}
      <View
        style={{
          width: size * 0.352 * 2,
          height: size * 0.352 * 2,
          borderRadius: size * 0.352,
          backgroundColor: LABEL,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: SERIF.mediumItalic, fontSize: size * 0.385, color: MONO }}>m</Text>
      </View>
    </View>
  );
}

/** The "musico" wordmark in Newsreader italic. */
export function LogoWordmark({ size = 24, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: SERIF.mediumItalic,
        fontSize: size,
        color: color ?? colors.text,
        letterSpacing: -0.3,
      }}
    >
      musico
    </Text>
  );
}

/** Mark + wordmark side by side. */
export function LogoLockup({ markSize = 28, textSize = 22, gap = 9, color }: { markSize?: number; textSize?: number; gap?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap }}>
      <LogoMark size={markSize} color={color} />
      <LogoWordmark size={textSize} color={color} />
    </View>
  );
}
