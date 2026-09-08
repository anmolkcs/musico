import { requireNativeModule } from "expo-modules-core";

export type { SearchResult, SearchResultItem, StreamResult } from "./types";
import type { SearchResult, StreamResult } from "./types";

type YtCoreNativeModule = {
  search(query: string, filter: string): Promise<SearchResult>;
  getStream(videoId: string): Promise<StreamResult>;
};

export default requireNativeModule<YtCoreNativeModule>("YtCore");
