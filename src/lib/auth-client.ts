/**
 * Auth Client — Google OAuth via chrome.identity API.
 *
 * Replaces Supabase Auth entirely. Uses chrome.identity.getAuthToken()
 * which automatically handles token caching and refresh.
 */

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// ─── Types ──────────────────────────────────────────────────────────

export interface AppUser {
  id: string; // Google sub ID
  email: string;
  displayName: string;
  picture: string;
}

type AuthStateListener = (user: AppUser | null) => void;

// ─── Internal State ─────────────────────────────────────────────────

const STORAGE_KEY = "blacknote_user";
let cachedUser: AppUser | null = null;
let cachedToken: string | null = null;
const listeners: Set<AuthStateListener> = new Set();

function notifyListeners(user: AppUser | null) {
  listeners.forEach((fn) => fn(user));
}

// ─── Token Management ───────────────────────────────────────────────

/**
 * Get a valid Google OAuth access token. Automatically refreshed by Chrome.
 * Returns null if user is not signed in.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const result = await chrome.identity.getAuthToken({
      interactive: false,
    });
    if (result?.token) {
      cachedToken = result.token;
      return result.token;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Sign In ────────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<AppUser | null> {
  try {
    // Request token interactively (shows Google sign-in popup)
    const result = await chrome.identity.getAuthToken({
      interactive: true,
    });

    if (!result?.token) {
      console.error("[Auth] No token received from chrome.identity");
      return null;
    }

    cachedToken = result.token;

    // Fetch user profile from Google
    const userInfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${result.token}` } }
    );

    if (!userInfoRes.ok) {
      throw new Error(`Failed to fetch user info: ${userInfoRes.status}`);
    }

    const profile = await userInfoRes.json();
    const user: AppUser = {
      id: profile.sub,
      email: profile.email,
      displayName: profile.name || profile.email?.split("@")[0] || "User",
      picture: profile.picture || "",
    };

    // Persist user profile locally
    cachedUser = user;
    await chrome.storage.local.set({ [STORAGE_KEY]: user });
    notifyListeners(user);
    return user;
  } catch (err) {
    console.error("[Auth] Google sign-in failed:", err);
    return null;
  }
}

// ─── Sign Out ───────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  try {
    if (cachedToken) {
      await chrome.identity.removeCachedAuthToken({ token: cachedToken });
      // Revoke token on Google's side (blocking)
      await fetch(
        `https://accounts.google.com/o/oauth2/revoke?token=${cachedToken}`
      ).catch(() => {});
    }
    // Clear ALL cached tokens to prevent stale token leaks
    if (chrome.identity.clearAllCachedAuthTokens) {
      await chrome.identity.clearAllCachedAuthTokens();
    }
  } catch {
    // Token removal may fail if already expired
  }

  cachedUser = null;
  cachedToken = null;
  await chrome.storage.local.remove(STORAGE_KEY);
  notifyListeners(null);
}

// ─── Get Current User ───────────────────────────────────────────────

export async function getCurrentUser(): Promise<AppUser | null> {
  if (cachedUser) return cachedUser;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as AppUser | undefined;
    if (stored?.email) {
      cachedUser = stored;

      // Verify the token is still valid by trying a non-interactive fetch
      const token = await getAuthToken();
      if (!token) {
        // Token expired and can't be refreshed — clear stored user
        cachedUser = null;
        await chrome.storage.local.remove(STORAGE_KEY);
        return null;
      }

      return cachedUser;
    }
  } catch {
    // Storage access may fail in certain contexts
  }
  return null;
}

// ─── Auth State Listener ────────────────────────────────────────────

export function onAuthStateChange(
  callback: AuthStateListener
): () => void {
  listeners.add(callback);

  // Fire immediately with current state
  getCurrentUser().then((user) => callback(user));

  return () => {
    listeners.delete(callback);
  };
}
