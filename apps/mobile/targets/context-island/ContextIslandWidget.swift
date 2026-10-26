import ActivityKit
import SwiftUI
import WidgetKit

private enum IslandPalette {
  static let accent = Color(red: 196.0 / 255, green: 181.0 / 255, blue: 253.0 / 255)
  static let button = Color(red: 167.0 / 255, green: 139.0 / 255, blue: 250.0 / 255)
  static let positive = Color(red: 74.0 / 255, green: 222.0 / 255, blue: 128.0 / 255)
  static let warning = Color(red: 252.0 / 255, green: 165.0 / 255, blue: 165.0 / 255)
}

@main
struct ContextIslandWidgetBundle: WidgetBundle {
  var body: some Widget {
    ContextIslandWidget()
  }
}

struct ContextIslandWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ContextIslandAttributes.self) { context in
      PublicSummary(content: context.state.publicContent)
        .padding(16)
        .activityBackgroundTint(.black)
        .activitySystemActionForegroundColor(IslandPalette.accent)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading, priority: 1) {
          PublicHeader(content: context.state.publicContent)
            .dynamicIsland(verticalPlacement: .belowIfTooWide)
        }
        DynamicIslandExpandedRegion(.bottom) {
          ExpandedContext(
            scope: context.attributes.scope,
            content: context.state,
            stale: context.isStale
          )
        }
      } compactLeading: {
        PublicEmoji(content: context.state.publicContent)
      } compactTrailing: {
        PublicProgress(content: context.state.publicContent)
      } minimal: {
        PublicEmoji(content: context.state.publicContent)
      }
      .keylineTint(IslandPalette.accent)
    }
  }
}

private struct PublicHeader: View {
  let content: ContextIslandAttributes.PublicContent

  var body: some View {
    HStack(spacing: 6) {
      Text(content.emoji).accessibilityHidden(true)
      Text(content.name)
        .lineLimit(1)
        .truncationMode(.tail)
    }
    .font(.headline)
    .foregroundStyle(.white)
    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(content.name))
  }
}

private struct PublicEmoji: View {
  let content: ContextIslandAttributes.PublicContent

  var body: some View {
    Text(content.emoji)
      .font(.body)
      .accessibilityLabel(Text(content.name))
  }
}

private struct PublicProgress: View {
  let content: ContextIslandAttributes.PublicContent

  var body: some View {
    Group {
      if let progress = content.progress {
        ZStack {
          Circle().stroke(IslandPalette.accent.opacity(0.25), lineWidth: 3)
          Circle()
            .trim(from: 0, to: CGFloat(progress))
            .stroke(IslandPalette.accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
            .rotationEffect(.degrees(-90))
        }
        .accessibilityValue(Text(progress, format: .percent.precision(.fractionLength(0))))
      } else {
        Image(systemName: "circle.dotted")
          .foregroundStyle(IslandPalette.accent)
      }
    }
    .frame(width: 18, height: 18)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(content.name))
  }
}

private struct PublicSummary: View {
  let content: ContextIslandAttributes.PublicContent

  var body: some View {
    HStack(spacing: 12) {
      PublicHeader(content: content)
      Spacer(minLength: 8)
      PublicProgress(content: content)
    }
    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
  }
}

private struct ExpandedContext: View {
  @Environment(\.isLuminanceReduced) private var luminanceReduced
  let scope: UUID
  let content: ContextIslandAttributes.ContentState
  let stale: Bool

  var body: some View {
    Group {
      if !luminanceReduced, !stale, let expanded = content.expanded {
        ViewThatFits(in: .vertical) {
          figuresAndReturn(expanded, dense: false)
          figuresAndReturn(expanded, dense: true)
        }
        .privacySensitive()
      } else {
        PublicSummary(content: content.publicContent)
      }
    }
    .frame(maxWidth: .infinity)
    .frame(height: 112, alignment: .top)
    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
  }

  private func figuresAndReturn(_ expanded: ContextIslandAttributes.ExpandedContent, dense: Bool) -> some View {
    VStack(spacing: dense ? 4 : 8) {
      HStack(alignment: .top, spacing: 12) {
        ForEach(Array(expanded.figures.enumerated()), id: \.offset) { index, figure in
          VStack(alignment: .leading, spacing: dense ? 1 : 3) {
            Text(figure.label)
              .font(dense ? .system(.caption2, weight: .medium) : .caption)
              .foregroundStyle(IslandPalette.accent)
              .lineLimit(2)
              .fixedSize(horizontal: false, vertical: true)
            Text(figure.value)
              .font(dense ? .system(.subheadline, weight: .semibold) : .system(.headline, weight: .semibold))
              .monospacedDigit()
              .foregroundStyle(index == 0 ? firstFigureColor(expanded.tone) : .white)
              .lineLimit(1)
              .minimumScaleFactor(0.55)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text("\(figure.label), \(figure.value)"))
        }
      }
      if let destination = URL(string: "lukapp-u01:///context-pill?scope=\(scope.uuidString.lowercased())") {
        Link(destination: destination) {
          HStack(spacing: 6) {
            Text("Back to summary")
            Image(systemName: "arrow.up").accessibilityHidden(true)
          }
          .font(.system(.subheadline, weight: .semibold))
          .foregroundStyle(.black)
          .frame(maxWidth: .infinity)
          .padding(.vertical, dense ? 6 : 8)
          .background(IslandPalette.button, in: Capsule())
        }
        .accessibilityLabel("Back to summary")
      }
    }
  }

  private func firstFigureColor(_ tone: ContextIslandAttributes.Tone) -> Color {
    switch tone {
    case .default: .white
    case .positive: IslandPalette.positive
    case .warning: IslandPalette.warning
    }
  }
}
