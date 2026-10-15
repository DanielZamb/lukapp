import Foundation
import CoreFoundation

struct LifecycleMetadataFailure: Error, LocalizedError {
  let code: String
  var errorDescription: String? { code }
}

final class LifecycleRecords {
  private let root: URL
  private let write: (Data, URL) throws -> Void
  init(root: URL, write: @escaping (Data, URL) throws -> Void = { try $0.write(to: $1, options: .atomic) }) { self.root = root; self.write = write }
  static func preserved(_ name: String) -> Bool { ["installed", "erased", "wipe", "recovery", "recovery-work", "recovery-v2.json", "revocations"].contains(name) }
  private func require(_ valid: Bool, _ code: String = "lifecycle_metadata_invalid") throws { if !valid { throw LifecycleMetadataFailure(code: code) } }
  private func fields(_ value: [String: Any], _ required: Set<String>, _ optional: Set<String> = []) throws {
    try require(required.isSubset(of: Set(value.keys)) && Set(value.keys).isSubset(of: required.union(optional)))
  }
  private func id(_ value: Any?) throws -> String { guard let value = value as? String, !value.isEmpty, value.utf8.count <= 200 else { throw LifecycleMetadataFailure(code: "lifecycle_metadata_invalid") }; return value }
  private func number(_ value: Any?) throws -> Double {
    guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue.isFinite else { throw LifecycleMetadataFailure(code: "lifecycle_metadata_invalid") }; return value.doubleValue
  }
  private func revision(_ value: [String: Any]) throws -> Double { let n = try number(value["revision"]); try require(n >= 0 && n <= 9007199254740990 && n.rounded() == n); return n }
  private func object(_ value: Any?) throws -> [String: Any] { guard let value = value as? [String: Any] else { throw LifecycleMetadataFailure(code: "lifecycle_metadata_invalid") }; return value }
  private func parse(_ data: Data) throws -> [String: Any] {
    do { return try object(JSONSerialization.jsonObject(with: data)) }
    catch { throw LifecycleMetadataFailure(code: "lifecycle_metadata_invalid") }
  }
  private func decode(_ file: URL) throws -> [String: Any] { try parse(Data(contentsOf: file)) }
  private func encode(_ value: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
  private func provider(_ value: [String: Any]) throws {
    switch value["kind"] as? String {
    case "pending":
      try fields(value, ["kind", "nextAttemptAt"], ["error"]); _ = try number(value["nextAttemptAt"])
      if let error = value["error"] { try require(["provider_configuration_required", "provider_instance_mismatch", "provider_unavailable", "provider_provenance_mismatch", "provider_session_invalid", "provider_session_terminal", "recovery_fresh_sign_in_required", "recovery_intent_expired", "recovery_conflict"].contains(try id(error))) }
    case "succeeded": try fields(value, ["kind", "at"]); _ = try number(value["at"])
    default: throw LifecycleMetadataFailure(code: "lifecycle_metadata_invalid")
    }
  }
  private func recovery(_ value: [String: Any]) throws -> [String: Any] {
    try fields(value, ["version", "revision", "intent", "cleanup"]); try require(try number(value["version"]) == 2); _ = try revision(value)
    let intent = try object(value["intent"])
    switch intent["kind"] as? String {
    case "none", "retrieve": try fields(intent, ["kind"])
    case "exact": try fields(intent, ["kind", "intentId"]); _ = try id(intent["intentId"])
    default: throw LifecycleMetadataFailure(code: "lifecycle_metadata_invalid")
    }
    let cleanup = try object(value["cleanup"])
    switch cleanup["kind"] as? String {
    case "none": try fields(cleanup, ["kind"])
    case "work": try fields(cleanup, ["kind", "workId"]); _ = try id(cleanup["workId"])
    default: throw LifecycleMetadataFailure(code: "lifecycle_metadata_invalid")
    }
    return value
  }
  private func revocation(_ value: [String: Any]) throws -> [String: Any] {
    try fields(value, ["version", "revision", "deviceId", "outcome"]); try require(try number(value["version"]) == 1); _ = try revision(value); _ = try id(value["deviceId"])
    let outcome = try object(value["outcome"])
    switch outcome["kind"] as? String {
    case "response-unknown": try fields(outcome, ["kind"])
    case "observed": try fields(outcome, ["kind", "workId", "result"]); _ = try id(outcome["workId"]); try provider(try object(outcome["result"]))
    default: throw LifecycleMetadataFailure(code: "lifecycle_metadata_invalid")
    }
    return value
  }
  private func exists(_ file: URL) -> Bool { FileManager.default.fileExists(atPath: file.path) }
  func readRecovery() throws -> [String: Any] {
    let file = root.appendingPathComponent("recovery-v2.json")
    let value: [String: Any]
    if exists(file) { value = try recovery(decode(file)) }
    else {
      let oldIntent = root.appendingPathComponent("recovery"); let oldWork = root.appendingPathComponent("recovery-work")
      var intent: [String: Any] = ["kind": "none"]; var cleanup: [String: Any] = ["kind": "none"]
      if exists(oldIntent) { let saved = try id(String(contentsOf: oldIntent, encoding: .utf8)); intent = saved == "retrieve" ? ["kind": "retrieve"] : ["kind": "exact", "intentId": saved] }
      if exists(oldWork) { cleanup = ["kind": "work", "workId": try id(String(contentsOf: oldWork, encoding: .utf8))] }
      let next = try recovery(["version": 2, "revision": 0, "intent": intent, "cleanup": cleanup]); try write(encode(next), file); value = try recovery(decode(file))
    }
    for name in ["recovery", "recovery-work"] { let old = root.appendingPathComponent(name); if exists(old) { try FileManager.default.removeItem(at: old) } }
    return value
  }
  func recoveryJSON() throws -> String { String(decoding: try encode(readRecovery()), as: UTF8.self) }
  func writeRecovery(_ raw: String, expected: Double) throws -> String {
    let next = try recovery(parse(Data(raw.utf8)))
    try require(try revision(readRecovery()) == expected && revision(next) == expected + 1, "lifecycle_revision_stale")
    try write(encode(next), root.appendingPathComponent("recovery-v2.json")); return try recoveryJSON()
  }
  private func target(_ device: String) throws -> URL {
    let dir = root.appendingPathComponent("revocations", isDirectory: true); try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent(try id(device).utf8.map { String(format: "%02x", $0) }.joined() + ".json")
  }
  func readRevocations() throws -> [[String: Any]] {
    let dir = root.appendingPathComponent("revocations", isDirectory: true); if !exists(dir) { return [] }
    return try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil).sorted { $0.lastPathComponent < $1.lastPathComponent }.map { file in
      let value = try revocation(decode(file)); try require(try target(id(value["deviceId"])).lastPathComponent == file.lastPathComponent); return value
    }
  }
  func revocationsJSON() throws -> [String] { try readRevocations().map { String(decoding: try encode($0), as: UTF8.self) } }
  func writeRevocation(_ raw: String, expected: Double) throws -> String {
    let next = try revocation(parse(Data(raw.utf8))); let file = try target(id(next["deviceId"]))
    let prior = exists(file) ? try revocation(decode(file)) : nil
    try require(try (prior.map { try revision($0) } ?? -1) == expected && revision(next) == expected + 1, "lifecycle_revision_stale")
    if let prior, let old = prior["outcome"] as? [String: Any], old["kind"] as? String == "observed" {
      let outcome = try object(next["outcome"])
      try require(outcome["kind"] as? String == "observed" && old["workId"] as? String == outcome["workId"] as? String, "lifecycle_work_conflict")
      if try object(old["result"])["kind"] as? String == "succeeded" { try require(try object(outcome["result"])["kind"] as? String == "succeeded", "lifecycle_work_conflict") }
    }
    try write(encode(next), file); return String(decoding: try encode(revocation(decode(file))), as: UTF8.self)
  }
}
