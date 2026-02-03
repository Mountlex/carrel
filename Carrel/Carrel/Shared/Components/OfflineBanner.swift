import SwiftUI

/// Banner displayed when the device is offline.
/// Shows at the top of the screen to notify users they have no network connection.
struct OfflineBanner: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .font(.subheadline)
            Text("No internet connection")
                .font(.subheadline)
                .fontWeight(.medium)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .glassEffect(
            .regular.tint(Color.orange.opacity(0.35)),
            in: GlassTheme.bannerShape
        )
        .padding(.horizontal, 12)
    }
}

#Preview {
    VStack(spacing: 0) {
        OfflineBanner()
        Spacer()
    }
}
