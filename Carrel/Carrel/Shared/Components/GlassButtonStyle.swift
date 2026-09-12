import SwiftUI

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

extension ButtonStyle where Self == CapsuleLiquidGlassButtonStyle {
    static var capsuleLiquidGlass: CapsuleLiquidGlassButtonStyle {
        CapsuleLiquidGlassButtonStyle()
    }
}
