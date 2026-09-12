import SwiftUI

/// Welcome onboarding view shown on first app launch.
/// Displays a carousel of pages explaining the app's features.
struct OnboardingView: View {
    @Binding var hasCompletedOnboarding: Bool
    @State private var currentPage = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            icon: "doc.text.fill",
            title: "Welcome to Carrel",
            description: "Your personal gallery for academic papers and LaTeX documents."
        ),
        OnboardingPage(
            icon: "square.grid.2x2.fill",
            title: "Your Paper Gallery",
            description: "View all your papers in a beautiful, organized gallery with quick previews."
        ),
        OnboardingPage(
            icon: "arrow.triangle.branch",
            title: "Connect Your Repos",
            description: "Link your GitHub, GitLab, or Overleaf repositories to automatically sync papers."
        ),
        OnboardingPage(
            icon: "arrow.clockwise.circle.fill",
            title: "Always Up to Date",
            description: "Papers sync automatically when you push changes. Never worry about outdated PDFs."
        )
    ]

    var body: some View {
        ZStack {
            GlassBackdrop()
            TabView(selection: $currentPage) {
                ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
                    OnboardingPageView(page: page)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

        }
        .safeAreaInset(edge: .bottom) {
            controls
                .padding(.bottom, 20)
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var controls: some View {
        VStack(spacing: 24) {
            HStack(spacing: 8) {
                ForEach(0..<pages.count, id: \.self) { index in
                    Circle()
                        .fill(index == currentPage ? Color.primary.opacity(0.8) : Color.primary.opacity(0.2))
                        .frame(width: 8, height: 8)
                        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: currentPage)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Page \(currentPage + 1) of \(pages.count)")

            Button {
                if currentPage < pages.count - 1 {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) {
                        currentPage += 1
                    }
                } else {
                    hasCompletedOnboarding = true
                }
            } label: {
                Text(currentPage < pages.count - 1 ? "Continue" : "Get Started")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            }
            .buttonStyle(.glassProminent)
            .padding(.horizontal, 24)

            if currentPage < pages.count - 1 {
                Button("Skip") {
                    hasCompletedOnboarding = true
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(minHeight: 44)
            }
        }
    }
}

/// Data model for an onboarding page
private struct OnboardingPage {
    let icon: String
    let title: String
    let description: String
}

/// View for a single onboarding page
private struct OnboardingPageView: View {
    let page: OnboardingPage

    var body: some View {
        ScrollView {
            GlassCard {
                VStack(spacing: 16) {
                    Image(systemName: page.icon)
                        .font(.system(size: 64))
                        .foregroundStyle(.primary)
                        .accessibilityHidden(true)

                    VStack(spacing: 12) {
                        Text(page.title)
                            .font(.title2)
                            .fontWeight(.bold)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(page.description)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 12)
                    }
                }
                .padding(.vertical, 24)
                .padding(.horizontal, 20)
            }
            .padding(24)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(page.title). \(page.description)")
    }
}

#Preview {
    OnboardingView(hasCompletedOnboarding: .constant(false))
}
