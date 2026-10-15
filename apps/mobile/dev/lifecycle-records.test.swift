import Foundation

@main struct LifecycleTest {
  static func main() throws {
    let root = URL(fileURLWithPath: CommandLine.arguments[1]); try? FileManager.default.removeItem(at: root); try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    func rejects(_ code: String, _ operation: () throws -> Void) throws {
      do { try operation(); fatalError("expected failure " + code) } catch let error as LifecycleMetadataFailure { precondition(error.code == code) }
    }
    try Data("intent2".utf8).write(to: root.appendingPathComponent("recovery")); try Data("work1".utf8).write(to: root.appendingPathComponent("recovery-work"))
    let interrupted = LifecycleRecords(root: root) { data, file in try data.write(to: file, options: .atomic); throw LifecycleMetadataFailure(code: "simulated_process_exit_after_commit") }
    try rejects("simulated_process_exit_after_commit") { _ = try interrupted.readRecovery() }
    precondition(FileManager.default.fileExists(atPath: root.appendingPathComponent("recovery").path))
    let records = LifecycleRecords(root: root); let migrated = try records.readRecovery()
    precondition((migrated["intent"] as? [String: String])?["intentId"] == "intent2" && (migrated["cleanup"] as? [String: String])?["workId"] == "work1")
    precondition(!FileManager.default.fileExists(atPath: root.appendingPathComponent("recovery-work").path))
    func json(_ value: [String: Any]) throws -> String { String(decoding: try JSONSerialization.data(withJSONObject: value), as: UTF8.self) }
    var available = migrated; available["revision"] = 1; available["cleanup"] = ["kind": "none"]
    _ = try records.writeRecovery(json(available), expected: 0)
    try rejects("lifecycle_revision_stale") { _ = try records.writeRecovery(json(available), expected: 0) }
    var completed = available; completed["revision"] = 2; completed["intent"] = ["kind": "none"]; completed["cleanup"] = ["kind": "work", "workId": "work2"]
    _ = try records.writeRecovery(json(completed), expected: 1)
    let restartedRecovery = try LifecycleRecords(root: root).readRecovery(); precondition((restartedRecovery["cleanup"] as? [String: String])?["workId"] == "work2")
    let unknown: [String: Any] = ["version": 1, "revision": 0, "deviceId": "device2", "outcome": ["kind": "response-unknown"]]
    _ = try records.writeRevocation(json(unknown), expected: -1)
    var observed = unknown; observed["revision"] = 1; observed["outcome"] = ["kind": "observed", "workId": "work2", "result": ["kind": "pending", "nextAttemptAt": 7000]]
    _ = try records.writeRevocation(json(observed), expected: 0)
    var other = unknown; other["deviceId"] = "device3"; _ = try records.writeRevocation(json(other), expected: -1)
    var downgrade = unknown; downgrade["revision"] = 2
    try rejects("lifecycle_work_conflict") { _ = try records.writeRevocation(json(downgrade), expected: 1) }
    let restartedRevocations = try LifecycleRecords(root: root).readRevocations(); precondition(restartedRevocations.count == 2)
    precondition(!LifecycleRecords.preserved("input.sqlite") && !LifecycleRecords.preserved("unknown-artifact") && LifecycleRecords.preserved("revocations") && LifecycleRecords.preserved("installed"))
    try Data("{\"version\":2,\"revision\":0,\"intent\":{\"kind\":\"none\"},\"cleanup\":{\"kind\":\"none\"},\"extra\":true}".utf8).write(to: root.appendingPathComponent("recovery-v2.json"))
    try rejects("lifecycle_metadata_invalid") { _ = try records.readRecovery() }
    let corrupt = try String(contentsOf: root.appendingPathComponent("recovery-v2.json"), encoding: .utf8); precondition(corrupt.contains("extra"))
    try Data("{broken".utf8).write(to: root.appendingPathComponent("recovery-v2.json"))
    do { _ = try records.readRecovery(); print("FAIL malformed metadata accepted"); exit(1) }
    catch let error as LifecycleMetadataFailure { precondition(error.code == "lifecycle_metadata_invalid") }
    catch { print("FAIL malformed metadata did not return lifecycle_metadata_invalid"); exit(1) }
    print("PASS iOS native lifecycle migration/crash/restart/CAS/two-target/no-downgrade/corruption/routing classification")
  }
}
