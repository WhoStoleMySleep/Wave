package com.whostolemysleep.wave

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Android WebView ignores `navigator.mediaSession`, so the system media
 * controls, the lock screen and headset buttons only see playback through a
 * native session that the web player keeps in sync over [Bridge].
 */
object WaveMedia {
  const val NOTIFICATION_ID = 1
  private const val CHANNEL_ID = "playback"
  private const val ACTION_LIKE = "like"

  private val main = Handler(Looper.getMainLooper())
  private val artworkLoader = Executors.newSingleThreadExecutor()

  private var session: MediaSessionCompat? = null
  private var webView = WeakReference<WebView>(null)
  private var appContext: Context? = null

  private var title = ""
  private var artist = ""
  private var album = ""
  private var durationMs = 0L
  private var positionMs = 0L
  private var rate = 1f
  private var liked = false
  var isPlaying = false
    private set
  var hasTrack = false
    private set

  private var artworkUrl: String? = null
  private var artwork: Bitmap? = null

  fun attach(activity: Activity, view: WebView) {
    appContext = activity.applicationContext
    webView = WeakReference(view)
    if (session == null) {
      session = MediaSessionCompat(activity.applicationContext, "Wave").apply {
        setCallback(SessionCallback)
        setSessionActivity(openAppIntent(activity.applicationContext))
      }
    }
    view.addJavascriptInterface(Bridge(activity), "WaveAndroid")
  }

  /** The notification the playback service shows; null once there is nothing to show. */
  fun buildNotification(context: Context): android.app.Notification? {
    val token = session?.sessionToken ?: return null
    if (!hasTrack) return null
    ensureChannel(context)

    val playPause = if (isPlaying) {
      NotificationCompat.Action(android.R.drawable.ic_media_pause, "Pause", serviceIntent(context, MediaPlaybackService.ACTION_TOGGLE))
    } else {
      NotificationCompat.Action(android.R.drawable.ic_media_play, "Play", serviceIntent(context, MediaPlaybackService.ACTION_TOGGLE))
    }

    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher_foreground)
      .setContentTitle(title)
      .setContentText(artist)
      .setLargeIcon(artwork)
      .setContentIntent(openAppIntent(context))
      .setDeleteIntent(serviceIntent(context, MediaPlaybackService.ACTION_DISMISS))
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setOngoing(isPlaying)
      .addAction(android.R.drawable.ic_media_previous, "Previous", serviceIntent(context, MediaPlaybackService.ACTION_PREVIOUS))
      .addAction(playPause)
      .addAction(android.R.drawable.ic_media_next, "Next", serviceIntent(context, MediaPlaybackService.ACTION_NEXT))
      .addAction(likeIcon(), likeLabel(), serviceIntent(context, MediaPlaybackService.ACTION_LIKE))
      .setStyle(
        androidx.media.app.NotificationCompat.MediaStyle()
          .setMediaSession(token)
          .setShowActionsInCompactView(0, 1, 2)
      )
      .build()
  }

  /** Forwards a transport command to the web player, which owns playback. */
  fun dispatch(action: String, position: Long = 0) {
    main.post {
      webView.get()?.evaluateJavascript(
        "window.__waveMediaAction && window.__waveMediaAction(${JSONObject.quote(action)}, $position)",
        null,
      )
    }
  }

  private fun update(json: JSONObject) {
    val context = appContext ?: return
    val session = session ?: return

    title = json.optString("title")
    artist = json.optString("artist")
    album = json.optString("album")
    durationMs = json.optLong("durationMs")
    positionMs = json.optLong("positionMs")
    rate = json.optDouble("rate", 1.0).toFloat()
    isPlaying = json.optBoolean("playing")
    liked = json.optBoolean("liked")
    hasTrack = true

    val url = json.optString("artworkUrl").takeIf { it.isNotEmpty() }
    if (url != artworkUrl) {
      artworkUrl = url
      artwork = null
      if (url != null) loadArtwork(url)
    }

    session.isActive = true
    session.setMetadata(metadata())
    session.setPlaybackState(playbackState())
    syncService(context)
  }

  private fun clear() {
    val context = appContext ?: return
    hasTrack = false
    isPlaying = false
    session?.setPlaybackState(
      PlaybackStateCompat.Builder().setState(PlaybackStateCompat.STATE_NONE, 0, 0f).build()
    )
    session?.isActive = false
    context.stopService(Intent(context, MediaPlaybackService::class.java))
  }

  private fun syncService(context: Context) {
    val service = MediaPlaybackService.instance
    if (service != null) {
      service.refresh()
    } else if (isPlaying) {
      // the service has to start while the app is visible, which is when playback starts
      ContextCompat.startForegroundService(context, Intent(context, MediaPlaybackService::class.java))
    }
  }

  private fun metadata(): MediaMetadataCompat =
    MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
      .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
      .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork)
      .build()

  private fun playbackState(): PlaybackStateCompat =
    PlaybackStateCompat.Builder()
      .setActions(
        PlaybackStateCompat.ACTION_PLAY or
          PlaybackStateCompat.ACTION_PAUSE or
          PlaybackStateCompat.ACTION_PLAY_PAUSE or
          PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
          PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
          PlaybackStateCompat.ACTION_SEEK_TO
      )
      .setState(
        if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
        positionMs,
        if (isPlaying) rate else 0f,
      )
      // Android 13+ builds the media controls from the session, not the notification actions
      .addCustomAction(PlaybackStateCompat.CustomAction.Builder(ACTION_LIKE, likeLabel(), likeIcon()).build())
      .build()

  private fun likeIcon() = if (liked) R.drawable.ic_heart_filled else R.drawable.ic_heart

  private fun likeLabel() = if (liked) "Unlike" else "Like"

  private fun loadArtwork(url: String) {
    artworkLoader.execute {
      val bitmap = runCatching {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        connection.inputStream.use { BitmapFactory.decodeStream(it) }
      }.getOrNull() ?: return@execute
      main.post {
        if (url != artworkUrl) return@post
        artwork = bitmap
        session?.setMetadata(metadata())
        MediaPlaybackService.instance?.refresh()
      }
    }
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW).apply {
        setShowBadge(false)
      }
    )
  }

  private fun openAppIntent(context: Context): PendingIntent =
    PendingIntent.getActivity(
      context,
      0,
      Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  private fun serviceIntent(context: Context, action: String): PendingIntent =
    PendingIntent.getService(
      context,
      action.hashCode(),
      Intent(context, MediaPlaybackService::class.java).setAction(action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  private object SessionCallback : MediaSessionCompat.Callback() {
    override fun onPlay() = dispatch("play")
    override fun onPause() = dispatch("pause")
    override fun onSkipToNext() = dispatch("next")
    override fun onSkipToPrevious() = dispatch("previous")
    override fun onSeekTo(pos: Long) = dispatch("seek", pos)
    override fun onStop() = dispatch("pause")
    override fun onCustomAction(action: String?, extras: android.os.Bundle?) {
      if (action == ACTION_LIKE) dispatch(ACTION_LIKE)
    }
  }

  /** Exposed to the page as `window.WaveAndroid`; called off the main thread. */
  private class Bridge(activity: Activity) {
    private val activity = WeakReference(activity)

    @JavascriptInterface
    fun updateMedia(json: String) {
      val parsed = runCatching { JSONObject(json) }.getOrNull() ?: return
      main.post { update(parsed) }
    }

    @JavascriptInterface
    fun clearMedia() {
      main.post { clear() }
    }

    /** Leaves the app running behind the launcher, the way back works in other players. */
    @JavascriptInterface
    fun moveToBack() {
      main.post { activity.get()?.moveTaskToBack(true) }
    }
  }
}
