import ExpoModulesCore
import UIKit
import Darwin

private struct IOSCutoutFacts: Equatable {
  let portrait: Bool
  let windowWidth: CGFloat
  let modelIdentifier: String
  let safeAreaTop: CGFloat

  var payload: [String: Any] {
    [
      "platform": "ios",
      "portrait": portrait,
      "windowWidth": windowWidth,
      "modelIdentifier": modelIdentifier,
      "safeAreaTop": safeAreaTop
    ]
  }
}

private final class CutoutWindowObserver: UIView {
  var onChange: (() -> Void)?

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    onChange?()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    onChange?()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    onChange?()
  }
}

public final class CameraCutoutModule: Module {
  private var observing = false
  private var observer: CutoutWindowObserver?
  private var notifications: [NSObjectProtocol] = []
  private var facts: IOSCutoutFacts?
  private var revision: Int64 = 0

  public func definition() -> ModuleDefinition {
    Name("CameraCutout")
    Events("onCutoutChange")

    AsyncFunction("getSnapshot") { () -> [String: Any] in
      self.refresh()
      return self.snapshot()
    }.runOnQueue(.main)

    OnStartObserving {
      DispatchQueue.main.async { self.startObserving() }
    }
    OnStopObserving {
      DispatchQueue.main.async { self.stopObserving() }
    }
    OnAppBecomesActive {
      DispatchQueue.main.async { if self.observing { self.refresh() } }
    }
    OnAppEntersBackground {
      DispatchQueue.main.async { self.detachWindow() }
    }
    OnDestroy {
      DispatchQueue.main.async { self.stopObserving() }
    }
  }

  private func startObserving() {
    guard !observing else { return }
    observing = true
    let center = NotificationCenter.default
    for name in [UIWindow.didBecomeKeyNotification, UIWindow.didBecomeVisibleNotification] {
      notifications.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        self?.refresh()
      })
    }
    refresh()
  }

  private func stopObserving() {
    observing = false
    notifications.forEach { NotificationCenter.default.removeObserver($0) }
    notifications.removeAll()
    detachWindow()
  }

  private func detachWindow() {
    observer?.onChange = nil
    observer?.removeFromSuperview()
    observer = nil
  }

  private func refresh() {
    let window = appContext?.utilities?.currentViewController()?.viewIfLoaded?.window
    if observing && observer?.window !== window {
      detachWindow()
      if let window {
        let view = CutoutWindowObserver(frame: window.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        view.accessibilityElementsHidden = true
        view.backgroundColor = .clear
        observer = view
        view.onChange = { [weak self] in self?.refresh() }
        window.addSubview(view)
      }
    }
    let next: IOSCutoutFacts?
    if let window, window.bounds.width > 0, window.bounds.height > 0 {
      next = IOSCutoutFacts(
        portrait: window.bounds.height > window.bounds.width,
        windowWidth: window.bounds.width,
        modelIdentifier: Self.modelIdentifier(),
        safeAreaTop: window.safeAreaInsets.top
      )
    } else {
      next = nil
    }
    if next != facts {
      facts = next
      revision += 1
      if observing { sendEvent("onCutoutChange", snapshot()) }
    }
  }

  private func snapshot() -> [String: Any] {
    var payload: [String: Any] = ["revision": revision, "facts": NSNull()]
    if let facts { payload["facts"] = facts.payload }
    return payload
  }

  private static func modelIdentifier() -> String {
    #if targetEnvironment(simulator)
    if let identifier = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
      return identifier
    }
    #endif
    var system = utsname()
    guard uname(&system) == 0 else { return "" }
    return withUnsafeBytes(of: &system.machine) { bytes in
      String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
    }
  }
}
