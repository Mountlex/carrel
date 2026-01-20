import { useRef, useState, useCallback } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { WebView, WebViewNavigation, WebViewMessageEvent } from "react-native-webview";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/useAuth";
import { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL!;

// Inject script to intercept carrel:// redirects and send message instead
const INJECTED_SCRIPT = `
  (function() {
    // Override window.location to intercept carrel:// URLs
    const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    let intercepted = false;

    // Watch for href changes
    const checkForRedirect = () => {
      if (intercepted) return;
      const href = window.location.href;
      if (href.startsWith('carrel://')) {
        intercepted = true;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'redirect', url: href }));
      }
    };

    // Also intercept link clicks
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href && link.href.startsWith('carrel://')) {
        e.preventDefault();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'redirect', url: link.href }));
      }
    }, true);

    // Poll for redirect (backup)
    setInterval(checkForRedirect, 100);

    // Intercept location.href assignment
    const originalAssign = window.location.assign;
    window.location.assign = function(url) {
      if (url && url.startsWith('carrel://')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'redirect', url: url }));
        return;
      }
      return originalAssign.call(this, url);
    };
  })();
  true;
`;

export default function WebViewLogin() {
  const { provider } = useLocalSearchParams<{ provider: string }>();
  const router = useRouter();
  const { completeWebViewAuth, setTokensFromWebView } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHandlingCallback, setIsHandlingCallback] = useState(false);

  const authUrl = `${WEB_URL}/mobile-auth?provider=${provider || "email"}`;

  const handleCallback = useCallback(async (url: string) => {
    if (isHandlingCallback) return;
    setIsHandlingCallback(true);

    const success = url.includes("success=true");

    if (success) {
      await completeWebViewAuth();
    } else {
      router.back();
    }
  }, [isHandlingCallback, completeWebViewAuth, router]);

  const onMessage = useCallback(async (event: WebViewMessageEvent) => {
    console.log('[WebView] onMessage received:', event.nativeEvent.data);
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[WebView] Parsed message type:', data.type);

      if (data.type === 'auth_tokens') {
        if (isHandlingCallback) {
          console.log('[WebView] Already handling callback, ignoring');
          return;
        }
        setIsHandlingCallback(true);
        console.log('[WebView] Storing tokens...');

        // Store tokens received from web and navigate
        const result = await setTokensFromWebView({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
        });
        console.log('[WebView] setTokensFromWebView result:', result);
      } else if (data.type === 'auth_error') {
        console.error('[WebView] Auth error from web:', data.error);
        router.back();
      } else if (data.type === 'auth_cancelled') {
        console.log('[WebView] Auth cancelled');
        router.back();
      }
    } catch (e) {
      console.error('[WebView] Message parse error:', e);
    }
  }, [isHandlingCallback, setTokensFromWebView, router]);

  const onShouldStartLoadWithRequest = useCallback((request: ShouldStartLoadRequest) => {
    if (request.url.startsWith("carrel://")) {
      handleCallback(request.url);
      return false;
    }
    return true;
  }, [handleCallback]);

  const onNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    if (navState.url.startsWith("carrel://")) {
      handleCallback(navState.url);
    }
  }, [handleCallback]);

  return (
    <SafeAreaView style={styles.container}>
      {isLoading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ uri: authUrl }}
        style={styles.webview}
        originWhitelist={["https://*", "http://*"]}
        onNavigationStateChange={onNavigationStateChange}
        onLoadEnd={() => setIsLoading(false)}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onMessage={onMessage}
        injectedJavaScript={INJECTED_SCRIPT}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    zIndex: 1,
  },
});
