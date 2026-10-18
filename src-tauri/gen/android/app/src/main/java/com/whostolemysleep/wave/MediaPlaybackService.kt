package com.whostolemysleep.wave

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat

/**
 * Keeps the process in the foreground while music plays, so Android does not
 * freeze the webview that runs the player once the app leaves the screen.
 */
class MediaPlaybackService : Service() {
  companion object {
    const val ACTION_TOGGLE = "com.whostolemysleep.wave.TOGGLE"
    const val ACTION_NEXT = "com.whostolemysleep.wave.NEXT"
    const val ACTION_PREVIOUS = "com.whostolemysleep.wave.PREVIOUS"
    const val ACTION_DISMISS = "com.whostolemysleep.wave.DISMISS"
    const val ACTION_LIKE = "com.whostolemysleep.wave.LIKE"

    var instance: MediaPlaybackService? = null
      private set
  }

  private var inForeground = false

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_TOGGLE -> WaveMedia.dispatch(if (WaveMedia.isPlaying) "pause" else "play")
      ACTION_NEXT -> WaveMedia.dispatch("next")
      ACTION_PREVIOUS -> WaveMedia.dispatch("previous")
      ACTION_LIKE -> WaveMedia.dispatch("like")
      ACTION_DISMISS -> if (!WaveMedia.isPlaying) {
        stopSelf()
        return START_NOT_STICKY
      }
    }
    // a start through startForegroundService must reach startForeground in time even if paused meanwhile
    refresh(mustEnterForeground = intent?.action == null && !inForeground)
    return START_NOT_STICKY
  }

  /** Re-posts the notification and holds the foreground only while playing. */
  fun refresh(mustEnterForeground: Boolean = false) {
    val notification = WaveMedia.buildNotification(this)
    if (notification == null) {
      stopSelf()
      return
    }
    if (WaveMedia.isPlaying || mustEnterForeground) {
      try {
        ServiceCompat.startForeground(
          this,
          WaveMedia.NOTIFICATION_ID,
          notification,
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0,
        )
        inForeground = true
        if (WaveMedia.isPlaying) return
      } catch (_: Exception) {
        // resuming from the background can be refused; the plain notification below still updates
      }
    }
    if (!WaveMedia.isPlaying && inForeground) {
      // paused: the notification stays but can be swiped away
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
      inForeground = false
    }
    runCatching { NotificationManagerCompat.from(this).notify(WaveMedia.NOTIFICATION_ID, notification) }
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!WaveMedia.isPlaying) stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    instance = null
    NotificationManagerCompat.from(this).cancel(WaveMedia.NOTIFICATION_ID)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
