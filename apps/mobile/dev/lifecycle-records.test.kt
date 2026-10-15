package expo.modules.lukappcustody

import java.io.File
import java.nio.file.Files
import org.json.JSONObject

fun main(args: Array<String>) {
  val root = File(args[0]); root.deleteRecursively(); check(root.mkdirs())
  fun writer(file: File, bytes: ByteArray) { Files.write(file.toPath(), bytes) }
  fun rejects(code: String, block: () -> Unit) { try { block(); error("expected $code") } catch (error: IllegalStateException) { check(error.message == code) { error.message ?: "wrong failure" } } }
  File(root, "recovery").writeText("intent2"); File(root, "recovery-work").writeText("work1")
  var crashed = false
  val interrupted = LifecycleRecords(root, { file, bytes -> writer(file, bytes); crashed = true; error("simulated_process_exit_after_commit") })
  rejects("simulated_process_exit_after_commit") { interrupted.readRecovery() }
  check(crashed && File(root, "recovery").exists() && File(root, "recovery-work").exists())
  val records = LifecycleRecords(root, ::writer)
  val migrated = records.readRecovery()
  check(migrated.getJSONObject("intent").getString("intentId") == "intent2" && migrated.getJSONObject("cleanup").getString("workId") == "work1")
  check(!File(root, "recovery").exists() && !File(root, "recovery-work").exists())
  val available = JSONObject(migrated.toString()).put("revision", 1).put("cleanup", JSONObject().put("kind", "none"))
  records.writeRecovery(available.toString(), 0)
  rejects("lifecycle_revision_stale") { records.writeRecovery(available.toString(), 0) }
  val complete = JSONObject(available.toString()).put("revision", 2).put("intent", JSONObject().put("kind", "none")).put("cleanup", JSONObject().put("kind", "work").put("workId", "work2"))
  records.writeRecovery(complete.toString(), 1)
  check(LifecycleRecords(root, ::writer).readRecovery().getJSONObject("cleanup").getString("workId") == "work2")
  val unknown = JSONObject("""{"version":1,"revision":0,"deviceId":"device2","outcome":{"kind":"response-unknown"}}""")
  records.writeRevocation(unknown.toString(), -1)
  val observed = JSONObject(unknown.toString()).put("revision", 1).put("outcome", JSONObject("""{"kind":"observed","workId":"work2","result":{"kind":"pending","nextAttemptAt":7000}}"""))
  records.writeRevocation(observed.toString(), 0)
  val other = JSONObject(unknown.toString()).put("deviceId", "device3"); records.writeRevocation(other.toString(), -1)
  rejects("lifecycle_work_conflict") { records.writeRevocation(JSONObject(unknown.toString()).put("revision", 2).toString(), 1) }
  check(LifecycleRecords(root, ::writer).readRevocations().size == 2)
  check(!LifecycleRecords.preserved("input.sqlite") && !LifecycleRecords.preserved("unknown-artifact") && LifecycleRecords.preserved("revocations") && LifecycleRecords.preserved("installed"))
  File(root, "recovery-v2.json").writeText("""{"version":2,"revision":0,"intent":{"kind":"none"},"cleanup":{"kind":"none"},"extra":true}""")
  rejects("lifecycle_metadata_invalid") { records.readRecovery() }
  check(File(root, "recovery-v2.json").readText().contains("extra"))
  File(root, "recovery-v2.json").writeText("{broken")
  rejects("lifecycle_metadata_invalid") { records.readRecovery() }
  println("PASS Android native lifecycle migration/crash/restart/CAS/two-target/no-downgrade/corruption/routing classification")
}
