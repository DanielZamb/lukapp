package expo.modules.notificationintake

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class IntakeRepositoryTest {
  private class Store : SnapshotStorage {
    var bytes: ByteArray? = null
    var broken: String? = null
    override fun read(): ByteArray? { broken?.let { throw StorageFailure(it) }; return bytes }
    override fun write(bytes: ByteArray) { this.bytes = bytes.copyOf() }
    override fun recover(bytes: ByteArray) { broken = null; write(bytes) }
  }
  private var now = 1_800_000_000_000L
  private val store = Store()
  private val repository = IntakeRepository(store) { now }
  private fun epoch() = repository.status(true).text("epoch")
  private fun config(expected: String = epoch(), selection: String = "selection-1", id: String = UUID.randomUUID().toString()) =
    obj("expectedEpoch" to expected, "mutationId" to id, "consentVersion" to "consent-v1", "sources" to JSONArray(listOf(obj("packageName" to "com.example.bank", "sourceSelectionId" to selection))))
  private fun configure() { repository.configure(config()) }
  private fun capture(id: String, minor: Long = 1200, notificationAt: Long = now) {
    repository.capture(repository.permit("com.example.bank")!!, id, notificationAt, ParseResult.Accepted(ParsedAmount("out", minor, "COP", "é".repeat(128))))
  }
  private fun page(cursor: String? = null, limit: Int = 50): JSONObject {
    val input = obj("expectedEpoch" to epoch(), "limit" to limit)
    if (cursor != null) input.put("cursor", cursor)
    return repository.list(input)
  }
  private fun expect(code: String, action: () -> Unit) {
    try { action(); fail("Expected " + code) } catch (e: IntakeFailure) { assertEquals(code, e.code) }
  }
  private fun write(revision: Long, owner: String = "a".repeat(43), value: String = "{\"records\":[]}") =
    obj("expectedEpoch" to epoch(), "expectedRevision" to revision, "ownerScope" to owner, "value" to value)

  @Test fun parsedMerchantCrossesTheNativeBoundaryWithoutRawTextOrSourceNames() {
    configure(); val permit = repository.permit("com.example.bank")!!
    val input = "Paid USD 12.30 at Cafe Central"
    val parsed = GenericNotificationParser.parse(input) as ParseResult.Accepted
    val safe = parsed.amount.copy(description = GenericNotificationParser.descriptionForSource(parsed.amount.description, permit.packageName, "Source Bank"))
    repository.capture(permit, "merchant", now, ParseResult.Accepted(safe))
    assertEquals("Cafe Central", page().getJSONArray("captures").getJSONObject(0).text("description"))
    assertFalse(String(store.bytes!!).contains(input))
    val source = GenericNotificationParser.parse("Paid USD 12.30 at Source Bank") as ParseResult.Accepted
    repository.capture(permit, "source", now, ParseResult.Accepted(source.amount.copy(description =
      GenericNotificationParser.descriptionForSource(source.amount.description, permit.packageName, "Source Bank"))))
    assertEquals("", page().getJSONArray("captures").objects().first { it.text("captureId") == "source" }.text("description"))
  }
  @Test fun consentAndAllowlistPrecedeCapture() {
    assertNull(repository.permit("com.example.bank")); configure()
    assertNull(repository.permit("com.other.bank"))
    val permit = repository.permit("com.example.bank")!!
    repository.capture(permit, "old", now - 1, ParseResult.Accepted(ParsedAmount("out", 100, null)))
    assertEquals(0, page().getJSONArray("captures").length())
  }
  @Test fun configureRetryPreservesQueueRevisionAndRejectsChangedPayload() {
    configure(); capture("capture-1"); repository.writeCandidate(write(0))
    val input = config(); val result = repository.configure(input)
    assertEquals(result.toString(), repository.configure(JSONObject(input.toString())).toString())
    assertEquals(1, page().getJSONArray("captures").length())
    assertEquals(1L, repository.readCandidate(obj("expectedEpoch" to epoch(), "ownerScope" to "a".repeat(43))).integer("revision"))
    expect("INVALID_INPUT") { repository.configure(JSONObject(input.toString()).put("consentVersion", "changed")) }
    expect("EPOCH_MISMATCH") { repository.configure(config(input.text("expectedEpoch"))) }
  }
  @Test fun casAndOwnerAreIndependentFromEpochAndDoNotEmitHints() {
    configure(); var hints = 0; repository.onChange = { hints++ }
    repository.writeCandidate(write(0)); assertEquals(0, hints)
    expect("REVISION_MISMATCH") { repository.writeCandidate(write(0)) }
    expect("OWNER_MISMATCH") { repository.writeCandidate(write(1, "b".repeat(43))) }
    repository.configure(config()); repository.writeCandidate(write(1))
    assertEquals(2L, repository.readCandidate(obj("expectedEpoch" to epoch(), "ownerScope" to "a".repeat(43))).integer("revision"))
  }
  @Test fun stableCursorAdvancesPastUnacknowledgedAndRemovedEntries() {
    configure(); (0..54).forEach { capture("capture-" + it.toString().padStart(3, '0')) }
    val first = page(); assertEquals(50, first.getJSONArray("captures").length())
    val cursor = first.text("nextCursor")
    repository.acknowledge(obj("expectedEpoch" to epoch(), "captureIds" to JSONArray(listOf("capture-000"))))
    val next = page(cursor); assertEquals(5, next.getJSONArray("captures").length())
    assertEquals("capture-050", next.getJSONArray("captures").getJSONObject(0).text("captureId"))
    repository.configure(config()); expect("EPOCH_MISMATCH") { page(cursor) }
  }
  @Test fun replayPreservesOriginalTimeAndChangedEnvelopeBecomesGap() {
    configure(); capture("id"); val original = page().getJSONArray("captures").getJSONObject(0)
    now += 500; capture("id", notificationAt = original.integer("notificationAt"))
    assertEquals(original.toString(), page().getJSONArray("captures").getJSONObject(0).toString())
    capture("id", 1300, original.integer("notificationAt"))
    assertEquals(1200L, page().getJSONArray("captures").getJSONObject(0).integer("amountMinorUnits"))
    assertEquals("recovery", repository.status(true).getJSONObject("gap").text("reason"))
    val input = obj("expectedEpoch" to epoch(), "captureIds" to JSONArray(listOf("id")))
    assertEquals("acknowledged", repository.acknowledge(input).getJSONObject(0).text("outcome"))
    assertEquals("already_acknowledged", repository.acknowledge(input).getJSONObject(0).text("outcome"))
    now = original.integer("expiresAt")
    assertEquals("not_found_or_expired", repository.acknowledge(input).getJSONObject(0).text("outcome"))
  }
  @Test fun wipeFencesOldCallbackAndIsRetryable() {
    configure(); val permit = repository.permit("com.example.bank")!!
    val input = obj("expectedEpoch" to epoch(), "mutationId" to UUID.randomUUID().toString())
    val result = repository.wipe(input)
    repository.capture(permit, "stale", now, ParseResult.Accepted(ParsedAmount("out", 100, null)))
    assertEquals(result.toString(), repository.wipe(input).toString())
    assertFalse(repository.status(true).getBoolean("enabled")); assertEquals(0, page().getJSONArray("captures").length())
    expect("INVALID_INPUT") { repository.wipe(JSONObject(input.toString()).put("expectedEpoch", epoch())) }
  }
  @Test fun corruptAndKeyLossRequireExplicitRecoveryWipe() {
    for (state in listOf("corrupt", "key_unavailable")) {
      val bad = Store().apply { broken = state }; val repo = IntakeRepository(bad) { now }
      val status = repo.status(true); assertEquals(state, status.text("storageState")); assertFalse(status.getBoolean("enabled"))
      expect("CORRUPT_STATE") { repo.configure(config(status.text("epoch"))) }
      val input = obj("expectedEpoch" to status.text("epoch"), "mutationId" to UUID.randomUUID().toString())
      val wiped = repo.wipe(input); assertEquals(wiped.toString(), repo.wipe(input).toString())
      assertEquals("healthy", repo.status(true).text("storageState")); assertFalse(repo.status(true).getBoolean("enabled"))
    }
  }
  @Test fun pendingAndReplayBoundsPreserveUnexpiredMarkers() {
    configure(); capture("seed")
    val state = JSONObject(String(store.bytes!!)); val native = state.getJSONObject("native")
    val seed = native.getJSONArray("pending").getJSONObject(0)
    val captures = (0 until 512).map { index -> JSONObject(seed.toString()).put("captureId", "capture-" + index.toString().padStart(4, '0')) }
    native.put("pending", JSONArray(captures))
    native.put("seen", JSONArray((0 until 2048).map { index ->
      val row = if (index < 512) captures[index] else null
      obj("captureId" to ("capture-" + index.toString().padStart(4, '0')), "digest" to digest(canonical(row ?: seed).toByteArray(Charsets.UTF_8)), "expiresAt" to now + RETENTION)
    }))
    native.put("sources", JSONArray((0 until 16).map { obj("packageName" to (if (it == 0) "com.example.bank" else "com.example.source" + it), "sourceSelectionId" to ("source" + it).padEnd(64, 'x'), "since" to now) }))
    native.put("notices", JSONArray((0 until 64).map { obj("id" to ("notice" + it).padEnd(64, 'x'), "kind" to "ambiguous", "count" to SAFE_INTEGER, "firstAt" to now, "lastAt" to now) }))
    store.bytes = state.toString().toByteArray(Charsets.UTF_8)
    val full = IntakeRepository(store) { now }
    val expected = full.status(true).text("epoch")
    val records = JSONArray((0 until 512).map { obj("id" to it) })
    val document = obj("records" to records, "padding" to "")
    document.put("padding", "x".repeat(MIB - document.toString().toByteArray(Charsets.UTF_8).size))
    full.writeCandidate(obj("expectedEpoch" to expected, "expectedRevision" to 0, "ownerScope" to "a".repeat(43), "value" to document.toString()))
    val persisted = JSONObject(String(store.bytes!!))
    println("STORAGE_SIZE sources=16 notices=64 pending=512 replay=2048 description_bytes=256 candidate_records=512 candidate_bytes=" + document.toString().toByteArray(Charsets.UTF_8).size +
      " native_bytes=" + persisted.getJSONObject("native").toString().toByteArray(Charsets.UTF_8).size + " whole_plaintext_bytes=" + store.bytes!!.size)
    assertTrue(store.bytes!!.size <= 2 * MIB)
    val permit = full.permit("com.example.bank")!!
    full.capture(permit, "overflow", now, ParseResult.Accepted(ParsedAmount("out", 100, null)))
    assertEquals(512L, full.status(true).integer("pendingCount"))
    assertEquals("overflow", full.status(true).getJSONObject("gap").text("reason"))
    full.acknowledge(obj("expectedEpoch" to expected, "captureIds" to JSONArray(listOf("capture-0000"))))
    full.capture(permit, "replay-overflow", now, ParseResult.Accepted(ParsedAmount("out", 100, null)))
    assertEquals(511L, full.status(true).integer("pendingCount"))
    assertEquals(2048, JSONObject(String(store.bytes!!)).getJSONObject("native").getJSONArray("seen").length())
    now += RETENTION
    full.capture(permit, "after-expiry", now, ParseResult.Accepted(ParsedAmount("out", 100, null)))
    assertEquals(1L, full.status(true).integer("pendingCount"))
    assertEquals(1, JSONObject(String(store.bytes!!)).getJSONObject("native").getJSONArray("seen").length())
  }
  @Test fun documentAndPageBoundsAndSnapshotReload() {
    configure(); capture("persisted")
    expect("INVALID_INPUT") { page(limit = 0) }
    expect("CAPACITY_EXCEEDED") { repository.writeCandidate(write(0, value = "{\"padding\":\"" + "x".repeat(MIB) + "\"}")) }
    val fresh = IntakeRepository(store) { now }
    assertEquals(1L, fresh.status(true).integer("pendingCount"))
    assertEquals("unknown", fresh.status(true).text("connection"))
  }
  @Test fun observedNoticeTimesMayMoveBackWithTheSystemClock() {
    configure(); val permit = repository.permit("com.example.bank")!!
    now += 1000; val first = now
    repository.capture(permit, "first", now, ParseResult.Discard("security"))
    now -= 500
    repository.capture(permit, "second", now, ParseResult.Discard("security"))
    val notice = repository.status(true).getJSONArray("notices").getJSONObject(0)
    assertEquals(2L, notice.integer("count")); assertEquals(first, notice.integer("firstAt")); assertEquals(now, notice.integer("lastAt"))
  }
  @Test fun byteCapacityLeavesRoomForDurableOverflowHealth() {
    configure()
    val state = JSONObject(String(store.bytes!!)).put("ownerScope", "a".repeat(43)).put("revision", 1)
    state.put("value", obj("padding" to "").toString())
    val available = 2 * MIB - 32_768 - 8 - state.toString().toByteArray(Charsets.UTF_8).size
    val document = obj("padding" to "\\".repeat(available / 4)).toString()
    repository.writeCandidate(write(0, value = document))
    capture("byte-overflow")
    assertEquals(0L, repository.status(true).integer("pendingCount"))
    assertEquals("overflow", repository.status(true).getJSONObject("gap").text("reason"))
    assertEquals(document, repository.readCandidate(obj("expectedEpoch" to epoch(), "ownerScope" to "a".repeat(43))).text("value"))
    assertTrue(store.bytes!!.size <= 2 * MIB)
  }
  @Test fun statusDurablyPrunesExpiredNativeRowsWithoutRotatingEpoch() {
    configure(); capture("expired"); val originalEpoch = epoch()
    now += RETENTION
    val status = repository.status(true)
    assertEquals(0L, status.integer("pendingCount")); assertEquals(originalEpoch, status.text("epoch"))
    val persisted = JSONObject(String(store.bytes!!)).getJSONObject("native")
    assertEquals(0, persisted.getJSONArray("pending").length()); assertEquals(0, persisted.getJSONArray("seen").length())
  }
  @Test fun recoveryHealthDoesNotInventRejectedCapturesOrConnectionTimes() {
    configure(); assertTrue(repository.status(true).isNull("lastConnectedAt"))
    repository.recoveryGap(epoch())
    assertEquals(0L, repository.status(true).getJSONObject("gap").integer("rejectedCount"))
    repository.connected(true)
    assertEquals(now, repository.status(true).integer("lastConnectedAt"))
  }
  @Test fun keyLossOrMissingSnapshotAfterAdmissionDoesNotUseCachedPlaintext() {
    configure(); val original = store.bytes!!.copyOf()
    store.broken = "key_unavailable"
    val first = repository.status(true)
    assertEquals("key_unavailable", first.text("storageState"))
    now += 100; store.broken = null
    assertEquals(first.getJSONObject("gap").integer("since"), repository.status(true).getJSONObject("gap").integer("since"))
    expect("CORRUPT_STATE") { repository.writeCandidate(write(0)) }
    assertArrayEquals(original, store.bytes)
    val missing = Store(); val repo = IntakeRepository(missing) { now }
    repo.status(true); missing.bytes = null
    assertEquals("corrupt", repo.status(true).text("storageState"))
    assertNull(missing.bytes)
  }
  @Test fun malformedSnapshotFailsClosedWithoutReplacingIt() {
    configure(); capture("persisted")
    val malformed = JSONObject(String(store.bytes!!))
    malformed.getJSONObject("native").put("enabled", "true")
    val original = malformed.toString().toByteArray(Charsets.UTF_8); store.bytes = original
    val recovered = IntakeRepository(store) { now }
    val status = recovered.status(true)
    assertEquals("corrupt", status.text("storageState")); assertFalse(status.getBoolean("enabled"))
    assertArrayEquals(original, store.bytes)
    expect("CORRUPT_STATE") { recovered.readCandidate(obj("expectedEpoch" to status.text("epoch"), "ownerScope" to "a".repeat(43))) }
    recovered.wipe(obj("expectedEpoch" to status.text("epoch"), "mutationId" to UUID.randomUUID().toString()))
    assertFalse(recovered.status(true).getBoolean("enabled"))
    assertEquals("healthy", recovered.status(true).text("storageState"))
  }
  @Test fun nativeInputCannotWrapThePageLimitOrAcceptTrailingDocumentBytes() {
    configure()
    expect("INVALID_INPUT") { repository.list(obj("expectedEpoch" to epoch(), "limit" to 4_294_967_297L)) }
    expect("INVALID_INPUT") { repository.writeCandidate(write(0, value = "{} trailing")) }
  }
  @Test fun noticeDismissalIsEpochFencedAndContentFree() {
    configure(); val permit = repository.permit("com.example.bank")!!
    repeat(70) { repository.capture(permit, "id", now, ParseResult.Discard("security")) }
    val status = repository.status(true); val notices = status.getJSONArray("notices")
    assertEquals(1, notices.length()); assertEquals(70L, notices.getJSONObject(0).integer("count"))
    repository.dismiss(obj("expectedEpoch" to epoch(), "noticeIds" to JSONArray(listOf(notices.getJSONObject(0).text("id")))))
    assertEquals(0, repository.status(true).getJSONArray("notices").length())
  }

  @Test fun partialParserCapturesPersistOnceAndKeepKnownFactsAcrossRestartAndAcknowledgement() {
    configure(); val permit = repository.permit("com.example.bank")!!
    val inputs = listOf("You have a message", "Paid $10 balance $20", "received paid USD 12.30; Merchant: Cafe", "Purchase pending; Merchant: Cafe")
    inputs.forEachIndexed { index, text ->
      val result = GenericNotificationParser.parse(text)
      assertTrue(result is ParseResult.Accepted)
      repository.capture(permit, "partial-" + index, now, result)
      repository.capture(permit, "partial-" + index, now, result)
    }
    val first = page().getJSONArray("captures").objects()
    assertEquals(4, first.size)
    assertTrue(first[0].isNull("amountMinorUnits")); assertTrue(first[0].isNull("direction"))
    assertTrue(first[1].isNull("amountMinorUnits")); assertEquals("out", first[1].text("direction"))
    assertEquals(1230L, first[2].integer("amountMinorUnits")); assertTrue(first[2].isNull("direction")); assertEquals("USD", first[2].text("currency"))
    assertEquals("Cafe", first[3].text("description"))
    assertEquals(0, repository.status(true).getJSONArray("notices").length())
    inputs.forEach { assertFalse(String(store.bytes!!).contains(it)) }
    val reopened = IntakeRepository(store) { now }
    val listed = reopened.list(obj("expectedEpoch" to epoch(), "limit" to 50)).getJSONArray("captures")
    assertEquals(JSONArray(first).toString(), listed.toString())
    repository.acknowledge(obj("expectedEpoch" to epoch(), "captureIds" to JSONArray(first.map { it.text("captureId") })))
    inputs.forEachIndexed { index, text -> repository.capture(permit, "partial-" + index, now, GenericNotificationParser.parse(text)) }
    assertEquals(0, page().getJSONArray("captures").length())
    repository.capture(permit, "partial-0", now, GenericNotificationParser.parse("Paid USD 3"))
    assertEquals(0, page().getJSONArray("captures").length()); assertEquals("recovery", repository.status(true).getJSONObject("gap").text("reason"))
  }
  @Test fun v1SnapshotMigrationPreservesOwnerEpochQueueAndAcknowledgedReplayMarkers() {
    configure(); capture("old-pending"); capture("old-acknowledged"); repository.writeCandidate(write(0))
    val old = JSONObject(String(store.bytes!!)); old.put("schemaVersion", 1)
    val n = old.getJSONObject("native")
    n.getJSONArray("pending").objects().forEach { row ->
      row.put("parserVersion", "generic-v1")
      val seen = n.getJSONArray("seen").objects().first { it.text("captureId") == row.text("captureId") }
      seen.put("digest", digest(canonical(row).toByteArray(Charsets.UTF_8)))
    }
    n.put("pending", JSONArray(n.getJSONArray("pending").objects().filter { it.text("captureId") != "old-acknowledged" }))
    val retained = canonical(n); store.bytes = old.toString().toByteArray(Charsets.UTF_8)
    val reopened = IntakeRepository(store) { now }
    assertEquals(n.text("epoch"), reopened.status(true).text("epoch"))
    val migrated = JSONObject(String(store.bytes!!))
    assertEquals(2L, migrated.integer("schemaVersion")); assertEquals(retained, canonical(migrated.getJSONObject("native")))
    assertEquals(1L, migrated.integer("revision")); assertEquals("a".repeat(43), migrated.text("ownerScope"))
    val permit = reopened.permit("com.example.bank")!!
    for (id in listOf("old-pending", "old-acknowledged")) reopened.capture(permit, id, now, ParseResult.Accepted(ParsedAmount("out", 1200, "COP", "é".repeat(128))))
    assertEquals(1, reopened.list(obj("expectedEpoch" to permit.epoch, "limit" to 50)).getJSONArray("captures").length())
    assertTrue(reopened.status(true).isNull("gap"))
  }
  @Test fun securityAlternativesAndOversizedSecurityNeverPersistPartialFacts() {
    configure(); val permit = repository.permit("com.example.bank")!!
    val fields = listOf(NotificationFields(title = "Paid USD 12", text = "Use code 123456"),
      NotificationFields(text = "x".repeat(16_385), subText = "OTP 123456"))
    fields.forEachIndexed { index, value -> repository.capture(permit, "security-" + index, now, GenericNotificationParser.parseFields(value)) }
    assertEquals(0, page().getJSONArray("captures").length())
    assertEquals("security", repository.status(true).getJSONArray("notices").getJSONObject(0).text("kind"))
    assertFalse(String(store.bytes!!).contains("123456")); assertFalse(String(store.bytes!!).contains("Paid USD"))
    val partial = GenericNotificationParser.parse("You have a message")
    val beforeWipe = epoch(); repository.wipe(obj("expectedEpoch" to beforeWipe, "mutationId" to UUID.randomUUID().toString()))
    repository.capture(permit, "late", now, partial)
    assertEquals(0, page().getJSONArray("captures").length())
  }
}
