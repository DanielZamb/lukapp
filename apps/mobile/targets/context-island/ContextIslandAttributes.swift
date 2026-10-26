import ActivityKit
import Foundation

@available(iOS 16.2, *)
struct ContextIslandAttributes: ActivityAttributes {
  struct PublicContent: Codable, Hashable {
    let name: String
    let emoji: String
    let progress: Double?
  }

  struct Figure: Codable, Hashable {
    let label: String
    let value: String
  }

  enum Tone: String, Codable, Hashable {
    case `default`, positive, warning
  }

  struct ExpandedContent: Codable, Hashable {
    let figures: [Figure]
    let tone: Tone
  }

  struct ContentState: Codable, Hashable {
    let publicContent: PublicContent
    let expanded: ExpandedContent?

    var redacted: ContentState {
      ContentState(publicContent: publicContent, expanded: nil)
    }
  }

  let scope: UUID
}
