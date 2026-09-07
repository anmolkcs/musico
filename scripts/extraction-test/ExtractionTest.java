import org.schabi.newpipe.extractor.InfoItem;
import org.schabi.newpipe.extractor.MediaFormat;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.localization.ContentCountry;
import org.schabi.newpipe.extractor.localization.Localization;
import org.schabi.newpipe.extractor.search.SearchInfo;
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.StreamInfoItem;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ExtractionTest {
  static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
  static final HttpClient client = HttpClient.newBuilder()
      .followRedirects(HttpClient.Redirect.ALWAYS)
      .connectTimeout(Duration.ofSeconds(15))
      .build();

  public static void main(String[] args) throws Exception {
    NewPipe.init(new JdkDownloader(), new Localization("en", "US"), new ContentCountry("US"));

    // 1. Search with YouTube Music SONGS filter
    var factory = ServiceList.YouTube.getSearchQHFactory();
    var handler = factory.fromQuery("blinding lights",
        List.of(YoutubeSearchQueryHandlerFactory.MUSIC_SONGS), "");
    SearchInfo info = SearchInfo.getInfo(ServiceList.YouTube, handler);
    List<InfoItem> items = info.getRelatedItems();
    System.out.println("search results: " + items.size());
    if (items.isEmpty()) throw new IllegalStateException("no search results");
    for (int i = 0; i < Math.min(5, items.size()); i++) {
      InfoItem it = items.get(i);
      String artist = it instanceof StreamInfoItem s ? s.getUploaderName() : "?";
      long dur = it instanceof StreamInfoItem s ? s.getDuration() : -1;
      System.out.println("  - " + it.getName() + " | " + artist + " | " + dur + "s | " + videoIdFromUrl(it.getUrl()));
    }

    // 2. Resolve stream for the first song
    StreamInfoItem first = (StreamInfoItem) items.get(0);
    StreamInfo si = StreamInfo.getInfo(ServiceList.YouTube, first.getUrl());
    System.out.println("stream: " + si.getName() + " | " + si.getUploaderName() + " | " + si.getDuration() + "s");
    List<AudioStream> audio = si.getAudioStreams();
    System.out.println("audio streams: " + audio.size());
    if (audio.isEmpty()) throw new IllegalStateException("no audio streams");
    AudioStream best = audio.stream()
        .filter(a -> a.getFormat() == MediaFormat.M4A)
        .max(Comparator.comparingInt(AudioStream::getAverageBitrate))
        .orElse(audio.get(0));
    System.out.println("best audio: " + best.getFormat() + " | " + best.getAverageBitrate() + " kbps | mime "
        + best.getFormat().getMimeType());

    // 3. Playability check: ranged GET on the stream URL
    HttpRequest req = HttpRequest.newBuilder(URI.create(best.getContent()))
        .header("User-Agent", UA)
        .header("Range", "bytes=0-1023")
        .timeout(Duration.ofSeconds(30))
        .GET()
        .build();
    HttpResponse<byte[]> resp = client.send(req, HttpResponse.BodyHandlers.ofByteArray());
    System.out.println("ranged GET status: " + resp.statusCode() + " | bytes: " + resp.body().length);
    if (resp.statusCode() >= 400 || resp.body().length == 0) {
      throw new IllegalStateException("stream URL not playable: HTTP " + resp.statusCode());
    }

    // 4. LRCLIB lyrics check (used by the app)
    HttpRequest lrc = HttpRequest.newBuilder(URI.create(
        "https://lrclib.net/api/get?track_name=" + java.net.URLEncoder.encode(si.getName(), "UTF-8")
            + "&artist_name=" + java.net.URLEncoder.encode(si.getUploaderName(), "UTF-8")))
        .header("User-Agent", "Musico/1.0 (https://github.com/anmol/musico)")
        .timeout(Duration.ofSeconds(20))
        .GET()
        .build();
    HttpResponse<String> lrcResp = client.send(lrc, HttpResponse.BodyHandlers.ofString());
    System.out.println("lrclib status: " + lrcResp.statusCode() + " | syncedLyrics present: "
        + (lrcResp.statusCode() == 200 && lrcResp.body().contains("syncedLyrics\":\"[")));

    System.out.println("EXTRACTION_TEST_OK");
  }

  static String videoIdFromUrl(String url) {
    int i = url.indexOf("v=");
    return i >= 0 ? url.substring(i + 2).split("&")[0] : url;
  }

  static class JdkDownloader extends Downloader {
    @Override
    public Response execute(Request request) throws IOException {
      try {
      HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(request.url()))
          .header("User-Agent", UA)
          .timeout(Duration.ofSeconds(30));
      for (Map.Entry<String, List<String>> e : request.headers().entrySet()) {
        if (e.getKey().equalsIgnoreCase("User-Agent")) continue;
        for (String v : e.getValue()) b.header(e.getKey(), v);
      }
      byte[] data = request.dataToSend();
      if (data != null) {
        b.method(request.httpMethod(), HttpRequest.BodyPublishers.ofByteArray(data));
      } else {
        b.method(request.httpMethod(), HttpRequest.BodyPublishers.noBody());
      }
      HttpResponse<byte[]> resp = client.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
      if (resp.statusCode() == 429) throw new RuntimeException("reCaptcha challenge requested");
      Map<String, List<String>> headers = new LinkedHashMap<>();
      resp.headers().map().forEach(headers::put);
      return new Response(resp.statusCode(), "", headers,
          new String(resp.body(), StandardCharsets.UTF_8), request.url());
      } catch (java.net.http.HttpTimeoutException | InterruptedException e) {
        throw new IOException(e);
      }
    }
  }
}
