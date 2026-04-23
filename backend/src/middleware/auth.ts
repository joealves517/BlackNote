import { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
  userName: string;
  userPicture: string;
}

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xloruyavtuvcoqrvjolp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsb3J1eWF2dHV2Y29xcnZqb2xwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NjA5OTUsImV4cCI6MjA5MjUzNjk5NX0.ssnDrw4mldgIoDfFa4SpUIMNzcenv_hrctePwtOcSEA";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Middleware: verify Supabase Access Token and attach user info to request.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new Error(error?.message || "Invalid token");
    }

    // Attach user info to request
    const authReq = req as AuthenticatedRequest;
    authReq.userId = user.id;
    authReq.userEmail = user.email || "";
    authReq.userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "";
    authReq.userPicture = user.user_metadata?.avatar_url || user.user_metadata?.picture || "";

    next();
  } catch (error) {
    console.error("[Auth] Supabase token verification failed:", error);
    res.status(401).json({ error: "invalid_token" });
  }
}
