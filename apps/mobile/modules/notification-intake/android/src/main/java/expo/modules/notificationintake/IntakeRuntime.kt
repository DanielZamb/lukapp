package expo.modules.notificationintake

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import java.util.concurrent.Executors

internal class IntakeRuntime private constructor(val context: Context) {
  private val diagnostics = DiagnosticRepository(AndroidSnapshotStorage(context, diagnostics = true), BuildConfig.INTAKE_DIAGNOSTICS).also {
    if (!it.enabled) runCatching { it.wipe() }
  }
  val repository = IntakeRepository(AndroidSnapshotStorage(context), diagnostics)
  val executor = Executors.newSingleThreadExecutor()
  private val handler = Handler(Looper.getMainLooper())
  private val component = ComponentName(context, IntakeListenerService::class.java)
  @Volatile private var recoveryGeneration = 0L
  private var lastRequest: Long? = null
  @Volatile var rescan: (() -> Unit)? = null
  fun access(): Boolean = if (Build.VERSION.SDK_INT >= 27) {
    context.getSystemService(NotificationManager::class.java).isNotificationListenerAccessGranted(component)
  } else {
    android.provider.Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
      ?.split(':')?.any { ComponentName.unflattenFromString(it) == component } == true
  }

  @Synchronized fun cancelRecovery() { recoveryGeneration++; handler.removeCallbacksAndMessages(null) }
  fun recover(expected: String, manual: Boolean = false) {
    repository.check(expected)
    cancelRecovery()
    val generation = recoveryGeneration
    fun valid(): Boolean {
      if (generation != recoveryGeneration) return false
      val status = repository.status(access())
      return status.text("epoch") == expected && status.getBoolean("enabled") && status.text("storageState") == "healthy" &&
        status.text("access") == "granted" && status.text("connection") != "connected"
    }
    fun schedule(delay: Long, action: () -> Unit) { handler.postDelayed({ if (valid()) action() }, delay) }
    val status = repository.status(access())
    if (!status.getBoolean("enabled") || status.text("storageState") != "healthy" || status.text("access") != "granted") return
    if (status.text("connection") == "connected") { rescan?.invoke(); return }
    schedule(if (manual) 0 else 1_500) {
      val now = SystemClock.elapsedRealtime()
      if (!manual && lastRequest?.let { now - it < 30_000 } == true) return@schedule
      lastRequest = now
      executor.execute { runCatching { repository.recoveryGap(expected) } }
      runCatching { NotificationListenerService.requestRebind(component) }
      schedule(2_500) {
        if (Build.VERSION.SDK_INT >= 34) {
          runCatching { NotificationListenerService.requestUnbind(component) }
          schedule(350) { runCatching { NotificationListenerService.requestRebind(component) } }
        }
      }
    }
  }
  companion object {
    @Volatile private var instance: IntakeRuntime? = null
    fun get(context: Context): IntakeRuntime = instance ?: synchronized(this) {
      instance ?: IntakeRuntime(context.applicationContext).also { instance = it }
    }
  }
}
