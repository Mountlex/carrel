import Combine
import Foundation
import Testing
@testable import Carrel

@MainActor
struct SubscriptionQueryTests {
    @Test func immediatelyEmittedValueIsNotLost() async throws {
        let publisher = Just(42).setFailureType(to: URLError.self).eraseToAnyPublisher()
        #expect(try await ConvexService.firstValue(from: publisher) == 42)
    }

    @Test func aSilentQueryTimesOutAndCancelsItsSubscription() async {
        var cancelled = false
        let publisher = Empty<Int, URLError>(completeImmediately: false)
            .handleEvents(receiveCancel: { cancelled = true }).eraseToAnyPublisher()
        do {
            _ = try await ConvexService.firstValue(from: publisher, timeout: 0.02)
            Issue.record("A silent query did not time out")
        } catch { #expect((error as? URLError)?.code == .timedOut) }
        #expect(cancelled)
    }

    @Test func cancellingTheTaskReleasesTheSubscription() async throws {
        var subscribed = false
        var cancelled = false
        let publisher = Empty<Int, URLError>(completeImmediately: false)
            .handleEvents(receiveSubscription: { _ in subscribed = true }, receiveCancel: { cancelled = true })
            .eraseToAnyPublisher()
        let task = Task { try await ConvexService.firstValue(from: publisher) }
        while !subscribed { await Task.yield() }
        task.cancel()
        do {
            _ = try await task.value
            Issue.record("A cancelled query returned a result")
        } catch { }
        #expect(cancelled)
    }
}
