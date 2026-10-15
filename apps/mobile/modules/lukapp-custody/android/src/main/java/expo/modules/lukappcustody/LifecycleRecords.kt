package expo.modules.lukappcustody

import java.io.File
import org.json.JSONObject
import org.json.JSONException

internal class LifecycleRecords(private val root: File, private val write: (File, ByteArray) -> Unit, private val read: (File) -> String = { it.readText() }) {
  companion object {
    private val routing = setOf("installed", "erased", "wipe", "recovery", "recovery-work", "recovery-v2.json", "revocations")
    fun preserved(name: String): Boolean = name in routing || name.removeSuffix(".bak").removeSuffix(".new") in routing
  }
  private fun <T> validated(operation: () -> T): T = try { operation() } catch (error: JSONException) { throw IllegalStateException("lifecycle_metadata_invalid", error) }
  private fun parse(raw: String): JSONObject = validated { JSONObject(raw) }
  private fun fields(value: JSONObject, required: Set<String>, optional: Set<String> = emptySet()) {
    val names = value.keys().asSequence().toSet()
    check(names.containsAll(required) && names.all { it in required || it in optional }) { "lifecycle_metadata_invalid" }
  }
  private fun id(value: Any): String {
    check(value is String && value.isNotEmpty() && value.toByteArray().size <= 200) { "lifecycle_metadata_invalid" }
    return value
  }
  private fun revision(value: JSONObject): Long {
    val number = value.get("revision")
    check(number is Number && number.toDouble().isFinite() && number.toDouble() == number.toLong().toDouble() && number.toLong() in 0..9007199254740990L) { "lifecycle_metadata_invalid" }
    return number.toLong()
  }
  private fun provider(value: JSONObject) {
    when (value.getString("kind")) {
      "pending" -> {
        fields(value, setOf("kind", "nextAttemptAt"), setOf("error"))
        check(value.get("nextAttemptAt") is Number && value.getDouble("nextAttemptAt").isFinite()) { "lifecycle_metadata_invalid" }
        if (value.has("error")) check(value.getString("error") in setOf("provider_configuration_required", "provider_instance_mismatch", "provider_unavailable", "provider_provenance_mismatch", "provider_session_invalid", "provider_session_terminal", "recovery_fresh_sign_in_required", "recovery_intent_expired", "recovery_conflict")) { "lifecycle_metadata_invalid" }
      }
      "succeeded" -> { fields(value, setOf("kind", "at")); check(value.get("at") is Number && value.getDouble("at").isFinite()) { "lifecycle_metadata_invalid" } }
      else -> error("lifecycle_metadata_invalid")
    }
  }
  private fun recovery(value: JSONObject): JSONObject = validated {
    fields(value, setOf("version", "revision", "intent", "cleanup")); check(value.get("version") == 2) { "lifecycle_metadata_invalid" }; revision(value)
    val intent = value.getJSONObject("intent")
    when (intent.getString("kind")) {
      "none", "retrieve" -> fields(intent, setOf("kind"))
      "exact" -> { fields(intent, setOf("kind", "intentId")); id(intent.get("intentId")) }
      else -> error("lifecycle_metadata_invalid")
    }
    val cleanup = value.getJSONObject("cleanup")
    when (cleanup.getString("kind")) {
      "none" -> fields(cleanup, setOf("kind"))
      "work" -> { fields(cleanup, setOf("kind", "workId")); id(cleanup.get("workId")) }
      else -> error("lifecycle_metadata_invalid")
    }
    value
  }
  private fun revocation(value: JSONObject): JSONObject = validated {
    fields(value, setOf("version", "revision", "deviceId", "outcome")); check(value.get("version") == 1) { "lifecycle_metadata_invalid" }; revision(value); id(value.get("deviceId"))
    val outcome = value.getJSONObject("outcome")
    when (outcome.getString("kind")) {
      "response-unknown" -> fields(outcome, setOf("kind"))
      "observed" -> { fields(outcome, setOf("kind", "workId", "result")); id(outcome.get("workId")); provider(outcome.getJSONObject("result")) }
      else -> error("lifecycle_metadata_invalid")
    }
    value
  }
  private fun exists(file: File) = file.exists() || File(file.path + ".bak").exists()
  private fun remove(file: File) { for (suffix in listOf("", ".bak", ".new")) { val copy = File(file.path + suffix); check(!copy.exists() || copy.delete()) { "lifecycle_migration_cleanup_failed" } } }
  fun readRecovery(): JSONObject {
    val target = File(root, "recovery-v2.json")
    val value = if (exists(target)) recovery(parse(read(target))) else {
      val intentFile = File(root, "recovery"); val workFile = File(root, "recovery-work")
      val intent = if (!exists(intentFile)) JSONObject().put("kind", "none") else {
        val saved = id(read(intentFile)); if (saved == "retrieve") JSONObject().put("kind", "retrieve") else JSONObject().put("kind", "exact").put("intentId", saved)
      }
      val cleanup = if (exists(workFile)) JSONObject().put("kind", "work").put("workId", id(read(workFile))) else JSONObject().put("kind", "none")
      val migrated = recovery(JSONObject().put("version", 2).put("revision", 0).put("intent", intent).put("cleanup", cleanup))
      write(target, migrated.toString().toByteArray()); recovery(parse(read(target)))
    }
    remove(File(root, "recovery")); remove(File(root, "recovery-work"))
    return value
  }
  fun writeRecovery(raw: String, expected: Long): String {
    val next = recovery(parse(raw)); check(revision(readRecovery()) == expected && revision(next) == expected + 1) { "lifecycle_revision_stale" }
    write(File(root, "recovery-v2.json"), next.toString().toByteArray()); return readRecovery().toString()
  }
  private fun target(device: String): File {
    val directory = File(root, "revocations"); check(directory.isDirectory || directory.mkdir()) { "lifecycle_storage_unavailable" }
    return File(directory, id(device).toByteArray().joinToString("") { "%02x".format(it) } + ".json")
  }
  fun readRevocations(): List<JSONObject> {
    val directory = File(root, "revocations"); if (!directory.exists()) return emptyList()
    val files = requireNotNull(directory.listFiles()).map { it.name.removeSuffix(".bak").removeSuffix(".new") }.toSet()
    return files.sorted().map { name ->
      val file = File(directory, name); check(exists(file)) { "lifecycle_metadata_invalid" }
      val value = revocation(parse(read(file))); check(target(value.getString("deviceId")).name == name) { "lifecycle_metadata_invalid" }; value
    }
  }
  fun writeRevocation(raw: String, expected: Long): String {
    val next = revocation(parse(raw)); val file = target(next.getString("deviceId"))
    val prior = if (exists(file)) revocation(parse(read(file))) else null
    check((prior?.let { revision(it) } ?: -1L) == expected && revision(next) == expected + 1) { "lifecycle_revision_stale" }
    if (prior?.getJSONObject("outcome")?.getString("kind") == "observed") {
      val old = prior.getJSONObject("outcome"); val outcome = next.getJSONObject("outcome")
      check(outcome.getString("kind") == "observed" && old.getString("workId") == outcome.getString("workId")) { "lifecycle_work_conflict" }
      if (old.getJSONObject("result").getString("kind") == "succeeded") check(outcome.getJSONObject("result").getString("kind") == "succeeded") { "lifecycle_work_conflict" }
    }
    write(file, next.toString().toByteArray()); return revocation(parse(read(file))).toString()
  }
}
