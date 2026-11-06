package expo.modules.notificationintake

import org.json.JSONArray
import org.json.JSONObject

internal class DiagnosticValues(private val structured: (Any) -> Map<String, Any?>? = { null }) {
  private var nodes = 0
  private var bytes = 384 * 1024
  fun encode(value: Any?, depth: Int = 0): JSONObject {
    val type = value?.javaClass?.name ?: "null"
    if (++nodes > 1024 || depth > 8 || bytes <= 1024) return obj("type" to type, "status" to "truncated", "reason" to "snapshot_budget")
    val result = try {
      when (value) {
        null -> obj("type" to type, "status" to "complete", "value" to null)
        is CharSequence, is Char -> {
          val text = value.toString()
          val limit = minOf(bytes / 6, text.length)
          val retained = text.take(limit)
          obj("type" to type, "status" to if (retained.length == text.length) "complete" else "truncated", "value" to retained,
            "originalCharacters" to text.length, "representation" to "plain_text")
        }
        is Number -> if (value.toDouble().isFinite()) obj("type" to type, "status" to "complete", "value" to value)
          else obj("type" to type, "status" to "unsupported", "reason" to "nonfinite_number")
        is Boolean -> obj("type" to type, "status" to "complete", "value" to value)
        is Map<*, *> -> {
          val entries = value.entries.take(256).map { obj("name" to encode(it.key, depth + 1), "value" to encode(it.value, depth + 1)) }
          obj("type" to type, "status" to if (value.size > entries.size) "truncated" else "complete", "entries" to JSONArray(entries), "originalEntries" to value.size)
        }
        is Iterable<*> -> {
          val entries = value.take(257)
          obj("type" to type, "status" to if (entries.size > 256) "truncated" else "complete", "values" to JSONArray(entries.take(256).map { encode(it, depth + 1) }))
        }
        else -> if (value.javaClass.isArray) {
          val size = java.lang.reflect.Array.getLength(value)
          obj("type" to type, "status" to if (size > 256) "truncated" else "complete", "originalEntries" to size,
            "values" to JSONArray((0 until minOf(size, 256)).map { encode(java.lang.reflect.Array.get(value, it), depth + 1) }))
        } else {
          val fields = structured(value)
          if (fields == null) obj("type" to type, "status" to "unsupported", "reason" to "non_data_object_or_capability")
          else obj("type" to type, "status" to "complete", "fields" to encode(fields, depth + 1))
        }
      }
    } catch (_: Exception) { obj("type" to type, "status" to "inaccessible", "reason" to "field_access_failed") }
    bytes -= when {
      result.has("entries") || result.has("values") || result.has("fields") -> 256
      else -> result.toString().toByteArray(Charsets.UTF_8).size
    }
    return result
  }
}
