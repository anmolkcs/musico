package expo.modules.ytcore

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request as OkRequest
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import org.schabi.newpipe.extractor.InfoItem
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request as NpRequest
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.MediaFormat
import org.schabi.newpipe.extractor.channel.ChannelInfoItem
import org.schabi.newpipe.extractor.playlist.PlaylistInfoItem
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import java.util.concurrent.TimeUnit

class YtCoreModule : Module() {
  companion object {
    private const val USER_AGENT =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0"
    private val AUDIO_FORMAT_PREFERENCE = listOf(MediaFormat.M4A, MediaFormat.WEBMA_OPUS, MediaFormat.WEBMA)
  }

  private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  private val downloader = object : Downloader() {
    private val client = OkHttpClient.Builder()
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)
      .build()

    override fun execute(request: NpRequest): Response {
      val builder = OkRequest.Builder()
        .url(request.url())
        .header("User-Agent", USER_AGENT)

      for ((name, values) in request.headers()) {
        if (name.equals("User-Agent", ignoreCase = true)) continue
        for (value in values) builder.header(name, value)
      }

      val data = request.dataToSend()
      if (data != null) {
        val contentType = request.headers()["Content-Type"]?.firstOrNull()?.toMediaTypeOrNull()
        builder.method(request.httpMethod(), data.toRequestBody(contentType))
      } else {
        when (request.httpMethod().uppercase()) {
          "POST", "PUT", "PATCH", "DELETE" ->
            builder.method(request.httpMethod(), ByteArray(0).toRequestBody(null))
          else -> builder.get()
        }
      }

      client.newCall(builder.build()).execute().use { resp ->
        val body = resp.body?.string() ?: ""
        val headers = LinkedHashMap<String, List<String>>()
        for ((name, value) in resp.headers) {
          headers[name] = (headers[name] ?: emptyList()) + value
        }
        if (resp.code == 429) {
          throw ReCaptchaException("reCaptcha Challenge requested", request.url())
        }
        return Response(resp.code, resp.message, headers, body, request.url())
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("YtCore")

    OnCreate {
      NewPipe.init(downloader, Localization("en", "US"), ContentCountry("US"))
    }

    AsyncFunction("search") { query: String, filter: String, promise: Promise ->
      moduleScope.launch {
        try {
          val factory = ServiceList.YouTube.getSearchQHFactory()
          val contentFilters = when (filter) {
            "videos" -> listOf(YoutubeSearchQueryHandlerFactory.MUSIC_VIDEOS)
            "albums" -> listOf(YoutubeSearchQueryHandlerFactory.MUSIC_ALBUMS)
            "artists" -> listOf(YoutubeSearchQueryHandlerFactory.MUSIC_ARTISTS)
            "playlists" -> listOf(YoutubeSearchQueryHandlerFactory.MUSIC_PLAYLISTS)
            else -> listOf(YoutubeSearchQueryHandlerFactory.MUSIC_SONGS)
          }
          val handler = factory.fromQuery(query, contentFilters, "")
          val info = SearchInfo.getInfo(ServiceList.YouTube, handler)
          val items = info.relatedItems.map { itemToMap(it) }
          promise.resolve(
            mapOf(
              "query" to query,
              "filter" to filter,
              "items" to items
            )
          )
        } catch (e: Exception) {
          promise.reject("SEARCH_ERROR", e.message ?: "Search failed", e)
        }
      }
    }

    AsyncFunction("getStream") { videoId: String, promise: Promise ->
      moduleScope.launch {
        try {
          val url = if (videoId.startsWith("http")) videoId else "https://www.youtube.com/watch?v=$videoId"
          val info = StreamInfo.getInfo(ServiceList.YouTube, url)
          val best = pickBestAudio(info.audioStreams)
          promise.resolve(
            mapOf(
              "videoId" to info.id,
              "title" to info.name,
              "artist" to cleanArtist(info.uploaderName ?: ""),
              "duration" to info.duration,
              "thumbnail" to (info.thumbnails.lastOrNull()?.url ?: ""),
              "streamUrl" to (best?.content ?: ""),
              "format" to (best?.format?.suffix ?: ""),
              "mimeType" to (best?.format?.mimeType ?: ""),
              "bitrate" to (best?.averageBitrate ?: 0)
            )
          )
        } catch (e: Exception) {
          promise.reject("STREAM_ERROR", e.message ?: "Failed to resolve stream", e)
        }
      }
    }
  }

  private fun pickBestAudio(streams: List<AudioStream>): AudioStream? {
    for (format in AUDIO_FORMAT_PREFERENCE) {
      val candidates = streams.filter { it.format == format && it.content.isNotBlank() }
      if (candidates.isNotEmpty()) {
        return candidates.maxByOrNull { it.averageBitrate }
      }
    }
    return streams.filter { it.content.isNotBlank() }.maxByOrNull { it.averageBitrate }
  }

  private fun cleanArtist(name: String): String =
    if (name.endsWith(" - Topic")) name.removeSuffix(" - Topic") else name

  private fun videoIdFromUrl(url: String): String {
    return try {
      val uri = android.net.Uri.parse(url)
      uri.getQueryParameter("v") ?: uri.lastPathSegment ?: url
    } catch (e: Exception) {
      url
    }
  }

  private fun itemToMap(item: InfoItem): Map<String, Any?> {
    val map = LinkedHashMap<String, Any?>()
    map["id"] = if (item is StreamInfoItem) videoIdFromUrl(item.url) else item.url
    map["url"] = item.url
    map["title"] = item.name
    map["thumbnail"] = item.thumbnails.lastOrNull()?.url ?: ""
    when (item) {
      is StreamInfoItem -> {
        map["type"] = "song"
        map["artist"] = cleanArtist(item.uploaderName ?: "")
        map["duration"] = item.duration
      }
      is ChannelInfoItem -> {
        map["type"] = "artist"
        map["artist"] = item.name
        map["duration"] = -1L
      }
      is PlaylistInfoItem -> {
        map["type"] = "album"
        map["artist"] = cleanArtist(item.uploaderName ?: "")
        map["duration"] = -1L
      }
      else -> {
        map["type"] = "song"
        map["artist"] = ""
        map["duration"] = -1L
      }
    }
    return map
  }
}
