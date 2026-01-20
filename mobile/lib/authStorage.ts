import * as SecureStore from "expo-secure-store";
import { Router } from "expo-router";

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL!;

const ACCESS_TOKEN_KEY = "carrel_access_token";
const REFRESH_TOKEN_KEY = "carrel_refresh_token";
const TOKEN_EXPIRY_KEY = "carrel_token_expiry";
const USER_KEY = "carrel_user";

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface User {
  id: string;
  email: string;
  name?: string;
}

export async function storeTokensAndNavigate(
  tokens: TokenData,
  router: Router
): Promise<void> {
  try {
    // Store tokens securely
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
      SecureStore.setItemAsync(TOKEN_EXPIRY_KEY, tokens.expiresAt.toString()),
    ]);

    // Verify token and get user info
    const verifyResponse = await fetch(`${CONVEX_URL}/api/auth/mobile/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    });

    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      const userData: User = {
        id: verifyData.userId,
        email: verifyData.email,
        name: verifyData.name,
      };
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
    }

    // Navigate to main app
    router.replace("/(tabs)");
  } catch (error) {
    console.error("Failed to store tokens:", error);
    throw error;
  }
}
