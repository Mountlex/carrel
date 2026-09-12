import SwiftUI

struct SubscriptionLifecycleModifier<VM: SubscribableViewModel>: ViewModifier {
    let viewModel: VM
    func body(content: Content) -> some View {
        content.task { await viewModel.runSubscription() }
    }
}

extension View {
    func manageSubscription<VM: SubscribableViewModel>(_ viewModel: VM) -> some View {
        modifier(SubscriptionLifecycleModifier(viewModel: viewModel))
    }
}
