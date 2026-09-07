import { requireNativeModule } from "expo-modules-core";

export type SearchResultItem = {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  type: "song" | "artist" | "album";
  artist: string;
  duration: number;
};

export type SearchResult = {
  query: string;
  filter: string;
  items: SearchResultItem[];
};

export type StreamResult = {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  streamUrl: string;
  format: string;
  mimeType: string;
  bitrate: number;
};

type YtCoreNativeModule = {
  search(query: string, filter: string): Promise<SearchResult>;
  getStream(videoId: string): Promise<StreamResult>;
};

export default requireNativeModule<YtCoreNativeModule>("YtCore");
