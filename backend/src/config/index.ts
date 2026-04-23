const requiredVars = [
  "GCP_PROJECT_ID",
  "GEMINI_API_KEY",
] as const;

function loadEnv() {
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`[Config] Missing env vars: ${missing.join(", ")}`);
  }

  return {
    port: parseInt(process.env.PORT || "8080", 10),
    nodeEnv: process.env.NODE_ENV || "development",
    gcp: {
      projectId: process.env.GCP_PROJECT_ID || "ask-this-page",
      region: process.env.GCP_REGION || "us-central1",
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || "",
    },
    lemonSqueezy: {
      apiKey: process.env.LEMONSQUEEZY_API_KEY || "",
      webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "",
      storeId: process.env.LEMONSQUEEZY_STORE_ID || "",
    },
  } as const;
}

export const config = loadEnv();
export type AppConfig = ReturnType<typeof loadEnv>;
