package com.whostolemysleep.wave

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi

/**
 * Tells the page when another app plays sound, so the music can step back for
 * it instead of stopping.
 *
 * Android hides whose players are whose, so Wave holds audio focus while it
 * plays: another app taking focus is the start of its sound. The end is the
 * count of active media players falling back to what it was while Wave played
 * alone, or focus coming back after a call or an assistant.
 */
@RequiresApi(Build.VERSION_CODES.O)
object OtherAudio {
  /** Pauses between videos or tracks of another app keep the music down. */
  private const val STOP_HOLD_MS = 2000L
  private val MEDIA_USAGES = setOf(
    AudioAttributes.USAGE_MEDIA,
    AudioAttributes.USAGE_GAME,
    AudioAttributes.USAGE_UNKNOWN,
  )

  private val main = Handler(Looper.getMainLooper())
  private var manager: AudioManager? = null
  private var report: (Boolean) -> Unit = {}

  private var enabled = false
  private var playing = false
  private var holdsFocus = false
  private var heard = false
  /** Lost to a call or an assistant: Android hands focus back when it ends. */
  private var lostForAWhile = false
  /** Active media players while Wave held focus, its own ones. */
  private var ownPlayers = 0

  private val focusRequest by lazy {
    AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build()
      )
      // the music keeps playing under the other sound, the page lowers it
      .setWillPauseWhenDucked(false)
      .setOnAudioFocusChangeListener(::onFocusChange, main)
      .build()
  }

  private val stopCheck = Runnable {
    if (heard && !lostForAWhile && mediaPlayers() <= ownPlayers) {
      setHeard(false)
      sync()
    }
  }

  private val playbackCallback = object : AudioManager.AudioPlaybackCallback() {
    override fun onPlaybackConfigChanged(configs: List<AudioPlaybackConfiguration>) {
      val count = configs.count { it.audioAttributes.usage in MEDIA_USAGES }
      if (holdsFocus && !heard) ownPlayers = count
      if (!heard || lostForAWhile) return
      main.removeCallbacks(stopCheck)
      if (count <= ownPlayers) main.postDelayed(stopCheck, STOP_HOLD_MS)
    }
  }

  /** @param onChange gets `true` when another app starts sounding and `false` when it stops */
  fun attach(context: Context, onChange: (Boolean) -> Unit) {
    manager = context.getSystemService(AudioManager::class.java)
    report = onChange
  }

  fun watch(enable: Boolean) {
    val manager = manager ?: return
    if (enable == enabled) return
    enabled = enable
    if (enable) {
      manager.registerAudioPlaybackCallback(playbackCallback, main)
    } else {
      manager.unregisterAudioPlaybackCallback(playbackCallback)
      main.removeCallbacks(stopCheck)
      setHeard(false)
    }
    sync()
  }

  fun onPlaying(isPlaying: Boolean) {
    playing = isPlaying
    sync()
  }

  /** Focus is held only while it can tell anything: watching and playing. */
  private fun sync() {
    val manager = manager ?: return
    val wanted = enabled && playing
    if (wanted && !holdsFocus && !heard) {
      holdsFocus = manager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    } else if (!wanted && holdsFocus) {
      manager.abandonAudioFocusRequest(focusRequest)
      holdsFocus = false
    }
  }

  private fun onFocusChange(change: Int) {
    when (change) {
      AudioManager.AUDIOFOCUS_GAIN -> {
        holdsFocus = true
        lostForAWhile = false
        main.removeCallbacks(stopCheck)
        setHeard(false)
      }
      AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        holdsFocus = false
        lostForAWhile = change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
        if (enabled) setHeard(true)
      }
      // Android lowers the music for a notification by itself
      else -> Unit
    }
  }

  private fun mediaPlayers(): Int =
    manager?.activePlaybackConfigurations?.count { it.audioAttributes.usage in MEDIA_USAGES } ?: 0

  private fun setHeard(value: Boolean) {
    if (value == heard) return
    heard = value
    report(value)
  }
}
