import SwiftUI

struct GlassCard<Content: View>: View {
    let content: Content
    var isInteractive: Bool

    init(isInteractive: Bool = false, @ViewBuilder content: () -> Content) {
        self.isInteractive = isInteractive
        self.content = content()
    }

    var body: some View {
        content
            .glassEffect(
                isInteractive ? .regular.interactive() : .regular,
                in: RoundedRectangle(cornerRadius: 20)
            )
    }
}

struct GlassSection<Content: View>: View {
    let title: String?
    let content: Content

    init(title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title = title {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }

            GlassCard {
                content
                    .padding()
            }
        }
    }
}

struct GlassButton<Label: View>: View {
    let action: () -> Void
    let label: Label

    init(action: @escaping () -> Void, @ViewBuilder label: () -> Label) {
        self.action = action
        self.label = label()
    }

    var body: some View {
        Button(action: action) {
            label
        }
        .buttonStyle(LiquidGlassButtonStyle())
    }
}

enum GlassTheme {
    static let rowCornerRadius: CGFloat = 12
    static let rowPadding: CGFloat = 12
    static let bannerCornerRadius: CGFloat = 12

    static var rowShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: rowCornerRadius, style: .continuous)
    }

    static var bannerShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: bannerCornerRadius, style: .continuous)
    }
}

struct GlassBackdrop: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(.systemBackground),
                Color(.systemGray6)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

struct GlassRow<Content: View>: View {
    let isInteractive: Bool
    let content: Content

    init(isInteractive: Bool = false, @ViewBuilder content: () -> Content) {
        self.isInteractive = isInteractive
        self.content = content()
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(GlassTheme.rowPadding)
            .glassEffect(
                isInteractive ? .regular.interactive() : .regular,
                in: GlassTheme.rowShape
            )
    }
}

#Preview {
    VStack(spacing: 20) {
        GlassCard {
            VStack {
                Text("Glass Card")
                    .font(.headline)
                Text("With some content")
                    .foregroundStyle(.secondary)
            }
            .padding()
        }

        GlassCard(isInteractive: true) {
            VStack {
                Text("Interactive Glass Card")
                    .font(.headline)
                Text("Tap me!")
                    .foregroundStyle(.secondary)
            }
            .padding()
        }

        GlassSection(title: "Section Title") {
            Text("Section content goes here")
        }

        GlassButton(action: {}) {
            Text("Glass Button")
                .padding()
        }
    }
    .padding()
    .background(Color.gray.opacity(0.3))
}
