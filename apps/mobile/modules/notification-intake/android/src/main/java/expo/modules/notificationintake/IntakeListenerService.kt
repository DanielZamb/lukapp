package expo.modules.notificationintake

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class IntakeListenerService : NotificationListenerService() {
  private val runtime by lazy { IntakeRuntime.get(applicationContext) }
  override fun onListenerConnected() {
    super.onListenerConnected()
    runtime.rescan = { scan() }
    runtime.executor.execute { runCatching { runtime.repository.connected(true) } }
    scan()
  }
  private fun scan() {
    val active = runCatching { activeNotifications.orEmpty() }.getOrNull() ?: return
    active.forEach { capture(it) }
  }
  override fun onNotificationPosted(sbn: StatusBarNotification?) { sbn?.let { capture(it) } }
  private fun capture(sbn: StatusBarNotification) {
    val permit = runCatching { runtime.repository.permit(sbn.packageName) }.getOrNull() ?: return
    val sourceLabel = runCatching {
      packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName, 0)).toString()
    }.getOrNull()
    val id = captureId(sbn.packageName, sbn.key, sbn.postTime)
    val time = sbn.postTime
    runtime.executor.execute { runCatching {
      val arrival = runtime.repository.recordArrival(permit, id, time) { ArrivalSnapshot.collect(sbn) }
      val extras = sbn.notification.extras
      fun text(key: String) = runCatching { extras.getCharSequence(key)?.toString() }.getOrNull()
      val fields = NotificationFields(
        title = text(Notification.EXTRA_TITLE), bigText = text(Notification.EXTRA_BIG_TEXT), text = text(Notification.EXTRA_TEXT),
        textLines = runCatching { extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.map { it.toString() }.orEmpty() }.getOrDefault(emptyList()),
        subText = text(Notification.EXTRA_SUB_TEXT),
      )
      val result = GenericNotificationParser.parseFields(fields)
      val safe = when (result) {
        is ParseResult.Accepted -> result.copy(amount = result.amount.copy(description =
          GenericNotificationParser.descriptionForSource(result.amount.description, permit.packageName, sourceLabel)))
        is ParseResult.Discard -> result
      }
      runtime.repository.diagnosticOutcome(permit, arrival, safe)
      runtime.repository.capture(permit, id, time, safe, NotificationText.retained(fields))
    } }
  }
  override fun onListenerDisconnected() {
    runtime.rescan = null
    runtime.executor.execute { runCatching { runtime.repository.connected(false) } }
    super.onListenerDisconnected()
  }
  override fun onDestroy() {
    runtime.rescan = null
    runtime.executor.execute { runCatching { runtime.repository.connected(false) } }
    super.onDestroy()
  }
}
