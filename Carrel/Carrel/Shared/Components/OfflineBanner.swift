import SwiftUI

/// Banner displayed when the device is offline.
/// Shows at the top of the screen to notify users they have no network connection.
struct OfflineBanner: View {
    var message = "No internet connection"
    var body: some View {
        let bannerShape = GlassTheme.bannerShape
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .font(.subheadline)
            Text(message)
                .font(.subheadline)
                .fontWeight(.medium)
        }
        .foregroundStyle(.primary)
        .accessibilityElement(children: .combine)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .glassEffect(
            .regular.tint(GlassTheme.warning.opacity(0.32)),
            in: bannerShape
        )
        .overlay {
            bannerShape
                .strokeBorder(GlassTheme.overlayStroke.opacity(0.8), lineWidth: 0.8)
        }
        .padding(.horizontal, 12)
    }
}

#Preview {
    VStack(spacing: 0) {
        OfflineBanner()
        Spacer()
    }
}
