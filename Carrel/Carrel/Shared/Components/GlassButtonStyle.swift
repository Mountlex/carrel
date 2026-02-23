import SwiftUI

struct LiquidGlassButtonStyle: ButtonStyle {
    var cornerRadius: CGFloat = 16

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        configuration.label
            .glassEffect(
                .regular.tint(GlassTheme.overlayTint).interactive(),
                in: shape
            )
            .overlay {
                shape
                    .strokeBorder(GlassTheme.overlayStroke, lineWidth: 0.8)
            }
    }
}

struct CapsuleLiquidGlassButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .glassEffect(
                .regular.tint(GlassTheme.overlayTint).interactive(),
                in: Capsule()
            )
            .overlay {
                Capsule()
                    .strokeBorder(GlassTheme.overlayStroke, lineWidth: 0.8)
            }
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
