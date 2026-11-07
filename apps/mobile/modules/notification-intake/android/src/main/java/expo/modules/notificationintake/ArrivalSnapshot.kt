package expo.modules.notificationintake

import android.app.Notification
import android.app.Person
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.service.notification.StatusBarNotification
import android.util.SparseArray
import org.json.JSONObject

internal object ArrivalSnapshot {
  private fun readable(read: () -> Any?): Any? = try { read() } catch (_: Exception) { mapOf("access" to "inaccessible", "reason" to "field_access_failed") }
  @Suppress("DEPRECATION")
  private fun fields(value: Any): Map<String, Any?>? = when {
    value is Bundle -> {
      val keys = value.keySet().toList()
      buildMap {
        keys.take(256).forEach { key -> put(key, readable { value.get(key) }) }
        if (keys.size > 256) put("__diagnostic_omitted_keys", mapOf("status" to "truncated", "originalEntries" to keys.size))
      }
    }
    Build.VERSION.SDK_INT >= 28 && value is Person -> mapOf("name" to value.name, "key" to value.key, "uri" to value.uri,
      "isBot" to value.isBot, "isImportant" to value.isImportant, "icon" to value.icon)
    value is Uri -> mapOf("uri" to value.toString())
    value is SparseArray<*> -> (0 until minOf(value.size(), 256)).associate { value.keyAt(it).toString() to readable { value.valueAt(it) } } +
      mapOf("__diagnostic_original_entries" to value.size())
    else -> null
  }
  private fun messages(notification: Notification): Any? = readable {
    val raw = notification.extras.getParcelableArray("android.messages") ?: return@readable emptyList<Any>()
    Notification.MessagingStyle.Message.getMessagesFromBundleArray(raw).map {
      mapOf("text" to it.text, "timestamp" to it.timestamp, "sender" to it.sender,
        "senderPerson" to if (Build.VERSION.SDK_INT >= 28) it.senderPerson else null,
        "dataMimeType" to it.dataMimeType, "dataUri" to it.dataUri, "extras" to it.extras)
    }
  }
  private fun notification(value: Notification): Map<String, Any?> = mapOf(
    "when" to value.`when`, "flags" to value.flags, "category" to value.category, "number" to value.number,
    "visibility" to value.visibility, "priority" to value.priority, "color" to value.color, "tickerText" to value.tickerText,
    "channelId" to if (Build.VERSION.SDK_INT >= 26) value.channelId else null,
    "group" to value.group, "sortKey" to value.sortKey,
    "timeoutAfter" to if (Build.VERSION.SDK_INT >= 26) value.timeoutAfter else null,
    "shortcutId" to if (Build.VERSION.SDK_INT >= 26) value.shortcutId else null,
    "badgeIconType" to if (Build.VERSION.SDK_INT >= 26) value.badgeIconType else null,
    "groupAlertBehavior" to if (Build.VERSION.SDK_INT >= 26) value.groupAlertBehavior else null,
    "smallIcon" to value.smallIcon, "largeIcon" to value.getLargeIcon(), "sound" to value.sound, "vibrate" to value.vibrate,
    "audioAttributes" to value.audioAttributes, "contentIntent" to value.contentIntent, "deleteIntent" to value.deleteIntent,
    "fullScreenIntent" to value.fullScreenIntent, "contentView" to value.contentView, "bigContentView" to value.bigContentView,
    "headsUpContentView" to value.headsUpContentView, "publicVersion" to value.publicVersion,
    "bubbleMetadata" to if (Build.VERSION.SDK_INT >= 29) value.bubbleMetadata else null,
    "actions" to value.actions?.map { action -> mapOf("title" to action.title, "extras" to action.extras,
      "actionIntent" to action.actionIntent, "remoteInputs" to action.remoteInputs,
      "allowGeneratedReplies" to action.allowGeneratedReplies,
      "semanticAction" to if (Build.VERSION.SDK_INT >= 28) action.semanticAction else null,
      "isContextual" to if (Build.VERSION.SDK_INT >= 29) action.isContextual else null,
      "isAuthenticationRequired" to if (Build.VERSION.SDK_INT >= 31) action.isAuthenticationRequired else null) })
  fun collect(sbn: StatusBarNotification): JSONObject {
    val value = sbn.notification
    val extras = value.extras
    val original = listOf("android.title", "android.text", "android.bigText", "android.textLines", "android.subText").associateWith { key -> readable { extras.get(key) } }
    return DiagnosticValues(::fields).encode(mapOf(
      "originalTextFields" to original,
      "extras" to extras,
      "messages" to messages(value),
      "notification" to notification(value),
      "statusBarNotification" to mapOf("packageName" to sbn.packageName, "key" to sbn.key, "id" to sbn.id, "tag" to sbn.tag,
        "postTime" to sbn.postTime, "uid" to sbn.uid, "userIdentifier" to mapOf("status" to "unavailable", "reason" to "not_exposed_by_public_sdk"), "groupKey" to sbn.groupKey,
        "isGroup" to sbn.isGroup, "isClearable" to sbn.isClearable, "isOngoing" to sbn.isOngoing),
      "coverage" to "Accessible delivered fields only. Unsupported capabilities, non-data objects and budget truncation are marked per field. CharSequence values retain plain text, not spans."
    ))
  }
}
