package expo.modules.podcastcontrols

import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Bridges the podcast session to JS:
 *  - start/update/stop the foreground media service (keeps the app alive with the
 *    screen off and owns the MediaSession that receives headphone buttons)
 *  - "onRemote" events for button presses and audio-focus changes
 *  - "onTimer" events: native timers, because React Native pauses JS timers
 *    while the app is in the background
 *  - a short beep for the start of the think window
 */
class PodcastControlsModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private val timers = mutableMapOf<Int, Runnable>()

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("PodcastControls")

    Events("onRemote", "onTimer")

    OnCreate {
      PodcastBus.listener = { name, body -> sendEvent(name, body) }
    }

    OnDestroy {
      PodcastBus.listener = null
      handler.removeCallbacksAndMessages(null)
    }

    Function("start") { title: String, subtitle: String ->
      PodcastService.title = title
      PodcastService.subtitle = subtitle
      val intent = Intent(context, PodcastService::class.java).setAction(PodcastService.ACTION_START)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    Function("update") { title: String, subtitle: String ->
      PodcastService.title = title
      PodcastService.subtitle = subtitle
      PodcastService.instance?.refreshNowPlaying()
    }

    Function("stop") {
      clearAllTimers()
      PodcastService.instance?.shutdown()
    }

    Function("isRunning") {
      PodcastService.instance != null
    }

    Function("setTimer") { token: Int, ms: Double ->
      timers.remove(token)?.let(handler::removeCallbacks)
      val r = Runnable {
        timers.remove(token)
        sendEvent("onTimer", mapOf("token" to token))
      }
      timers[token] = r
      handler.postDelayed(r, ms.toLong())
    }

    Function("clearTimers") {
      clearAllTimers()
    }

    Function("beep") { durationMs: Int ->
      try {
        val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 70)
        tone.startTone(ToneGenerator.TONE_PROP_BEEP, durationMs)
        handler.postDelayed({ tone.release() }, durationMs + 200L)
      } catch (_: RuntimeException) {
        // ToneGenerator can fail if the audio system is busy; a missing beep is harmless.
      }
    }
  }

  private fun clearAllTimers() {
    timers.values.forEach(handler::removeCallbacks)
    timers.clear()
  }
}

/** Lets the service reach the module (same process) without holding a reference to it. */
internal object PodcastBus {
  @Volatile
  var listener: ((String, Map<String, Any?>) -> Unit)? = null

  /** ageMs = how long ago the input actually happened, so JS can correct reaction times. */
  fun remote(action: String, ageMs: Long = 0) {
    listener?.invoke("onRemote", mapOf("action" to action, "ageMs" to ageMs.toDouble()))
  }
}
