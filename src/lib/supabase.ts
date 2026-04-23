import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xloruyavtuvcoqrvjolp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsb3J1eWF2dHV2Y29xcnZqb2xwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NjA5OTUsImV4cCI6MjA5MjUzNjk5NX0.ssnDrw4mldgIoDfFa4SpUIMNzcenv_hrctePwtOcSEA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Chrome extension uses localStorage by default
    storage: globalThis.localStorage,
  },
});

export type DbNote = {
  id: string;
  user_id: string;
  title: string;
  emoji: string;
  content: object[];
  created_at: string;
  updated_at: string;
};
