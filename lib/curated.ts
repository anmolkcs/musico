/**
 * Offline curated shelves for the home feed.
 *
 * These are static — rendering them needs no network and no API. Tapping
 * one runs a real search for its query (same as the mood chips), so the
 * feed feels full even on a fresh install while staying honest: there are
 * no staged tracks, just starting points.
 */

export type CuratedShelf = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  query: string;
  icon: "moon" | "leaf" | "guitar" | "snow" | "heart" | "musical-notes" | "disc" | "cafe";
  gradient: [string, string];
};

export const CURATED_SHELVES: CuratedShelf[] = [
  {
    id: "late-night",
    eyebrow: "AFTER HOURS",
    title: "Late Night Vinyl",
    description: "Low lamplight jazz for the last side.",
    query: "late night vinyl jazz",
    icon: "moon",
    gradient: ["#2E211A", "#1C1917"],
  },
  {
    id: "deep-focus",
    eyebrow: "DRIFT & SPACE",
    title: "Deep Focus",
    description: "Ambient loops that stay out of the way.",
    query: "deep focus ambient",
    icon: "leaf",
    gradient: ["#22302B", "#161C1A"],
  },
  {
    id: "indie-folk",
    eyebrow: "WARM WOODS",
    title: "Warm Indie Folk",
    description: "Acoustic strings and close harmonies.",
    query: "indie folk acoustic",
    icon: "guitar",
    gradient: ["#3A2A1C", "#1E1712"],
  },
  {
    id: "nordic",
    eyebrow: "NORTHERN AIR",
    title: "Nordic Ambient",
    description: "Cold air, wide rooms, slow piano.",
    query: "nordic ambient",
    icon: "snow",
    gradient: ["#26313B", "#151A1F"],
  },
  {
    id: "soul",
    eyebrow: "DEEP VELVET",
    title: "Soul & Neo-R&B",
    description: "Velvet grooves, unhurried tempos.",
    query: "neo soul",
    icon: "heart",
    gradient: ["#3A2320", "#1D1413"],
  },
  {
    id: "classical",
    eyebrow: "FELT & KEY",
    title: "Modern Classical",
    description: "Felt piano and quiet strings.",
    query: "modern classical piano",
    icon: "musical-notes",
    gradient: ["#2C2A33", "#17171B"],
  },
  {
    id: "lofi",
    eyebrow: "TAPE HISS",
    title: "Lo-Fi Hip Hop",
    description: "Dusty drums for reading and rain.",
    query: "lo-fi hip hop",
    icon: "cafe",
    gradient: ["#33301F", "#1A1912"],
  },
  {
    id: "indie-alt",
    eyebrow: "SUB-CURRENTS",
    title: "Indie & Alt",
    description: "Guitars with the edges left on.",
    query: "indie alternative",
    icon: "disc",
    gradient: ["#2B2B26", "#161613"],
  },
];
