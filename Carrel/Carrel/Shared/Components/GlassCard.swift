import SwiftUI

struct GlassCard<Content: View>: View {
    let content: Content
    var isInteractive: Bool

    init(isInteractive: Bool = false, @ViewBuilder content: () -> Content) {
        self.isInteractive = isInteractive
        self.content = content()
    }

    var body: some View {
        let cardShape = RoundedRectangle(cornerRadius: GlassTheme.cardCornerRadius, style: .continuous)
        content
            .glassEffect(
                isInteractive
                    ? .regular.tint(GlassTheme.cardTint).interactive()
                    : .regular.tint(GlassTheme.cardTint),
                in: cardShape
            )
            .overlay {
                cardShape
                    .strokeBorder(GlassTheme.cardStroke, lineWidth: 0.8)
            }
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
        VStack(alignment: .leading, spacing: 10) {
            if let title = title {
                Text(title)
                    .font(.subheadline.weight(.semibold))
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
    static let heroCornerRadius: CGFloat = 22
    static let cardCornerRadius: CGFloat = 18
    static let rowCornerRadius: CGFloat = 14
    static let rowPadding: CGFloat = 12
    static let bannerCornerRadius: CGFloat = 12

    static let heroTint: Color = Color.white.opacity(0.12)
    static let cardTint: Color = Color.white.opacity(0.08)
    static let overlayTint: Color = Color.white.opacity(0.18)

    static let cardStroke: Color = Color.white.opacity(0.22)
    static let overlayStroke: Color = Color.white.opacity(0.28)

    static let accent: Color = Color(red: 14.0 / 255.0, green: 165.0 / 255.0, blue: 233.0 / 255.0) // #0EA5E9
    static let info: Color = accent
    static let success: Color = Color(red: 34.0 / 255.0, green: 197.0 / 255.0, blue: 94.0 / 255.0) // #22C55E
    static let warning: Color = Color(red: 245.0 / 255.0, green: 158.0 / 255.0, blue: 11.0 / 255.0) // #F59E0B
    static let error: Color = Color(red: 239.0 / 255.0, green: 68.0 / 255.0, blue: 68.0 / 255.0) // #EF4444
    static let statusNeutral: Color = .gray

    static let motion = Animation.spring(response: 0.32, dampingFraction: 0.86, blendDuration: 0.12)
    static let quickMotion = Animation.easeInOut(duration: 0.22)

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
                Color(.systemGray6),
                Color(.systemBackground).opacity(0.96)
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
        let rowShape = GlassTheme.rowShape
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(GlassTheme.rowPadding)
            .glassEffect(
                isInteractive
                    ? .regular.tint(GlassTheme.cardTint).interactive()
                    : .regular.tint(GlassTheme.cardTint),
                in: rowShape
            )
            .overlay {
                rowShape
                    .strokeBorder(GlassTheme.cardStroke, lineWidth: 0.7)
            }
    }
}

private struct CardPressFeedbackModifier: ViewModifier {
    @GestureState private var isPressed = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPressed ? 0.985 : 1)
            .opacity(isPressed ? 0.95 : 1)
            .animation(GlassTheme.quickMotion, value: isPressed)
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.01, maximumDistance: 16)
                    .updating($isPressed) { value, state, _ in
                        state = value
                    }
            )
    }
}

extension View {
    func cardPressFeedback() -> some View {
        modifier(CardPressFeedbackModifier())
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
