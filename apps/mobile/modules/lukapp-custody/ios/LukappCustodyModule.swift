import ExpoModulesCore
import Security
import LocalAuthentication
import CryptoKit
import UIKit

private struct CustodyFailure: Error, LocalizedError {
  let code: String
  var errorDescription: String? { code }
}
private struct InputRecord: Codable {
  let id: String
  let content: String?
  let createdAt: Double
  let expiresAt: Double
}

public final class LukappCustodyModule: Module {
  private let mutex = NSRecursiveLock()
  private var generation = 0
  private var unlocked = false
  private var admitting = false
  private var admittedDomain: Data?
  private var foreground = true
  private var idleAt = ProcessInfo.processInfo.systemUptime
  private var backgroundAt: Double?
  private var window = 120.0
  private var workspace: String?
  private var timer: Timer?
  private var context: LAContext?
  private var mode = "live"
  private var contactTime: Double?
  private var contactUptime: Double?
  private var privacyCover: UIView?
  private var observers: [NSObjectProtocol] = []
  private var tag: Data { Data(("com.sennkai.lukapp.installation.p256." + mode).utf8) }
  private var service: String { "com.sennkai.lukapp.custody." + mode }

  public func definition() -> ModuleDefinition {
    Name("LukappCustody")
    Events("change")
    OnCreate {
      DispatchQueue.main.async {
        self.observers = [
          NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.cover() },
          NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.privacyCover?.removeFromSuperview(); self?.privacyCover = nil }
        ]
        self.timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
          self?.withLock { self?.expireWindow() }
        }
      }
    }
    OnDestroy {
      self.timer?.invalidate(); self.observers.forEach { NotificationCenter.default.removeObserver($0) }
      DispatchQueue.main.async { self.privacyCover?.removeFromSuperview() }
      self.withLock { self.block() }
    }
    OnAppEntersBackground {
      self.withLock {
        self.foreground = false
        self.admitting = false
        self.backgroundAt = ProcessInfo.processInfo.systemUptime
        self.workspace = nil
        self.generation += 1
        self.context?.invalidate()
        self.context = nil
        self.emit()
      }
    }
    OnAppEntersForeground {
      self.withLock {
        self.foreground = true
        if let at = self.backgroundAt, ProcessInfo.processInfo.systemUptime - at >= 120 { self.block() }
        self.backgroundAt = nil
        self.expireWindow()
        self.emit()
      }
    }
    Function("state") { self.withLock { self.expireWindow(); return self.snapshot() } }
    Function("lock") { self.withLock { self.block() } }
    Function("recoveryPending") { self.withLock { self.exists("recovery") } }
    Function("recoveryIntent") { (mode: String) -> String? in try self.withLock { try self.requireMode(mode); return try? String(contentsOf: self.url("recovery"), encoding: .utf8) } }
    AsyncFunction("setRecoveryIntent") { (id: String, mode: String) in try self.withLock {
      try self.requireMode(mode)
      guard !id.isEmpty, id.utf8.count <= 200 else { throw CustodyFailure(code: "recovery_intent_invalid") }
      try Data(id.utf8).write(to: self.url("recovery"), options: .atomic)
    } }
    AsyncFunction("setRecoveryPending") { (pending: Bool, mode: String) in try self.withLock {
      try self.requireMode(mode)
      if pending { try Data("retrieve".utf8).write(to: self.url("recovery"), options: .atomic) }
      else if self.exists("recovery") { try FileManager.default.removeItem(at: self.url("recovery")) }
    } }
    Function("closeInput") { self.withLock { self.admitting = false; self.workspace = nil; self.generation += 1; self.emit() } }
    Function("touch") { self.withLock { self.expireWindow(); if self.unlocked && self.admitting && self.foreground { self.idleAt = ProcessInfo.processInfo.systemUptime } } }
    Function("resumeAdmission") { () -> [String: Any?]? in try self.withLock {
      self.expireWindow()
      guard self.unlocked, self.foreground, !self.exists("wipe"), self.exists("installed") else { return nil }
      try self.checkEnrollment()
      self.admitting = true; self.emit(); return self.snapshot()
    } }
    Function("setScreen") { (screen: String) in self.withLock {
      guard screen == "ordinary" || screen == "month-close" else { return }
      self.expireWindow()
      self.window = screen == "month-close" ? 600 : 120
    } }
    AsyncFunction("initialize") { (mode: String, expected: Int) -> [String: Any?] in try self.withLock {
      guard expected == self.generation else { throw CustodyFailure(code: "custody_initialization_stale") }
      #if DEBUG
      guard mode == "live" || mode == "fixture" else { throw CustodyFailure(code: "mode_invalid") }
      #else
      guard mode == "live" else { throw CustodyFailure(code: "mode_invalid") }
      #endif
      self.block()
      self.mode = mode
      try self.directory()
      if !self.exists("installed") { try self.writeMarker("wipe") }
      return self.snapshot()
    } }
    AsyncFunction("unlock") { (reason: String, promise: Promise) in
      self.authenticate(reason: reason, promise: promise)
    }
    AsyncFunction("publicKey") { (expected: Int) -> String in try self.withLock {
      try self.requireContact(expected)
      let key = try self.signingKey(create: true)
      guard let publicKey = SecKeyCopyPublicKey(key), let bytes = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
        throw CustodyFailure(code: "public_key_unavailable")
      }
      try self.requireContact(expected)
      return self.hex(bytes)
    } }
    AsyncFunction("sign") { (message: String, expected: Int) -> [String: String] in try self.withLock {
      try self.requireContact(expected)
      let key = try self.signingKey(create: false)
      var error: Unmanaged<CFError>?
      guard let der = SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, Data(message.utf8) as CFData, &error) as Data? else {
        throw CustodyFailure(code: "signing_failed")
      }
      let raw = try P256.Signing.ECDSASignature(derRepresentation: der).rawRepresentation
      try self.requireContact(expected)
      return ["format": "p1363", "signature": self.hex(raw)]
    } }
    AsyncFunction("deleteKey") { try self.withLock { self.block(); try self.removeSigningKey() } }
    Function("enrollmentPending") { (digest: String, expected: Int) -> Bool in try self.withLock {
      try self.requireContact(expected)
      return (try? String(contentsOf: self.url("enrollment-pending"), encoding: .utf8)) == digest
    } }
    AsyncFunction("setEnrollmentPending") { (digest: String?, expected: Int) in try self.withLock {
      try self.requireContact(expected)
      if let digest {
        guard digest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw CustodyFailure(code: "digest_invalid") }
        try Data(digest.utf8).write(to: self.url("enrollment-pending"), options: .atomic)
      } else if self.exists("enrollment-pending") { try FileManager.default.removeItem(at: self.url("enrollment-pending")) }
    } }
    AsyncFunction("openInput") { (id: String, expected: Int, serverContactAt: Double) in try self.withLock {
      try self.requireContact(expected)
      guard !id.isEmpty, serverContactAt.isFinite, serverContactAt > 0 else { throw CustodyFailure(code: "workspace_required") }
      self.contactTime = serverContactAt / 1000
      self.contactUptime = ProcessInfo.processInfo.systemUptime
      _ = try self.retentionTime()
      self.workspace = id
      try Data(id.utf8).write(to: self.url("workspace"), options: .atomic)
    } }
    AsyncFunction("inputPut") { (owner: String, id: String, content: String, expected: Int) in try self.withLock {
      let scope = try self.requireInput(owner, expected)
      guard id.range(of: "^[a-zA-Z0-9_-]{1,100}$", options: .regularExpression) != nil, content.utf8.count <= 65536 else {
        throw CustodyFailure(code: "input_invalid")
      }
      var records = try self.read(owner, scope)
      let now = try self.retentionTime()
      let old = records.first { $0.id == id }
      if let old, old.content == nil || now >= old.expiresAt { throw CustodyFailure(code: "input_expired") }
      records.removeAll { $0.id == id }
      records.append(InputRecord(id: id, content: content, createdAt: old?.createdAt ?? now, expiresAt: old?.expiresAt ?? now + 1296000))
      try self.save(records, owner, scope)
      try self.requireContact(expected)
    } }
    AsyncFunction("inputList") { (owner: String, expected: Int) -> [String] in try self.withLock {
      let scope = try self.requireInput(owner, expected)
      let records = try self.read(owner, scope)
      try self.requireContact(expected)
      return records.compactMap { $0.content }
    } }
    AsyncFunction("inputDelete") { (owner: String, id: String, expected: Int) in try self.withLock {
      let scope = try self.requireInput(owner, expected)
      let records = try self.read(owner, scope).map { record in
        record.id == id ? InputRecord(id: record.id, content: nil, createdAt: record.createdAt, expiresAt: record.expiresAt) : record
      }
      try self.save(records, owner, scope)
    } }
    AsyncFunction("beginWipe") { (mode: String) in try self.withLock { try self.requireMode(mode); self.block(); try self.writeMarker("wipe"); self.emit() } }
    AsyncFunction("erase") { (mode: String) in try self.withLock {
      try self.requireMode(mode)
      self.block()
      guard self.exists("wipe") else { throw CustodyFailure(code: "wipe_marker_required") }
      for account in ["input-key", "sentinel"] { try self.removeSecret(account) }
      try self.removeSigningKey()
      for item in try FileManager.default.contentsOfDirectory(at: self.directory(), includingPropertiesForKeys: nil) {
        if item.lastPathComponent != "wipe" && item.lastPathComponent != "recovery" { try FileManager.default.removeItem(at: item) }
      }
      try self.writeMarker("erased")
    } }
    AsyncFunction("finishWipe") { (mode: String) in try self.withLock {
      try self.requireMode(mode)
      self.block()
      guard self.exists("wipe"), self.exists("erased"), !self.keyExists() else { throw CustodyFailure(code: "wipe_incomplete") }
      try self.writeMarker("installed")
      try FileManager.default.removeItem(at: self.url("erased"))
      if self.exists("wipe") { try FileManager.default.removeItem(at: self.url("wipe")) }
      self.emit()
    } }
  }

  private func withLock<T>(_ body: () throws -> T) rethrows -> T {
    mutex.lock(); defer { mutex.unlock() }; return try body()
  }
  private func requireMode(_ expected: String) throws {
    guard expected == mode else { throw CustodyFailure(code: "custody_mode_changed") }
  }
  private func cover() {
    guard privacyCover == nil,
      let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) else { return }
    let cover = UIView(frame: window.bounds)
    cover.backgroundColor = .systemBackground
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    window.addSubview(cover); privacyCover = cover
  }
  private func block() {
    unlocked = false; admitting = false; admittedDomain = nil; workspace = nil; generation += 1
    contactTime = nil; contactUptime = nil
    context?.invalidate(); context = nil; emit()
  }
  private func expireWindow() {
    if unlocked && foreground && ProcessInfo.processInfo.systemUptime - idleAt >= window { block() }
    if !UIApplication.shared.isProtectedDataAvailable && unlocked { block() }
  }
  private func emit() { sendEvent("change", snapshot()) }
  private func snapshot() -> [String: Any?] {
    var protection = "secure-enclave"
    #if DEBUG && targetEnvironment(simulator)
    protection = "simulator-native-software-key"
    #endif
    return ["mode": mode, "generation": generation, "unlocked": unlocked && admitting && foreground, "wipePending": exists("wipe"),
      "installed": exists("installed"), "workspaceId": workspace, "keyPresent": keyExists(), "protection": protection,
      "savedWorkspaceId": (try? Data(contentsOf: url("workspace"))).flatMap { String(data: $0, encoding: .utf8) }]
  }
  private func requireContact(_ expected: Int) throws {
    expireWindow()
    guard expected == generation, unlocked, admitting, foreground, !exists("wipe"), exists("installed") else { throw CustodyFailure(code: "native_locked") }
    try checkEnrollment()
  }
  private func checkEnrollment() throws {
    let auth = LAContext()
    guard auth.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil),
      let domain = admittedDomain, auth.evaluatedPolicyDomainState == domain else {
      block(); throw CustodyFailure(code: "enrollment_changed")
    }
  }
  private func requireInput(_ owner: String, _ expected: Int) throws -> String {
    try requireContact(expected)
    guard owner == "draft" || owner == "candidate", let scope = workspace else { throw CustodyFailure(code: "input_not_admitted") }
    return scope
  }
  @discardableResult private func directory() throws -> URL {
    var dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("LukappDeviceOnly-" + mode, isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try dir.setResourceValues(values)
    return dir
  }
  private func url(_ name: String) throws -> URL { try directory().appendingPathComponent(name) }
  private func exists(_ name: String) -> Bool { (try? url(name)).map { FileManager.default.fileExists(atPath: $0.path) } ?? false }
  private func writeMarker(_ name: String) throws { try Data([1]).write(to: url(name), options: .atomic) }
  private func keyExists() -> Bool {
    var result: CFTypeRef?
    return SecItemCopyMatching([kSecClass: kSecClassKey, kSecAttrApplicationTag: tag, kSecReturnRef: true] as CFDictionary, &result) == errSecSuccess
  }
  private func signingKey(create: Bool) throws -> SecKey {
    var result: CFTypeRef?
    let status = SecItemCopyMatching([kSecClass: kSecClassKey, kSecAttrApplicationTag: tag, kSecReturnRef: true] as CFDictionary, &result)
    if status == errSecSuccess, let result {
      let key = result as! SecKey
      try requireSigningProtection(key)
      return key
    }
    guard status == errSecItemNotFound, create else { throw CustodyFailure(code: "installation_key_lost") }
    guard let control = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, .privateKeyUsage, nil) else {
      throw CustodyFailure(code: "key_protection_unavailable")
    }
    var attributes: [CFString: Any] = [
      kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom, kSecAttrKeySizeInBits: 256,
      kSecPrivateKeyAttrs: [kSecAttrIsPermanent: true, kSecAttrApplicationTag: tag, kSecAttrAccessControl: control]
    ]
    #if DEBUG && targetEnvironment(simulator)
    #else
    attributes[kSecAttrTokenID] = kSecAttrTokenIDSecureEnclave
    #endif
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, nil) else { throw CustodyFailure(code: "secure_enclave_unavailable") }
    try requireSigningProtection(key)
    return key
  }
  private func requireSigningProtection(_ key: SecKey) throws {
    #if DEBUG && targetEnvironment(simulator)
    #else
    let attributes = SecKeyCopyAttributes(key) as? [CFString: Any]
    guard attributes?[kSecAttrTokenID] as? String == kSecAttrTokenIDSecureEnclave as String else { throw CustodyFailure(code: "secure_enclave_unavailable") }
    #endif
  }
  private func removeSigningKey() throws {
    let status = SecItemDelete([kSecClass: kSecClassKey, kSecAttrApplicationTag: tag] as CFDictionary)
    if status != errSecSuccess && status != errSecItemNotFound { throw CustodyFailure(code: "key_deletion_failed") }
  }
  private func secret(_ account: String, context: LAContext? = nil) throws -> Data? {
    var query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account, kSecReturnData: true]
    if let context { query[kSecUseAuthenticationContext] = context }
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else { throw CustodyFailure(code: "enrollment_or_key_changed") }
    return data
  }
  private func putSecret(_ account: String, data: Data, biometric: Bool) throws {
    var query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account, kSecValueData: data]
    if biometric {
      guard let control = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, .biometryCurrentSet, nil) else { throw CustodyFailure(code: "biometry_unavailable") }
      query[kSecAttrAccessControl] = control
    } else { query[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly }
    guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw CustodyFailure(code: "key_storage_failed") }
  }
  private func removeSecret(_ account: String) throws {
    let status = SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account] as CFDictionary)
    if status != errSecSuccess && status != errSecItemNotFound { throw CustodyFailure(code: "key_deletion_failed") }
  }
  private func authenticate(reason: String, promise: Promise) {
    let attempt = withLock { () -> Int in block(); return generation }
    let auth = LAContext()
    auth.localizedFallbackTitle = ""
    var error: NSError?
    guard auth.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
      promise.reject("biometry_unavailable", "Full online sign-in is required"); return
    }
    withLock { context = auth }
    auth.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, _ in
      do {
        let state = try self.withLock { () -> [String: Any?] in
          guard success, self.generation == attempt, self.foreground, !self.exists("wipe") else { throw CustodyFailure(code: "unlock_declined_or_stale") }
          if let sentinel = try self.secret("sentinel", context: auth) {
            guard sentinel == auth.evaluatedPolicyDomainState else { throw CustodyFailure(code: "enrollment_changed") }
          } else {
            guard !self.keyExists(), let domain = auth.evaluatedPolicyDomainState else { throw CustodyFailure(code: "enrollment_sentinel_lost") }
            try self.putSecret("sentinel", data: domain, biometric: true)
          }
          self.admittedDomain = auth.evaluatedPolicyDomainState
          self.unlocked = true; self.admitting = true; self.idleAt = ProcessInfo.processInfo.systemUptime
          self.context = nil; self.emit(); return self.snapshot()
        }
        promise.resolve(state)
      } catch { promise.reject("unlock_required", error.localizedDescription) }
    }
  }
  private func inputKey() throws -> SymmetricKey {
    if let bytes = try secret("input-key") { return SymmetricKey(data: bytes) }
    let key = SymmetricKey(size: .bits256)
    try key.withUnsafeBytes { try putSecret("input-key", data: Data($0), biometric: false) }
    return key
  }
  private func storeURL(_ owner: String, _ scope: String) throws -> URL {
    let digest = hex(Data(SHA256.hash(data: Data(scope.utf8))))
    return try url(owner + "-" + digest + ".db")
  }
  private func retentionTime() throws -> Double {
    guard let contactTime, let contactUptime else { throw CustodyFailure(code: "input_not_admitted") }
    let now = contactTime + ProcessInfo.processInfo.systemUptime - contactUptime
    let path = try url("clock")
    if let bytes = try? Data(contentsOf: path), let value = String(data: bytes, encoding: .utf8), let previous = Double(value), now < previous {
      for item in try FileManager.default.contentsOfDirectory(at: directory(), includingPropertiesForKeys: nil) where item.pathExtension == "db" { try FileManager.default.removeItem(at: item) }
      try removeSecret("input-key")
      throw CustodyFailure(code: "input_clock_uncertain")
    }
    try Data(String(now).utf8).write(to: path, options: .atomic)
    return now
  }
  private func read(_ owner: String, _ scope: String) throws -> [InputRecord] {
    let now = try retentionTime()
    let path = try storeURL(owner, scope)
    guard FileManager.default.fileExists(atPath: path.path) else { return [] }
    let box = try AES.GCM.SealedBox(combined: Data(contentsOf: path))
    let data = try AES.GCM.open(box, using: inputKey(), authenticating: Data((owner + ":" + scope).utf8))
    let all = try JSONDecoder().decode([InputRecord].self, from: data)
    let kept = all.map { record in
      now < record.createdAt || now >= record.expiresAt
        ? InputRecord(id: record.id, content: nil, createdAt: record.createdAt, expiresAt: record.expiresAt) : record
    }
    if zip(all, kept).contains(where: { $0.0.content != $0.1.content }) { try save(kept, owner, scope) }
    return kept
  }
  private func save(_ records: [InputRecord], _ owner: String, _ scope: String) throws {
    let bytes = try JSONEncoder().encode(records)
    let sealed = try AES.GCM.seal(bytes, using: inputKey(), authenticating: Data((owner + ":" + scope).utf8))
    guard let combined = sealed.combined else { throw CustodyFailure(code: "encryption_failed") }
    try combined.write(to: storeURL(owner, scope), options: .atomic)
  }
  private func hex(_ bytes: Data) -> String { bytes.map { String(format: "%02x", $0) }.joined() }
}
