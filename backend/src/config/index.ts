import "dotenv/config";

const requiredVars = [
  "GCP_PROJECT_ID",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
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

    aws: {
      region: process.env.AWS_REGION || "us-east-1",
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      dynamoTableName: process.env.DYNAMO_TABLE_NAME || "UserNotes",
      s3Bucket: process.env.S3_BUCKET || "blacknote-images-417183877808",
    },

    google: {
      oauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "676582412453-64mpkmbnplhpca5ljs0uc1vsrejj0a67.apps.googleusercontent.com",
    },
    lemonSqueezy: {
      apiKey: process.env.LEMONSQUEEZY_API_KEY || "",
      webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "",
      storeId: process.env.LEMONSQUEEZY_STORE_ID || "",
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY || "",
    },
    pexels: {
      apiKey: process.env.PEXELS_API_KEY || "",
    },
  } as const;
}

export const config = loadEnv();
export type AppConfig = ReturnType<typeof loadEnv>;
