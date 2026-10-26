import ActivityKit
import ExpoModulesCore
import Foundation
import UIKit

private enum ContextIslandError: String, Error, LocalizedError {
  case unsupported = "ContextIsland requires iOS 18 or later."
  case invalidScope = "ContextIsland scope must be a canonical UUID."
  case invalidPayload = "ContextIsland content is invalid or exceeds its display limits."
  case notAdmitted = "ContextIsland requires explicit admission in the active, unlocked app."
  case busy = "ContextIsland already has an active or pending scope."
  case closedScope = "ContextIsland scope is closed. Use a new scope for an explicit request."

  var errorDescription: String? { rawValue }
}

private func parseContextIslandScope(_ value: String) throws -> UUID {
  guard let scope = UUID(uuidString: value), scope.uuidString.lowercased() == value.lowercased() else {
    throw ContextIslandError.invalidScope
  }
  return scope
}

private struct ContextIslandFigureInput: Record {
  @Field var label: String = ""
  @Field var value: String = ""
}

private struct ContextIslandInput: Record {
  @Field var scope: String = ""
  @Field var name: String = ""
  @Field var emoji: String = ""
  @Field var progress: Double? = nil
  @Field var figures: [ContextIslandFigureInput] = []
  @Field var tone: String = "default"

  @available(iOS 18.0, *)
  func validated() throws -> (UUID, ContextIslandAttributes.ContentState) {
    let id = try parseContextIslandScope(scope)
    func validText(_ text: String, limit: Int) -> Bool {
      !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.utf8.count <= limit
    }
    guard validText(name, limit: 256), validText(emoji, limit: 64),
      (1...2).contains(figures.count),
      figures.allSatisfy({ validText($0.label, limit: 256) && validText($0.value, limit: 128) }),
      let tone = ContextIslandAttributes.Tone(rawValue: tone) else {
      throw ContextIslandError.invalidPayload
    }
    if let progress, !progress.isFinite || !(0...1).contains(progress) {
      throw ContextIslandError.invalidPayload
    }
    let state = ContextIslandAttributes.ContentState(
      publicContent: .init(name: name, emoji: emoji, progress: progress),
      expanded: .init(figures: figures.map { .init(label: $0.label, value: $0.value) }, tone: tone)
    )
    guard try JSONEncoder().encode(state).count <= 3500 else {
      throw ContextIslandError.invalidPayload
    }
    return (id, state)
  }
}

public final class ContextIslandModule: Module {
  private var implementation: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("ContextIsland")
    Events("onActivityState")

    OnCreate {
      DispatchQueue.main.async {
        if #available(iOS 18.0, *) { _ = self.controller() }
      }
    }

    AsyncFunction("getCapability") { () async -> [String: Bool] in
      guard #available(iOS 18.0, *) else { return ["supported": false, "enabled": false] }
      return await self.controller().capability()
    }

    AsyncFunction("setAdmission") { (admitted: Bool) async throws in
      guard #available(iOS 18.0, *) else {
        if admitted { throw ContextIslandError.unsupported }
        return
      }
      try await self.controller().setAdmission(admitted)
    }

    AsyncFunction("request") { (input: ContextIslandInput) async throws -> [String: Any] in
      guard #available(iOS 18.0, *) else { throw ContextIslandError.unsupported }
      let (scope, content) = try input.validated()
      return try await self.controller().request(scope: scope, content: content)
    }

    AsyncFunction("update") { (input: ContextIslandInput) async throws in
      guard #available(iOS 18.0, *) else { throw ContextIslandError.unsupported }
      let (scope, content) = try input.validated()
      try await self.controller().update(scope: scope, content: content)
    }

    AsyncFunction("end") { (scope: String) async throws in
      let id = try parseContextIslandScope(scope)
      if #available(iOS 18.0, *) { await self.controller().end(scope: id) }
    }

    AsyncFunction("endAll") { () async in
      if #available(iOS 18.0, *) { await self.controller().endAll() }
    }

    OnDestroy {
      DispatchQueue.main.async {
        if #available(iOS 18.0, *), let controller = self.implementation as? ContextIslandController {
          controller.shutdown()
        }
      }
    }
  }

  @available(iOS 18.0, *)
  @MainActor private func controller() -> ContextIslandController {
    if let controller = implementation as? ContextIslandController { return controller }
    let controller = ContextIslandController { [weak self] event in
      self?.sendEvent("onActivityState", event)
    }
    implementation = controller
    return controller
  }
}

@available(iOS 18.0, *)
@MainActor private final class ContextIslandController: NSObject {
  typealias Island = Activity<ContextIslandAttributes>
  typealias Content = ContextIslandAttributes.ContentState

  private enum ObservationState: String {
    case active, dismissed, ended
  }

  private final class Session {
    let activity: Island
    let scope: UUID
    var observation: Task<Void, Never>?
    var operation: Task<Void, Never>?
    var snapshot: [String: Any]

    init(activity: Island, scope: UUID, snapshot: [String: Any]) {
      self.activity = activity
      self.scope = scope
      self.snapshot = snapshot
    }
  }

  private let emit: ([String: Any]) -> Void
  private var admitted = false
  private var destroyed = false
  private var current: Session?
  private var pending: (ticket: UUID, scope: UUID)?
  private var consumedScopes: Set<UUID> = []
  private var revision: Int64 = 0
  private var cleanup: Task<Void, Never>?

  init(emit: @escaping ([String: Any]) -> Void) {
    self.emit = emit
    super.init()
    let center = NotificationCenter.default
    for name in [UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification,
                 UIApplication.protectedDataWillBecomeUnavailableNotification] {
      center.addObserver(self, selector: #selector(invalidateFromSystem), name: name, object: nil)
    }
    queueEnd(Island.activities, operation: nil)
  }

  func capability() -> [String: Bool] {
    ["supported": true, "enabled": ActivityAuthorizationInfo().areActivitiesEnabled]
  }

  private var foreground: Bool {
    !destroyed && UIApplication.shared.applicationState == .active && UIApplication.shared.isProtectedDataAvailable
  }

  func setAdmission(_ value: Bool) async throws {
    if value {
      guard foreground else { throw ContextIslandError.notAdmitted }
      admitted = true
    } else {
      await endAll()
    }
  }

  func request(scope: UUID, content: Content) async throws -> [String: Any] {
    guard admitted && foreground else { throw ContextIslandError.notAdmitted }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw ContextIslandError.unsupported }
    if let session = current, session.scope == scope {
      observe(session.activity.activityState, session: session)
      return session.snapshot
    }
    guard current == nil && pending == nil else { throw ContextIslandError.busy }
    guard !consumedScopes.contains(scope) else { throw ContextIslandError.closedScope }
    let ticket = UUID()
    pending = (ticket, scope)
    consumedScopes.insert(scope)
    defer { if pending?.ticket == ticket { pending = nil } }
    let barrier = cleanup
    await barrier?.value
    guard pending?.ticket == ticket, admitted && foreground else { throw ContextIslandError.notAdmitted }
    let activity = try Island.request(
      attributes: ContextIslandAttributes(scope: scope),
      content: ActivityContent(state: content, staleDate: nil),
      pushType: nil,
      style: .transient
    )
    let snapshot = event(scope: scope, state: .active)
    let session = Session(activity: activity, scope: scope, snapshot: snapshot)
    current = session
    emit(snapshot)
    session.observation = Task { @MainActor [weak self, weak session] in
      guard let session else { return }
      for await state in activity.activityStateUpdates {
        guard !Task.isCancelled else { return }
        self?.observe(state, session: session)
      }
    }
    observe(activity.activityState, session: session)
    return session.snapshot
  }

  func update(scope: UUID, content: Content) async throws {
    guard admitted && foreground else { throw ContextIslandError.notAdmitted }
    guard let session = current, session.scope == scope else { throw ContextIslandError.closedScope }
    observe(session.activity.activityState, session: session)
    guard current === session else { throw ContextIslandError.closedScope }
    let previous = session.operation
    let operation = Task { @MainActor [weak self, weak session] in
      await previous?.value
      guard let self, let session, self.current === session, self.admitted && self.foreground else { return }
      self.observe(session.activity.activityState, session: session)
      guard self.current === session else { return }
      await session.activity.update(ActivityContent(state: content, staleDate: nil))
    }
    session.operation = operation
    await operation.value
  }

  func end(scope: UUID) async {
    consumedScopes.insert(scope)
    if pending?.scope == scope { pending = nil }
    guard let session = current, session.scope == scope else { return }
    finish(session, state: .ended)
    let barrier = cleanup
    await barrier?.value
  }

  func endAll() async {
    invalidateAdmission()
    let barrier = cleanup
    await barrier?.value
  }

  func shutdown() {
    destroyed = true
    NotificationCenter.default.removeObserver(self)
    invalidateAdmission()
  }

  @objc private func invalidateFromSystem(_ notification: Notification) {
    invalidateAdmission()
  }

  private func invalidateAdmission() {
    admitted = false
    pending = nil
    if let session = current { finish(session, state: .ended) }
    queueEnd(Island.activities, operation: nil)
  }

  private func observe(_ state: ActivityState, session: Session) {
    guard current === session else { return }
    switch state {
    case .active: break
    case .dismissed: finish(session, state: .dismissed)
    case .ended, .stale: finish(session, state: .ended)
    @unknown default: finish(session, state: .ended)
    }
  }

  private func finish(_ session: Session, state: ObservationState) {
    guard current === session else { return }
    current = nil
    session.observation?.cancel()
    session.snapshot = event(scope: session.scope, state: state)
    emit(session.snapshot)
    queueEnd([session.activity], operation: session.operation)
  }

  private func event(scope: UUID, state: ObservationState) -> [String: Any] {
    revision += 1
    return ["scope": scope.uuidString.lowercased(), "state": state.rawValue, "revision": revision]
  }

  private func queueEnd(_ activities: [Island], operation: Task<Void, Never>?) {
    guard !activities.isEmpty else { return }
    let previous = cleanup
    let endings = activities.map { ($0, $0.content.state.redacted) }
    cleanup = Task { @MainActor in
      for (activity, redacted) in endings {
        await activity.end(ActivityContent(state: redacted, staleDate: nil), dismissalPolicy: .immediate)
      }
      if let operation {
        await operation.value
        for (activity, redacted) in endings {
          await activity.end(ActivityContent(state: redacted, staleDate: nil), dismissalPolicy: .immediate)
        }
      }
      await previous?.value
    }
  }
}
