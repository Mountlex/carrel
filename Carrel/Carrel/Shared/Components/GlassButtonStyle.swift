import SwiftUI

struct LiquidGlassButtonStyle: ButtonStyle {
    var cornerRadius: CGFloat = 16

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        configuration.label
            .contentShape(shape)
            .glassEffect(
                .regular.tint(GlassTheme.overlayTint),
                in: shape
            )
            .overlay {
                shape
                    .strokeBorder(GlassTheme.overlayStroke, lineWidth: 0.8)
            }
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.95 : 1)
            .animation(GlassTheme.quickMotion, value: configuration.isPressed)
    }
}

struct CapsuleLiquidGlassButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        let shape = Capsule()
        configuration.label
            .contentShape(shape)
            .glassEffect(
                .regular.tint(GlassTheme.overlayTint),
                in: shape
            )
            .overlay {
                shape
                    .strokeBorder(GlassTheme.overlayStroke, lineWidth: 0.8)
            }
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.95 : 1)
            .animation(GlassTheme.quickMotion, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == LiquidGlassButtonStyle {
    static var liquidGlass: LiquidGlassButtonStyle {
        LiquidGlassButtonStyle()
    }
}

extension ButtonStyle where Self == CapsuleLiquidGlassButtonStyle {
    static var capsuleLiquidGlass: CapsuleLiquidGlassButtonStyle {
        CapsuleLiquidGlassButtonStyle()
    }
}

#Preview {
    VStack(spacing: 20) {
        Button("Glass Button") {}
            .buttonStyle(.liquidGlass)
            .foregroundStyle(.white)
            .padding()

        Button {
        } label: {
            HStack {
                Image(systemName: "globe")
                Text("Public")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .buttonStyle(.capsuleLiquidGlass)
        .foregroundStyle(.white)
    }
    .padding()
    .background(Color.gray.opacity(0.5))
}
