package expo.modules.notificationintake

import org.json.JSONArray
import org.json.JSONObject

internal const val DIAGNOSTIC_TTL = 86_400_000L
internal const val DIAGNOSTIC_COUNT = 32
internal const val DIAGNOSTIC_RECORD_BYTES = 524_288
internal const val DIAGNOSTIC_BYTES = 4 * MIB

internal class DiagnosticRepository(private val storage: SnapshotStorage, val enabled: Boolean, private val clock: () -> Long = System::currentTimeMillis) {
  private var failure: String? = null
  private var errors = 0L
  private fun empty() = obj("v" to 1, "ownerScope" to null, "records" to JSONArray(), "overflowCount" to 0)
  private fun load(): JSONObject {
    if (failure != null) throw IntakeFailure("DIAGNOSTICS_UNAVAILABLE")
    val raw = storage.read() ?: return empty()
    requireInput(raw.size <= DIAGNOSTIC_BYTES)
    val parser = org.json.JSONTokener(String(raw, Charsets.UTF_8))
    val state = parser.nextValue(); requireInput(state is JSONObject && parser.nextClean() == '\u0000')
    state as JSONObject
    requireInput(state.integer("v") == 1L && state.getJSONArray("records").length() <= DIAGNOSTIC_COUNT)
    state.integer("overflowCount")
    requireInput(state.isNull("ownerScope") || Regex("[A-Za-z0-9_-]{43}").matches(state.text("ownerScope")))
    val rows = state.getJSONArray("records").objects()
    requireInput(rows.map { it.text("id") }.distinct().size == rows.size)
    rows.forEach {
      token(it.text("id")); token(it.text("captureId")); token(it.text("sourceSelectionId")); packageName(it.text("packageName"))
      requireInput(it.integer("expiresAt") == it.integer("capturedAt") + DIAGNOSTIC_TTL)
      requireInput(it.toString().toByteArray(Charsets.UTF_8).size <= DIAGNOSTIC_RECORD_BYTES)
    }
    val live = rows.filter { it.integer("expiresAt") > clock() }
    if (live.size != rows.size) { state.put("records", JSONArray(live)); save(state) }
    return state
  }
  private fun save(state: JSONObject) {
    val bytes = state.toString().toByteArray(Charsets.UTF_8)
    requireInput(bytes.size <= DIAGNOSTIC_BYTES)
    storage.write(bytes)
  }
  private fun failed(error: Exception) {
    errors = minOf(SAFE_INTEGER, errors + 1)
    failure = failure ?: if (error is StorageFailure) error.state else "storage_error"
  }
  fun status(): JSONObject {
    if (!enabled) return obj("enabled" to false, "state" to "disabled", "recordCount" to 0, "byteCount" to 0, "overflowCount" to 0, "errorCount" to errors)
    val state = try { load() } catch (error: Exception) { failed(error); null }
    return obj("enabled" to true, "state" to (failure ?: "healthy"), "recordCount" to (state?.getJSONArray("records")?.length() ?: 0),
      "byteCount" to (state?.toString()?.toByteArray(Charsets.UTF_8)?.size ?: 0), "overflowCount" to (state?.integer("overflowCount") ?: 0), "errorCount" to errors)
  }
  private fun owner(state: JSONObject, scope: String) {
    requireInput(Regex("[A-Za-z0-9_-]{43}").matches(scope))
    if (!state.isNull("ownerScope") && state.text("ownerScope") != scope) throw IntakeFailure("OWNER_MISMATCH")
  }
  fun record(scope: String, captureId: String, permit: CapturePermit, notificationAt: Long, snapshot: () -> JSONObject): String? {
    if (!enabled) return null
    try {
      val state = load(); owner(state, scope)
      val rows = state.getJSONArray("records")
      rows.objects().find { it.text("captureId") == captureId }?.let { return it.text("id") }
      if (rows.length() >= DIAGNOSTIC_COUNT) { overflow(state); return null }
      val now = clock(); val id = captureId
      var payload = snapshot()
      val row = obj("id" to id, "captureId" to captureId, "sourceSelectionId" to permit.selection, "packageName" to permit.packageName,
        "notificationAt" to notificationAt, "capturedAt" to now, "expiresAt" to now + DIAGNOSTIC_TTL, "snapshot" to payload,
        "parser" to obj("outcome" to "pending", "reasons" to JSONArray()))
      if (row.toString().toByteArray(Charsets.UTF_8).size > DIAGNOSTIC_RECORD_BYTES - 4096) {
        payload = obj("type" to "Notification", "status" to "truncated", "reason" to "record_byte_cap")
        row.put("snapshot", payload)
      }
      val next = JSONObject(state.toString()).put("ownerScope", scope)
      next.getJSONArray("records").put(row)
      if (next.toString().toByteArray(Charsets.UTF_8).size > DIAGNOSTIC_BYTES - 4096) { overflow(state); return null }
      save(next); return id
    } catch (error: Exception) { failed(error); return null }
  }
  private fun overflow(state: JSONObject) {
    state.put("overflowCount", minOf(SAFE_INTEGER, state.integer("overflowCount") + 1)); save(state)
  }
  fun outcome(id: String?, result: ParseResult) {
    if (!enabled || id == null) return
    try {
      val state = load()
      val row = state.getJSONArray("records").objects().find { it.text("id") == id } ?: return
      val reasons = when (result) {
        is ParseResult.Discard -> listOf(result.reason)
        is ParseResult.Accepted -> result.reviewReasons + listOfNotNull(
          if (result.amount.amountMinorUnits == null) "amount_unresolved" else null,
          if (result.amount.direction == null) "direction_unresolved" else null,
          if (result.amount.currency == null) "currency_unresolved" else null,
          if (result.amount.description.isEmpty()) "description_unresolved" else null)
      }
      row.put("parser", obj("outcome" to if (result is ParseResult.Discard) "discarded" else if (reasons.isEmpty()) "normalized" else "needs_review", "reasons" to JSONArray(reasons)))
      save(state)
    } catch (error: Exception) { failed(error) }
  }
  fun list(scope: String): JSONObject {
    if (!enabled) throw IntakeFailure("UNSUPPORTED")
    val state = try { load() } catch (error: Exception) { failed(error); return obj("health" to status(), "records" to JSONArray()) }
    owner(state, scope)
    return obj("health" to status(), "records" to JSONArray(state.getJSONArray("records").objects().map {
      JSONObject(it.toString()).apply { remove("snapshot") }
    }))
  }
  fun read(scope: String, id: String): JSONObject? {
    if (!enabled) throw IntakeFailure("UNSUPPORTED")
    val state = load(); owner(state, scope)
    return state.getJSONArray("records").objects().find { it.text("id") == token(id) }
  }
  fun delete(scope: String, id: String) {
    if (!enabled) throw IntakeFailure("UNSUPPORTED")
    val state = load(); owner(state, scope)
    state.put("records", JSONArray(state.getJSONArray("records").objects().filter { it.text("id") != token(id) })); save(state)
  }
  fun wipe() {
    try { storage.recover(empty().toString().toByteArray(Charsets.UTF_8)); failure = null; errors = 0 }
    catch (error: Exception) { failed(error); throw IntakeFailure("DIAGNOSTICS_UNAVAILABLE") }
  }
}
