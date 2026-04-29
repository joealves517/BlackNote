import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/local-db";
import type { User } from "@supabase/supabase-js";
import { AI_API_BASE } from "@/lib/constants";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);

    try {
      const redirectUrl = chrome.identity.getRedirectURL();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (oauthError || !data.url) {
        console.error("OAuth error:", oauthError?.message);
        setLoading(false);
        return;
      }

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: data.url,
        interactive: true,
      });

      if (!responseUrl) {
        setLoading(false);
        return;
      }

      const url = new URL(responseUrl);
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (!accessToken || !refreshToken) {
        console.error("Missing tokens from OAuth response");
        setLoading(false);
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        console.error("Session error:", sessionError.message);
      } else {
        try {
          await fetch(`${AI_API_BASE}/api/user`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
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
    await supabase.auth.signOut();
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
