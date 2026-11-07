package expo.modules.notificationintake

import javax.crypto.KeyGenerator
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class DiagnosticRepositoryTest {
  private class EncryptedStore : SnapshotStorage {
    private val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    private val aad = "synthetic-arrival-test".toByteArray()
    var sealed: SnapshotEncryption.Sealed? = null
    var fail = false
    override fun read() = sealed?.let { SnapshotEncryption.open(it.iv, it.ciphertext, key, aad) }
    override fun write(bytes: ByteArray) { if (fail) throw StorageFailure("key_unavailable"); sealed = SnapshotEncryption.seal(bytes, key, aad) }
    override fun recover(bytes: ByteArray) { fail = false; write(bytes) }
  }
  private var now = 1_800_000_000_000L
  private val store = EncryptedStore()
  private val diagnostics = DiagnosticRepository(store, true) { now }
  private val main = EncryptedStore()
  private val repository = IntakeRepository(main, diagnostics) { now }
  private val scope = "a".repeat(43)
  private fun setup(): CapturePermit {
    val epoch = repository.status(true).text("epoch")
    val result = repository.configure(obj("expectedEpoch" to epoch, "mutationId" to UUID.randomUUID().toString(), "consentVersion" to "v1",
      "sources" to JSONArray(listOf(obj("packageName" to "com.example.bank", "sourceSelectionId" to "selected")))))
    repository.writeCandidate(obj("expectedEpoch" to result.text("epoch"), "ownerScope" to scope, "expectedRevision" to 0, "value" to "{}"))
    return repository.permit("com.example.bank")!!
  }
  private fun input(permit: CapturePermit, id: String? = null) = obj("expectedEpoch" to permit.epoch, "ownerScope" to scope).apply { if (id != null) put("id", id) }
  private fun snapshot() = DiagnosticValues().encode(mapOf("android.title" to "Synthetic arrival", "android.text" to "Synthetic body",
    "android.bigText" to "Long synthetic body", "android.textLines" to arrayOf("one", "two"), "android.subText" to "Summary",
    "android.messages" to listOf(mapOf("text" to "Synthetic message", "time" to 123L))))

  @Test fun fullPreparseSnapshotSurvivesSecurityDiscardAndIsSeparateFromNormalizedStorage() {
    val permit = setup()
    val id = repository.recordArrival(permit, "capture", now) { snapshot() }
    assertNotNull(id)
    val security = GenericNotificationParser.parse("Use code 482913 for verification")
    repository.diagnosticOutcome(permit, id, security); repository.capture(permit, "capture", now, security)
    val saved = repository.readDiagnostic(input(permit, id)) as JSONObject
    assertEquals("discarded", saved.getJSONObject("parser").text("outcome"))
    assertEquals(canonical(snapshot()), canonical(saved.getJSONObject("snapshot")))
    assertEquals(0, repository.list(obj("expectedEpoch" to permit.epoch, "limit" to 50)).getJSONArray("captures").length())
    assertFalse(String(main.read()!!).contains("Synthetic body"))
    assertFalse(String(store.sealed!!.ciphertext).contains("Synthetic body"))
    assertTrue(String(store.read()!!).contains("Synthetic body"))
    val reopened = DiagnosticRepository(store, true) { now }
    assertNotNull(reopened.read(scope, id!!))
  }
  @Test fun captureBasedExpiryDoesNotRenewOnRescanAndDeleteClearAndOwnerFencesWork() {
    val permit = setup(); val id = repository.recordArrival(permit, "capture", now) { snapshot() }!!
    val before = diagnostics.read(scope, id)!!.toString()
    now += 1000
    assertEquals(id, repository.recordArrival(permit, "capture", now) { fail("Duplicate must preserve original snapshot"); snapshot() })
    assertEquals(before, diagnostics.read(scope, id)!!.toString())
    try { repository.listDiagnostics(input(permit).put("ownerScope", "b".repeat(43))); fail("Owner must be checked") } catch (error: IntakeFailure) { assertEquals("OWNER_MISMATCH", error.code) }
    now += DIAGNOSTIC_TTL
    assertEquals(0, diagnostics.list(scope).getJSONArray("records").length())
    val next = repository.recordArrival(permit, "next", now) { snapshot() }!!
    repository.deleteDiagnostic(input(permit, next)); assertNull(diagnostics.read(scope, next))
    repository.recordArrival(permit, "clear", now) { snapshot() }; repository.clearDiagnostics(input(permit))
    assertEquals(0, diagnostics.list(scope).getJSONArray("records").length())
  }
  @Test fun fullOrFailedDiagnosticStorageNeverBlocksNormalCandidateCapture() {
    val permit = setup()
    repeat(DIAGNOSTIC_COUNT + 2) { index ->
      val id = repository.recordArrival(permit, "capture-" + index, now) { snapshot() }
      val result = GenericNotificationParser.parse("You have a message")
      repository.diagnosticOutcome(permit, id, result); repository.capture(permit, "capture-" + index, now, result)
    }
    assertEquals(DIAGNOSTIC_COUNT, diagnostics.status().integer("recordCount").toInt())
    assertEquals(2L, diagnostics.status().integer("overflowCount"))
    assertEquals(DIAGNOSTIC_COUNT + 2, repository.list(obj("expectedEpoch" to permit.epoch, "limit" to 50)).getJSONArray("captures").length())
    repository.clearDiagnostics(input(permit)); store.fail = true
    val id = repository.recordArrival(permit, "storage-failed", now) { snapshot() }
    assertNull(id); repeat(3) { assertEquals("key_unavailable", diagnostics.status().text("state")) }
    repository.capture(permit, "storage-failed", now, GenericNotificationParser.parse("You have a message"))
    assertEquals(DIAGNOSTIC_COUNT + 3, repository.list(obj("expectedEpoch" to permit.epoch, "limit" to 50)).getJSONArray("captures").length())
  }
  @Test fun byteCapsAndOversizedSnapshotsAreExplicitAndPreserveExistingRows() {
    val permit = setup()
    repeat(24) { index -> repository.recordArrival(permit, "large-" + index, now) { obj("type" to "synthetic", "value" to "x".repeat(300_000)) } }
    val health = diagnostics.status()
    assertTrue(health.integer("byteCount") <= DIAGNOSTIC_BYTES)
    assertTrue(health.integer("overflowCount") > 0)
    repository.clearDiagnostics(input(permit))
    val id = repository.recordArrival(permit, "oversized", now) { obj("value" to "x".repeat(DIAGNOSTIC_RECORD_BYTES)) }!!
    assertEquals("record_byte_cap", diagnostics.read(scope, id)!!.getJSONObject("snapshot").text("reason"))
  }
  @Test fun wipeRemovesDiagnosticsAndFencesQueuedArrivals() {
    val permit = setup(); repository.recordArrival(permit, "capture", now) { snapshot() }
    repository.wipe(obj("expectedEpoch" to permit.epoch, "mutationId" to UUID.randomUUID().toString()))
    assertNull(repository.recordArrival(permit, "late", now) { snapshot() })
    assertEquals(0, diagnostics.status().integer("recordCount").toInt())
    assertFalse(String(store.read()!!).contains("Synthetic body"))
  }
  @Test fun productionGuardDoesNotCollectOrReadRawFields() {
    val disabledStore = EncryptedStore(); val disabled = DiagnosticRepository(disabledStore, false) { now }
    val permit = CapturePermit("a".repeat(22), "com.example.bank", "selected", "v1", now)
    assertNull(disabled.record(scope, "capture", permit, now) { fail("Production must not evaluate raw snapshot"); snapshot() })
    assertNull(disabledStore.sealed)
    try { disabled.list(scope); fail("Production must not read") } catch (error: IntakeFailure) { assertEquals("UNSUPPORTED", error.code) }
  }
  @Test fun typedValuesKeepOriginalFieldsAndMarkCapabilitiesTruncationAndAccessFailures() {
    val capability = object { override fun toString(): String { fail("Do not serialize capabilities"); return "" } }
    val encoded = DiagnosticValues().encode(mapOf("originalName" to listOf("Synthetic text", 12, true), "capability" to capability))
    assertTrue(encoded.toString().contains("originalName")); assertTrue(encoded.toString().contains("Synthetic text"))
    assertTrue(encoded.toString().contains("unsupported")); assertTrue(encoded.toString().contains("non_data_object_or_capability"))
    val limited = DiagnosticValues().encode("x".repeat(600_000))
    assertEquals("truncated", limited.text("status")); assertEquals(600_000L, limited.integer("originalCharacters"))
    val inaccessible = DiagnosticValues { throw IllegalStateException("synthetic inaccessible") }.encode(capability)
    assertEquals("inaccessible", inaccessible.text("status"))
  }
  @Test fun authenticatedEncryptionRejectsTamperingAndWrongPartitionAndUsesFreshNonces() {
    val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    val raw = "Synthetic arrival contents".toByteArray(); val aad = "diagnostics".toByteArray()
    val first = SnapshotEncryption.seal(raw, key, aad); val second = SnapshotEncryption.seal(raw, key, aad)
    assertFalse(first.iv.contentEquals(second.iv)); assertArrayEquals(raw, SnapshotEncryption.open(first.iv, first.ciphertext, key, aad))
    for ((ciphertext, partition) in listOf(first.ciphertext.copyOf().apply { this[0] = (this[0].toInt() xor 1).toByte() } to aad, first.ciphertext to "candidate".toByteArray())) {
      try { SnapshotEncryption.open(first.iv, ciphertext, key, partition); fail("Authentication must fail") } catch (_: javax.crypto.AEADBadTagException) {}
    }
  }
}
