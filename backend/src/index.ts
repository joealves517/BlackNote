import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/index.js";
import { rateLimit } from "./middleware/rate-limit.js";
import aiRouter from "./routes/ai.js";
import aiFreeRouter from "./routes/ai-free.js";
import chatRouter from "./routes/chat.js";
import mediaAiRouter from "./routes/media-ai.js";
import userRouter from "./routes/user.js";
import webhookRouter from "./routes/webhook.js";
import notesRouter from "./routes/notes.js";
import uploadRouter from "./routes/upload.js";
import agentRouter from "./routes/agent.js";

const app = express();

// ─── Security ───────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: [
      // Spark AI Chrome extension
      "chrome-extension://jaddgjjhbekcjdpmoglkeakpihbmgiah",
      // BlackNote Chrome extension
      "chrome-extension://cgmimbllhpkfcegecbdhldfmlfbfdhfg",
      // AI Screen Recorder Chrome extension
      "chrome-extension://imhihgooenkgfnmklplobjmnglalaomm",
      // Dev / old
      "chrome-extension://jpmmjclfhdbkdhmjibgjheeagobhafmd",
      "chrome-extension://kifnbpilpjgdkjbpcejligaglcjdkjjb",
      "chrome-extension://hmpblhofhafggbbnihgfmdjecedleiai",
      // Allow any chrome extension during development
      /^chrome-extension:\/\/.+$/,
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ─── Body Parsing ───────────────────────────────────────────────────
// Webhook route needs raw body for signature verification
app.use(
  "/api/webhook/ls",
  express.raw({ type: "application/json" }),
  webhookRouter
);

// Media routes receive base64 audio — larger payload limit
app.use("/api/media", express.json({ limit: "50mb" }));

// All other routes use JSON parsing
app.use(express.json({ limit: "50mb" }));

// ─── Rate Limiting ──────────────────────────────────────────────────
app.use("/api/media", rateLimit);
app.use("/api/ai/free", rateLimit);
app.use("/api/ai/agent", rateLimit);
app.use("/api/ai", rateLimit);
app.use("/api/chat", rateLimit);

// ─── Routes ─────────────────────────────────────────────────────
app.use("/api/media", mediaAiRouter);
app.use("/api/ai/free", aiFreeRouter);
app.use("/api/ai/agent", agentRouter);
app.use("/api/ai", aiRouter);
app.use("/api/chat", chatRouter);
app.use("/api/user", userRouter);
app.use("/api/notes", notesRouter);
app.use("/api/upload", uploadRouter);

// ─── Health Check ───────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", app: "blacknote-api", version: "1.0.0" });
});

// ─── 404 ────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// ─── Start ──────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`[BlackNote API] Listening on port ${config.port}`);
  console.log(`[BlackNote API] Environment: ${config.nodeEnv}`);
  console.log(`[BlackNote API] GCP Project: ${config.gcp.projectId}`);
});

export default app;
