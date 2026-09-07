import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import MiniPlayer from "@/components/MiniPlayer";
import { useTheme } from "@/components/Theme";

function TabBarBackground() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 56 + insets.bottom,
        backgroundColor: colors.tabBar,
        borderTopWidth: 0.5,
        borderTopColor: colors.border,
      }}
    />
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            position: "absolute",
            borderTopWidth: 0,
            backgroundColor: "transparent",
            elevation: 0,
            height: 56 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 4,
          },
          tabBarBackground: () => <TabBarBackground />,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ color }) => <Ionicons name="search" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: "Library",
            tabBarIcon: ({ color }) => <Ionicons name="library" size={24} color={color} />,
          }}
        />
      </Tabs>
      <MiniPlayer />
    </View>
  );
}
