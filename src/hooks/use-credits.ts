import { useState, useEffect, useCallback } from "react";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";

interface UserCredits {
  credits: number;
  tier: "free" | "premium";
}

export function useCredits(userId: string | undefined) {
  const [credits, setCredits] = useState<UserCredits | null>(null);

  const fetchCredits = useCallback(async () => {
    if (!userId) {
      setCredits(null);
      return;
    }

    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch(`${AI_API_BASE}/api/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setCredits({ credits: data.credits ?? 0, tier: data.tier ?? "free" });
      }
    } catch (err) {
      console.error("Failed to fetch credits:", err);
    }
  }, [userId]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  return { credits, refreshCredits: fetchCredits };
}
