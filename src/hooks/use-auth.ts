import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/local-db";
import {
  signInWithGoogle as authSignIn,
  signOut as authSignOut,
  onAuthStateChange,
  getAuthToken,
  type AppUser,
} from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((authUser) => {
      setUser(authUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);

    try {
      const authUser = await authSignIn();
      if (authUser) {
        // Warmup backend (creates user in Firestore if needed)
        try {
          const token = await getAuthToken();
          if (token) {
            await fetch(`${AI_API_BASE}/api/user`, {
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        } catch (e) {
          console.error("Backend warmup failed:", e);
        }
      }
    } catch (err) {
      console.error("Google login failed:", err);
    }

    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    await db.notes.clear();
    localStorage.clear();
    await new Promise(r => setTimeout(r, 800)); // Allow time for loading overlay to be seen
    window.location.reload();
  }, []);

  return {
    user,
    loading,
    signInWithGoogle,
    signOut,
  };
}
