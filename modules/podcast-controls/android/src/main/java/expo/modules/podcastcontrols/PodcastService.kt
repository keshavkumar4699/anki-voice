package expo.modules.podcastcontrols

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.view.KeyEvent

/**
 * Foreground media service for a podcast session.
 *
 * Android delivers headphone/Bluetooth media buttons to the MediaSession of the
 * app that most recently played audio, so while a session runs we stream
 * silence through an AudioTrack. The spoken questions come from the system TTS
 * engine (expo-speech); this service only owns the session, the notification,
 * audio focus and a wake lock.
 */
class PodcastService : Service() {
  companion object {
    const val ACTION_START = "podcastcontrols.START"
    const val ACTION_PRESS = "podcastcontrols.PRESS"
    const val ACTION_NEXT = "podcastcontrols.NEXT"
    const val ACTION_PREVIOUS = "podcastcontrols.PREVIOUS"
    const val ACTION_STOP = "podcastcontrols.STOP"

    private const val CHANNEL_ID = "podcast_session"
    private const val NOTIFICATION_ID = 4711
    private const val SAMPLE_RATE = 16000

    @Volatile
    var instance: PodcastService? = null
      private set

    // Latest "now playing" text. Kept here because JS may update it before the
    // service has been created by startForegroundService().
    @Volatile var title = ""
    @Volatile var subtitle = ""
  }

  private lateinit var session: MediaSession
  private lateinit var audioManager: AudioManager
  private var focusRequest: AudioFocusRequest? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var silence: Thread? = null
  @Volatile private var playingSilence = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    createChannel()
    session = MediaSession(this, "AnkiVoicePodcast").apply {
      setCallback(sessionCallback)
      setPlaybackState(
        PlaybackState.Builder()
          .setActions(
            PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
              PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_STOP
          )
          // Always report PLAYING so every headphone press arrives as the same toggle.
          .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
          .build()
      )
      isActive = true
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        goForeground()
        acquireWakeLock()
        requestFocus()
        startSilence()
        updateMetadata()
      }
      ACTION_PRESS -> PodcastBus.remote("press")
      ACTION_NEXT -> PodcastBus.remote("next")
      ACTION_PREVIOUS -> PodcastBus.remote("previous")
      ACTION_STOP -> PodcastBus.remote("stop")
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    teardown()
    session.release()
    instance = null
    super.onDestroy()
  }

  fun refreshNowPlaying() {
    updateMetadata()
    getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
  }

  fun shutdown() {
    teardown()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private val sessionCallback = object : MediaSession.Callback() {
    // Handle raw key events ourselves: the default implementation delays a
    // single headset-hook press to detect double presses, which would skew
    // reaction times. Double presses are detected in JS instead.
    override fun onMediaButtonEvent(mediaButtonIntent: Intent): Boolean {
      val event: KeyEvent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        mediaButtonIntent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
      } else {
        @Suppress("DEPRECATION")
        mediaButtonIntent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
      } ?: return super.onMediaButtonEvent(mediaButtonIntent)

      val action = when (event.keyCode) {
        KeyEvent.KEYCODE_HEADSETHOOK, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
        KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> "press"
        KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "next"
        KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_MEDIA_REWIND -> "previous"
        KeyEvent.KEYCODE_MEDIA_STOP -> "stop"
        else -> return super.onMediaButtonEvent(mediaButtonIntent)
      }
      if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
        PodcastBus.remote(action, SystemClock.uptimeMillis() - event.eventTime)
      }
      return true
    }

    // Lock screen / notification / Bluetooth transport controls.
    override fun onPlay() = PodcastBus.remote("press")
    override fun onPause() = PodcastBus.remote("press")
    override fun onSkipToNext() = PodcastBus.remote("next")
    override fun onSkipToPrevious() = PodcastBus.remote("previous")
    override fun onStop() = PodcastBus.remote("stop")
  }

  private fun goForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, "Podcast session", NotificationManager.IMPORTANCE_LOW)
    channel.setShowBadge(false)
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun actionIntent(action: String, requestCode: Int): PendingIntent =
    PendingIntent.getService(
      this,
      requestCode,
      Intent(this, PodcastService::class.java).setAction(action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

  @Suppress("DEPRECATION")
  private fun buildNotification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    return builder
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(title)
      .setContentText(subtitle)
      .setContentIntent(launch)
      .setOngoing(true)
      .setShowWhen(false)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .addAction(Notification.Action.Builder(android.R.drawable.ic_media_previous, "Repeat", actionIntent(ACTION_PREVIOUS, 1)).build())
      .addAction(Notification.Action.Builder(android.R.drawable.ic_media_pause, "I know", actionIntent(ACTION_PRESS, 2)).build())
      .addAction(Notification.Action.Builder(android.R.drawable.ic_media_next, "Don't know", actionIntent(ACTION_NEXT, 3)).build())
      .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", actionIntent(ACTION_STOP, 4)).build())
      .setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
      .build()
  }

  private fun updateMetadata() {
    session.setMetadata(
      MediaMetadata.Builder()
        .putString(MediaMetadata.METADATA_KEY_TITLE, title)
        .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
        .putString(MediaMetadata.METADATA_KEY_ALBUM, "Anki Voice")
        .build()
    )
  }

  private val attributes: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> PodcastBus.remote("interrupt")
      AudioManager.AUDIOFOCUS_GAIN -> PodcastBus.remote("focusGain")
      // LOSS_TRANSIENT_CAN_DUCK (e.g. a navigation prompt): keep going.
    }
  }

  private fun requestFocus() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(attributes)
        .setOnAudioFocusChangeListener(focusListener)
        .build()
      focusRequest = req
      audioManager.requestAudioFocus(req)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }
  }

  private fun abandonFocus() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let(audioManager::abandonAudioFocusRequest)
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      audioManager.abandonAudioFocus(focusListener)
    }
  }

  private fun startSilence() {
    if (playingSilence) return
    playingSilence = true
    silence = Thread({
      val bufSize = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
      val track = AudioTrack.Builder()
        .setAudioAttributes(attributes)
        .setAudioFormat(
          AudioFormat.Builder()
            .setSampleRate(SAMPLE_RATE)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        )
        .setBufferSizeInBytes(bufSize)
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()
      val zeros = ShortArray(bufSize / 2)
      try {
        track.play()
        while (playingSilence) track.write(zeros, 0, zeros.size) // blocking write paces the loop
      } finally {
        track.stop()
        track.release()
      }
    }, "podcast-silence").apply { start() }
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AnkiVoice:podcast").apply {
      setReferenceCounted(false)
      acquire(4 * 60 * 60 * 1000L) // safety cap: 4 hours
    }
  }

  private fun teardown() {
    playingSilence = false
    silence?.join(500)
    silence = null
    abandonFocus()
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
  }
}
