package expo.modules.notificationintake

import org.json.JSONArray
import org.json.JSONObject

internal interface SnapshotStorage {
  fun read(): ByteArray?
  fun write(bytes: ByteArray)
  fun recover(bytes: ByteArray)
}
internal class StorageFailure(val state: String) : RuntimeException(state)

internal class IntakeRepository(private val storage: SnapshotStorage, private val diagnostics: DiagnosticRepository? = null, private val clock: () -> Long = System::currentTimeMillis) {
  private val mutex = Any()
  private var initialized = false
  private var failure: String? = null
  private var recoveryEpoch: String? = null
  private var failureAt: Long? = null
  private var connection = "unknown"
  @Volatile var onChange: ((Map<String, Any?>) -> Unit)? = null

  private fun empty() = obj("schemaVersion" to 2, "native" to obj(
    "epoch" to epoch(), "enabled" to false, "changeSequence" to 0, "sources" to JSONArray(),
    "consentVersion" to "", "consentAt" to 0, "pending" to JSONArray(), "seen" to JSONArray(),
    "notices" to JSONArray(), "gap" to null, "lastConnectedAt" to null, "mutation" to null),
    "ownerScope" to null, "revision" to 0, "value" to null)

  private fun load(): JSONObject {
    if (failure != null) throw IntakeFailure("CORRUPT_STATE")
    try {
      val bytes = storage.read()
      if (bytes == null && initialized) throw StorageFailure("corrupt")
      val state = if (bytes == null) empty() else {
        val text = Charsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
          .decode(java.nio.ByteBuffer.wrap(bytes)).toString()
        val parser = org.json.JSONTokener(text)
        val value = parser.nextValue(); requireInput(value is JSONObject && parser.nextClean() == '\u0000')
        value as JSONObject
      }
      validate(state)
      val migrated = state.integer("schemaVersion") == 1L
      if (migrated) state.put("schemaVersion", 2)
      val n = native(state)
      val before = n.getJSONArray("pending").length() + n.getJSONArray("seen").length()
      prune(state)
      val expired = before != n.getJSONArray("pending").length() + n.getJSONArray("seen").length()
      if (expired) { bump(n); validate(state) }
      if (bytes == null || expired || migrated) storage.write(state.toString().toByteArray(Charsets.UTF_8))
      initialized = true
      return state
    } catch (e: Exception) {
      failClosed(if (e is StorageFailure) e.state else "corrupt")
      throw IntakeFailure("CORRUPT_STATE")
    }
  }

  private fun failClosed(state: String) {
    failure = state
    if (recoveryEpoch == null) recoveryEpoch = epoch()
    if (failureAt == null) failureAt = clock()
  }
  private fun native(s: JSONObject) = s.getJSONObject("native")
  private fun checkEpoch(s: JSONObject, expected: String) {
    requireInput(Regex("[A-Za-z0-9_-]{22}").matches(expected))
    if (native(s).text("epoch") != expected) throw IntakeFailure("EPOCH_MISMATCH")
  }
  private fun fields(value: JSONObject, vararg names: String) {
    requireInput(value.keys().asSequence().toSet() == names.toSet())
  }
  private fun validate(s: JSONObject) {
    fields(s, "schemaVersion", "native", "ownerScope", "revision", "value")
    requireInput(s.integer("schemaVersion") in 1L..2L)
    val n = native(s)
    fields(n, "epoch", "enabled", "changeSequence", "sources", "consentVersion", "consentAt", "pending", "seen", "notices", "gap", "lastConnectedAt", "mutation")
    requireInput(Regex("[A-Za-z0-9_-]{22}").matches(n.text("epoch")))
    requireInput(n.get("enabled") is Boolean)
    n.getBoolean("enabled"); n.integer("changeSequence"); n.integer("consentAt")
    requireInput(n.getJSONArray("sources").length() <= 16 && n.getJSONArray("pending").length() <= 512 &&
      n.getJSONArray("seen").length() <= 2048 && n.getJSONArray("notices").length() <= 64)
    n.getJSONArray("sources").objects().forEach {
      fields(it, "packageName", "sourceSelectionId", "since")
      packageName(it.text("packageName")); token(it.text("sourceSelectionId")); it.integer("since")
    }
    val sources = n.getJSONArray("sources").objects()
    requireInput(sources.map { it.text("packageName") }.distinct().size == sources.size && sources.map { it.text("sourceSelectionId") }.distinct().size == sources.size)
    if (!n.isNull("lastConnectedAt")) n.integer("lastConnectedAt")
    if (!n.isNull("gap")) {
      val gap = n.getJSONObject("gap"); fields(gap, "since", "reason", "rejectedCount")
      gap.integer("since"); gap.integer("rejectedCount"); requireInput(gap.text("reason") in listOf("overflow", "storage", "recovery"))
    }
    val notices = n.getJSONArray("notices").objects()
    requireInput(notices.map { it.text("id") }.distinct().size == notices.size)
    notices.forEach {
      fields(it, "id", "kind", "count", "firstAt", "lastAt"); token(it.text("id"))
      requireInput(it.text("kind") in listOf("security", "ambiguous", "no_amount", "multiple_amounts", "overflow", "conflict") && it.integer("count") > 0)
      it.integer("firstAt"); it.integer("lastAt")
    }
    if (!n.isNull("mutation")) {
      val mutation = n.getJSONObject("mutation"); fields(mutation, "id", "operation", "digest", "result")
      token(mutation.text("id")); requireInput(Regex("[A-Za-z0-9_-]{43}").matches(mutation.text("digest")))
      val result = mutation.getJSONObject("result")
      when (mutation.text("operation")) {
        "configure" -> { fields(result, "epoch", "changeSequence"); result.integer("changeSequence") }
        "wipe" -> fields(result, "epoch")
        else -> throw IntakeFailure("INVALID_INPUT")
      }
      requireInput(result.text("epoch") == n.text("epoch"))
    }
    if (n.getBoolean("enabled")) token(n.text("consentVersion"))
    val seen = n.getJSONArray("seen").objects()
    requireInput(seen.map { it.text("captureId") }.distinct().size == seen.size)
    seen.forEach {
      fields(it, "captureId", "digest", "expiresAt")
      token(it.text("captureId")); requireInput(Regex("[A-Za-z0-9_-]{43}").matches(it.text("digest"))); it.integer("expiresAt")
    }
    val pending = n.getJSONArray("pending").objects()
    requireInput(pending.map { it.text("captureId") }.distinct().size == pending.size)
    val seenExpiry = seen.associate { it.text("captureId") to it.integer("expiresAt") }
    pending.forEach { c ->
      fields(c, "captureId", "sourceSelectionId", "capturedAt", "expiresAt", "notificationAt", "direction", "amountMinorUnits", "currency", "description", "parserVersion", "consentVersion")
      token(c.text("captureId")); token(c.text("sourceSelectionId")); token(c.text("parserVersion")); token(c.text("consentVersion"))
      requireInput(c.integer("expiresAt") == c.integer("capturedAt") + RETENTION)
      c.integer("notificationAt")
      requireInput((s.integer("schemaVersion") == 2L && c.isNull("amountMinorUnits")) || c.integer("amountMinorUnits") > 0)
      requireInput((s.integer("schemaVersion") == 2L && c.isNull("direction")) || c.text("direction") in listOf("in", "out"))
      requireInput(c.isNull("currency") || c.text("currency") in listOf("COP", "USD"))
      requireInput(c.text("description").toByteArray(Charsets.UTF_8).size <= 256)
      requireInput(seenExpiry[c.text("captureId")] == c.integer("expiresAt"))
    }
    s.integer("revision")
    requireInput(s.isNull("ownerScope") || Regex("[A-Za-z0-9_-]{43}").matches(s.text("ownerScope")))
    if (!s.isNull("value")) {
      requireInput(!s.isNull("ownerScope"))
      validateDocument(s.text("value"))
    }
    if (n.toString().toByteArray(Charsets.UTF_8).size > MIB || s.toString().toByteArray(Charsets.UTF_8).size > 2 * MIB)
      throw IntakeFailure("CAPACITY_EXCEEDED")
  }
  private fun admit(s: JSONObject) {
    validate(s)
    if (native(s).toString().toByteArray(Charsets.UTF_8).size > MIB - 32_768 ||
      s.toString().toByteArray(Charsets.UTF_8).size > 2 * MIB - 32_768) throw IntakeFailure("CAPACITY_EXCEEDED")
  }
  private fun validateDocument(value: String) {
    if (value.toByteArray(Charsets.UTF_8).size > MIB) throw IntakeFailure("CAPACITY_EXCEEDED")
    val parser = org.json.JSONTokener(value)
    requireInput(parser.nextValue() is JSONObject && parser.nextClean() == '\u0000')
  }
  private fun prune(s: JSONObject) {
    val n = native(s); val now = clock()
    for (key in listOf("pending", "seen")) n.put(key, JSONArray(n.getJSONArray(key).objects().filter { it.integer("expiresAt") > now }))
  }
  private fun commit(s: JSONObject, kind: String? = null) {
    validate(s)
    try { storage.write(s.toString().toByteArray(Charsets.UTF_8)) }
    catch (e: Exception) { failClosed(if (e is StorageFailure) e.state else "corrupt"); throw IntakeFailure("CORRUPT_STATE") }
    if (kind != null) {
      val n = native(s)
      runCatching { onChange?.invoke(mapOf("epoch" to n.text("epoch"), "changeSequence" to n.integer("changeSequence"), "kind" to kind)) }
    }
  }
  private fun copy() = JSONObject(load().toString()).also { prune(it) }
  private fun bump(n: JSONObject) { n.put("changeSequence", n.integer("changeSequence") + 1) }
  private fun notice(n: JSONObject, kind: String) {
    val rows = n.getJSONArray("notices").objects().toMutableList()
    val previous = rows.find { it.text("kind") == kind }
    if (previous != null) { previous.put("count", minOf(SAFE_INTEGER, previous.integer("count") + 1)); previous.put("lastAt", clock()) }
    else if (rows.size < 64) rows.add(obj("id" to epoch(), "kind" to kind, "count" to 1, "firstAt" to clock(), "lastAt" to clock()))
    n.put("notices", JSONArray(rows))
  }
  private fun gap(n: JSONObject, reason: String) {
    val old = n.optJSONObject("gap")
    n.put("gap", obj("since" to (old?.integer("since") ?: clock()), "reason" to reason,
      "rejectedCount" to minOf(SAFE_INTEGER, (old?.integer("rejectedCount") ?: 0) + 1)))
    notice(n, if (reason == "overflow") "overflow" else "conflict")
  }

  fun status(access: Boolean): JSONObject = synchronized(mutex) {
    val s = try { load() } catch (_: IntakeFailure) { null }
    val checked = clock()
    if (s == null) return@synchronized obj("schemaVersion" to 2, "epoch" to recoveryEpoch, "enabled" to false,
      "access" to if (access) "granted" else "not_granted", "connection" to connection,
      "changeSequence" to 0, "pendingCount" to 0, "gap" to obj("since" to failureAt, "reason" to "storage", "rejectedCount" to 0),
      "lastConnectedAt" to null, "checkedAt" to checked, "notices" to JSONArray(), "storageState" to failure).put("diagnostics", diagnostics?.status() ?: JSONObject.NULL)
    val n = native(s)
    obj("schemaVersion" to 2, "epoch" to n.text("epoch"), "enabled" to n.getBoolean("enabled"),
      "access" to if (access) "granted" else "not_granted", "connection" to connection,
      "changeSequence" to n.integer("changeSequence"), "pendingCount" to n.getJSONArray("pending").objects().count { it.integer("expiresAt") > checked },
      "gap" to n.get("gap"), "lastConnectedAt" to n.get("lastConnectedAt"), "checkedAt" to checked,
      "notices" to n.getJSONArray("notices"), "storageState" to "healthy").put("diagnostics", diagnostics?.status() ?: JSONObject.NULL)
  }
  private fun retry(s: JSONObject, input: JSONObject, operation: String): JSONObject? {
    val id = input.text("mutationId")
    requireInput(Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}").matches(id))
    val last = native(s).optJSONObject("mutation") ?: return null
    if (last.text("id") != id) return null
    if (last.text("operation") != operation || last.text("digest") != digest(canonical(input).toByteArray(Charsets.UTF_8))) throw IntakeFailure("INVALID_INPUT")
    return last.getJSONObject("result")
  }
  private fun remember(s: JSONObject, input: JSONObject, operation: String, result: JSONObject) {
    native(s).put("mutation", obj("id" to input.text("mutationId"), "operation" to operation,
      "digest" to digest(canonical(input).toByteArray(Charsets.UTF_8)), "result" to result))
  }
  fun configure(input: JSONObject): JSONObject = synchronized(mutex) {
    val s = copy()
    retry(s, input, "configure")?.let { return@synchronized it }
    checkEpoch(s, input.text("expectedEpoch"))
    val consent = token(input.text("consentVersion")); val sourceArray = input.getJSONArray("sources"); requireInput(sourceArray.length() <= 16)
    val sources = sourceArray.objects()
    requireInput(sources.size <= 16 && sources.map { it.text("packageName") }.distinct().size == sources.size && sources.map { it.text("sourceSelectionId") }.distinct().size == sources.size)
    val n = native(s); val old = n.getJSONArray("sources").objects()
    n.put("sources", JSONArray(sources.map {
      val pkg = packageName(it.text("packageName")); val selection = token(it.text("sourceSelectionId"))
      obj("packageName" to pkg, "sourceSelectionId" to selection, "since" to
        (old.find { row -> row.text("packageName") == pkg && row.text("sourceSelectionId") == selection }?.integer("since") ?: clock()))
    }))
    n.put("enabled", true); n.put("consentVersion", consent); n.put("consentAt", clock()); n.put("epoch", epoch()); bump(n)
    val result = obj("epoch" to n.text("epoch"), "changeSequence" to n.integer("changeSequence"))
    remember(s, input, "configure", result); admit(s); commit(s, "control"); result
  }
  fun wipe(input: JSONObject): JSONObject = synchronized(mutex) {
    val old = try { load() } catch (_: IntakeFailure) { null }
    if (old != null) {
      retry(old, input, "wipe")?.let { return@synchronized it }
      checkEpoch(old, input.text("expectedEpoch"))
    } else {
      if (input.text("expectedEpoch") != recoveryEpoch) throw IntakeFailure("EPOCH_MISMATCH")
      retry(empty(), input, "wipe")
    }
    diagnostics?.wipe()
    val fresh = empty(); val n = native(fresh)
    val result = obj("epoch" to n.text("epoch")); remember(fresh, input, "wipe", result)
    if (old == null) {
      try { storage.recover(fresh.toString().toByteArray(Charsets.UTF_8)) }
      catch (_: Exception) { throw IntakeFailure("CORRUPT_STATE") }
      failure = null; recoveryEpoch = null; failureAt = null; initialized = true
    } else commit(fresh, "control")
    result
  }
  fun permit(pkg: String): CapturePermit? = synchronized(mutex) {
    val n = native(load())
    if (!n.getBoolean("enabled")) return@synchronized null
    val source = n.getJSONArray("sources").objects().find { it.text("packageName") == pkg } ?: return@synchronized null
    CapturePermit(n.text("epoch"), pkg, source.text("sourceSelectionId"), n.text("consentVersion"), source.integer("since"))
  }
  fun capture(permit: CapturePermit, id: String, notificationAt: Long, result: ParseResult) = synchronized(mutex) {
    val s = copy(); val n = native(s)
    if (!n.getBoolean("enabled") || n.text("epoch") != permit.epoch || n.getJSONArray("sources").objects().none {
      it.text("packageName") == permit.packageName && it.text("sourceSelectionId") == permit.selection }) return@synchronized
    val now = clock()
    if (notificationAt < permit.since || notificationAt > now || notificationAt <= now - RETENTION) return@synchronized
    if (result is ParseResult.Discard) { notice(n, result.reason); bump(n); commit(s, "notice"); return@synchronized }
    val parsed = (result as ParseResult.Accepted).amount
    val seen = n.getJSONArray("seen"); val existing = seen.objects().find { it.text("captureId") == id }
    val capturedAt = existing?.integer("expiresAt")?.minus(RETENTION) ?: now
    val row = obj("notificationAt" to notificationAt, "direction" to parsed.direction, "amountMinorUnits" to parsed.amountMinorUnits,
      "currency" to parsed.currency, "description" to parsed.description, "parserVersion" to "generic-v2",
      "captureId" to token(id), "sourceSelectionId" to permit.selection, "capturedAt" to capturedAt,
      "expiresAt" to capturedAt + RETENTION, "consentVersion" to permit.consent)
    val hash = digest(canonical(row).toByteArray(Charsets.UTF_8))
    if (existing != null) {
      val legacyHash = digest(canonical(JSONObject(row.toString()).put("parserVersion", "generic-v1")).toByteArray(Charsets.UTF_8))
      if (existing.text("digest") != hash && existing.text("digest") != legacyHash) { gap(n, "recovery"); bump(n); commit(s, "notice") }
      return@synchronized
    }
    val pending = n.getJSONArray("pending")
    if (pending.length() >= 512 || seen.length() >= 2048) { gap(n, "overflow"); bump(n); commit(s, "notice"); return@synchronized }
    pending.put(row); seen.put(obj("captureId" to id, "digest" to hash, "expiresAt" to now + RETENTION)); bump(n)
    try { admit(s); commit(s, "capture") } catch (e: IntakeFailure) {
      if (e.code != "CAPACITY_EXCEEDED") throw e
      val rejected = copy(); gap(native(rejected), "overflow"); bump(native(rejected)); commit(rejected, "notice")
    }
  }
  private fun diagnosticPermit(s: JSONObject, permit: CapturePermit): Boolean {
    val n = native(s)
    return n.getBoolean("enabled") && n.text("epoch") == permit.epoch && n.getJSONArray("sources").objects().any {
      it.text("packageName") == permit.packageName && it.text("sourceSelectionId") == permit.selection }
  }
  fun recordArrival(permit: CapturePermit, id: String, notificationAt: Long, snapshot: () -> JSONObject): String? = synchronized(mutex) {
    if (diagnostics?.enabled != true) return@synchronized null
    val s = load()
    if (!diagnosticPermit(s, permit) || s.isNull("ownerScope") || notificationAt < permit.since || notificationAt > clock() || notificationAt <= clock() - RETENTION) return@synchronized null
    diagnostics.record(s.text("ownerScope"), token(id), permit, notificationAt, snapshot)
  }
  fun diagnosticOutcome(permit: CapturePermit, id: String?, result: ParseResult) = synchronized(mutex) {
    if (diagnostics?.enabled == true && diagnosticPermit(load(), permit)) diagnostics.outcome(id, result)
  }
  private fun diagnosticRead(input: JSONObject, action: (DiagnosticRepository, String) -> Any?): Any? = synchronized(mutex) {
    val d = diagnostics
    if (d?.enabled != true) throw IntakeFailure("UNSUPPORTED")
    val s = load(); checkEpoch(s, input.text("expectedEpoch"))
    val scope = input.text("ownerScope"); owner(s, scope)
    if (s.isNull("ownerScope")) throw IntakeFailure("OWNER_MISMATCH")
    action(d, scope)
  }
  fun listDiagnostics(input: JSONObject): Any? = diagnosticRead(input) { d, scope -> d.list(scope) }
  fun readDiagnostic(input: JSONObject): Any? = diagnosticRead(input) { d, scope -> d.read(scope, input.text("id")) }
  fun deleteDiagnostic(input: JSONObject): Any? = diagnosticRead(input) { d, scope -> d.delete(scope, input.text("id")); null }
  fun clearDiagnostics(input: JSONObject): Any? = diagnosticRead(input) { _, _ -> diagnostics?.wipe(); null }
  fun list(input: JSONObject): JSONObject = synchronized(mutex) {
    val s = copy(); checkEpoch(s, input.text("expectedEpoch")); val n = native(s)
    val requestedLimit = input.integer("limit"); requireInput(requestedLimit in 1..50)
    val limit = requestedLimit.toInt()
    val cursor = if (input.has("cursor")) try { JSONObject(String(WireBase64.decode(input.text("cursor").also { requireInput(it.length <= 512) }), Charsets.UTF_8)) }
      catch (_: Exception) { throw IntakeFailure("INVALID_INPUT") } else null
    if (cursor != null) checkEpoch(s, cursor.text("epoch"))
    val sorted = n.getJSONArray("pending").objects().sortedWith(compareBy({ it.integer("capturedAt") }, { it.text("captureId") }))
      .filter { cursor == null || it.integer("capturedAt") > cursor.integer("capturedAt") ||
        (it.integer("capturedAt") == cursor.integer("capturedAt") && it.text("captureId") > cursor.text("captureId")) }
    val page = sorted.take(limit)
    val next = if (sorted.size > page.size) page.last().let { WireBase64.encode(
      obj("epoch" to n.text("epoch"), "capturedAt" to it.integer("capturedAt"), "captureId" to it.text("captureId")).toString().toByteArray(Charsets.UTF_8)) } else null
    obj("epoch" to n.text("epoch"), "captures" to JSONArray(page), "nextCursor" to next)
  }
  fun acknowledge(input: JSONObject): JSONArray = synchronized(mutex) {
    val s = copy(); checkEpoch(s, input.text("expectedEpoch")); val n = native(s)
    val ids = input.getJSONArray("captureIds"); requireInput(ids.length() in 1..50)
    val results = JSONArray()
    for (i in 0 until ids.length()) {
      val id = token(ids.getString(i)); val rows = n.getJSONArray("pending").objects()
      val outcome = if (rows.any { it.text("captureId") == id }) {
        n.put("pending", JSONArray(rows.filter { it.text("captureId") != id })); "acknowledged"
      } else if (n.getJSONArray("seen").objects().any { it.text("captureId") == id }) "already_acknowledged" else "not_found_or_expired"
      results.put(obj("captureId" to id, "outcome" to outcome))
    }
    bump(n); commit(s, "queue"); results
  }
  private fun owner(s: JSONObject, scope: String) {
    requireInput(Regex("[A-Za-z0-9_-]{43}").matches(scope))
    if (!s.isNull("ownerScope") && s.text("ownerScope") != scope) throw IntakeFailure("OWNER_MISMATCH")
  }
  fun readCandidate(input: JSONObject): JSONObject = synchronized(mutex) {
    val s = load(); checkEpoch(s, input.text("expectedEpoch")); owner(s, input.text("ownerScope"))
    obj("epoch" to native(s).text("epoch"), "revision" to s.integer("revision"), "value" to s.get("value"))
  }
  fun writeCandidate(input: JSONObject): JSONObject = synchronized(mutex) {
    val s = copy(); checkEpoch(s, input.text("expectedEpoch")); val scope = input.text("ownerScope"); owner(s, scope)
    if (s.integer("revision") != input.integer("expectedRevision")) throw IntakeFailure("REVISION_MISMATCH")
    requireInput(s.integer("revision") < SAFE_INTEGER)
    val value = input.text("value"); validateDocument(value)
    s.put("ownerScope", scope); s.put("value", value); s.put("revision", s.integer("revision") + 1)
    admit(s); commit(s); obj("epoch" to native(s).text("epoch"), "revision" to s.integer("revision"))
  }
  fun dismiss(input: JSONObject) = synchronized(mutex) {
    val s = copy(); checkEpoch(s, input.text("expectedEpoch")); val ids = input.getJSONArray("noticeIds")
    requireInput(ids.length() <= 64)
    val values = (0 until ids.length()).map { token(ids.getString(it)) }.toSet()
    val n = native(s); n.put("notices", JSONArray(n.getJSONArray("notices").objects().filter { it.text("id") !in values })); bump(n); commit(s, "notice")
  }
  fun check(expected: String) = synchronized(mutex) { checkEpoch(load(), expected) }
  fun connected(value: Boolean) = synchronized(mutex) {
    connection = if (value) "connected" else "disconnected"
    val s = copy(); if (value) native(s).put("lastConnectedAt", clock())
    bump(native(s)); commit(s, "health")
  }
  fun recoveryGap(expected: String) = synchronized(mutex) {
    val s = copy(); checkEpoch(s, expected); val n = native(s)
    if (n.isNull("gap")) n.put("gap", obj("since" to clock(), "reason" to "recovery", "rejectedCount" to 0))
    bump(n); commit(s, "health")
  }
}
