# musico

Free Apple Music–style music app for Android. Streams from YouTube Music using the
[NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) engine (the same one behind
NewPipe / ViMusic / InnerTune), with synced lyrics from [LRCLIB](https://lrclib.net).
No accounts, no API keys, no server — everything runs on-device.

## Stack

- Expo SDK 54 + expo-router (tabs: Home / Search / Library, mini-player, full-screen player)
- Extraction: local Expo module [`modules/yt-core`](modules/yt-core) (Kotlin) wrapping NewPipeExtractor
- Playback: react-native-track-player (ExoPlayer) — background playback + lock-screen controls
- Library: expo-sqlite + zustand (tracks, liked, playlists, history, downloads, lyrics cache, settings)
- Downloads: expo-file-system (audio-only m4a/opus saved as-is, offline playback)
- Lyrics: LRCLIB synced LRC with auto-scroll + click-to-seek

## Development

```bash
npm install
npx expo prebuild -p android      # generate android/ (already generated)
cd android && ./gradlew assembleDebug   # build the dev client APK
adb install android/app/build/outputs/apk/debug/app-debug.apk
npx expo start --dev-client        # Metro; app connects via adb reverse tcp:8081
```

A development build is required (not Expo Go) because of the native extraction module and
react-native-track-player.

The GitHub Actions Android artifact is a release-variant APK with the JavaScript bundle
embedded, so it can be installed and launched without a connected ADB device or Metro server.

### Web development

The web build uses public Piped and Invidious instances for search and stream resolution.
Start it with:

```bash
npx expo start --web
```

If the public instances are unavailable, open **Settings > Web backend** and enter a
Piped API base URL. The value is stored locally in the browser and takes priority over
the built-in Piped instance list.

### Waydroid testing

```bash
waydroid session start &            # note the IP from `waydroid status`
adb connect <waydroid-ip>:5555
adb reverse tcp:8081 tcp:8081
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## When extraction breaks (YouTube changes)

YouTube changes their internals regularly. When search/playback fails, bump the extractor
version in [`modules/yt-core/android/build.gradle`](modules/yt-core/android/build.gradle):

```gradle
api "com.github.TeamNewPipe:NewPipeExtractor:vX.Y.Z"   // latest: https://github.com/TeamNewPipe/NewPipeExtractor/releases
```

then rebuild the APK. Latest tested version: **v0.26.5**.

A host-JVM smoke test for extraction lives in [`scripts/extraction-test`](scripts/extraction-test):
it verifies search, stream URL resolution, stream playability and LRCLIB without a device.

## License notes

- NewPipeExtractor is GPL-3.0: fine for personal use; if you distribute this app, it must be GPL too.
