import { Firestore, FieldValue } from "@google-cloud/firestore";
import { config } from "../config/index.js";

const db = new Firestore({
  projectId: config.gcp.projectId,
});

// ─── Types ──────────────────────────────────────────────────────────

export interface UserDocument {
  email: string;
  displayName: string;
  picture: string;
  credits: number;
  totalCreditsUsed: number;
  tier: "free" | "premium";
  lemonSqueezy: {
    customerId: string | null;
    subscriptionId: string | null;
    subscriptionItemId: string | null;
    status: string | null;
    currentPeriodEnd: Date | null;
  };
  apps?: string[];
  freeCreditsUsedToday?: number;
  freeCreditsLastReset?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageLog {
  userId: string;
  app: string;
  creditsUsed: number;
  model: string;
  timestamp: Date;
  inputTokens?: number;
  outputTokens?: number;
  [key: string]: unknown;
}

// ─── Users ──────────────────────────────────────────────────────────

const usersRef = db.collection("users");
const usageLogsRef = db.collection("usage_logs");

export async function getUserByEmail(email: string): Promise<{ id: string; data: UserDocument } | null> {
  if (!email) return null;
  const snapshot = await usersRef.where("email", "==", email).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, data: doc.data() as UserDocument };
}

export async function createOrUpdateUser(
  userId: string,
  profile: { email: string; displayName: string; picture: string },
  appName?: string
): Promise<UserDocument & { id: string }> {
  const existing = await getUserByEmail(profile.email);

  if (existing) {
    const updateData: Record<string, any> = {
      displayName: profile.displayName,
      picture: profile.picture,
      updatedAt: FieldValue.serverTimestamp(),
    };
    
    if (appName) {
      updateData.apps = FieldValue.arrayUnion(appName);
    }

    await usersRef.doc(existing.id).update(updateData);
    
    const existingApps = existing.data.apps || [];
    const newApps = appName && !existingApps.includes(appName) ? [...existingApps, appName] : existingApps;
    
    return { ...existing.data, ...profile, apps: newApps, id: existing.id };
  }

  const newUser: UserDocument = {
    email: profile.email,
    displayName: profile.displayName,
    picture: profile.picture,
    credits: 0,
    totalCreditsUsed: 0,
    tier: "free",
    lemonSqueezy: {
      customerId: null,
      subscriptionId: null,
      subscriptionItemId: null,
      status: null,
      currentPeriodEnd: null,
    },
    apps: appName ? [appName] : [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await usersRef.doc(userId).set(newUser);
  return { ...newUser, id: userId };
}

/**
 * Deduct credits atomically. Returns false if insufficient balance.
 */
export async function deductCreditsByEmail(
  email: string,
  amount: number
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(usersRef.where("email", "==", email).limit(1));
    if (snapshot.empty) return false;
    const userDoc = snapshot.docs[0];

    const currentCredits = userDoc.data().credits ?? 0;
    if (currentCredits < amount) return false;

    tx.update(userDoc.ref, {
      credits: FieldValue.increment(-amount),
      totalCreditsUsed: FieldValue.increment(amount),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return true;
  });
}

/**
 * Add credits to a user's balance (e.g., after purchase).
 */
export async function addCreditsByEmail(
  email: string,
  amount: number
): Promise<void> {
  const existing = await getUserByEmail(email);
  if (!existing) return;
  await usersRef.doc(existing.id).update({
    credits: FieldValue.increment(amount),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ─── Free Tier Credits ──────────────────────────────────────────────

export const FREE_CREDITS_PER_DAY = 100;

function getTodayString() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function checkFreeCreditLimit(email: string): Promise<boolean> {
  const existing = await getUserByEmail(email);
  if (!existing) return false;

  const user = existing.data;
  const today = getTodayString();
  const lastReset = user.freeCreditsLastReset;

  let usedToday = user.freeCreditsUsedToday || 0;

  if (lastReset !== today) {
    usedToday = 0;
    // We intentionally do not await this to reduce latency, fire-and-forget
    usersRef.doc(existing.id).update({
      freeCreditsUsedToday: 0,
      freeCreditsLastReset: today,
    }).catch(console.error);
  }

  return usedToday < FREE_CREDITS_PER_DAY;
}

export async function deductFreeCredits(email: string, amount: number): Promise<void> {
  const existing = await getUserByEmail(email);
  if (!existing) return;

  const today = getTodayString();
  const lastReset = existing.data.freeCreditsLastReset;

  if (lastReset !== today) {
    await usersRef.doc(existing.id).update({
      freeCreditsUsedToday: amount,
      freeCreditsLastReset: today,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await usersRef.doc(existing.id).update({
      freeCreditsUsedToday: FieldValue.increment(amount),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Update Lemon Squeezy subscription info on a user document.
 */
export async function updateSubscriptionByEmail(
  email: string,
  data: Partial<UserDocument["lemonSqueezy"]> & { tier?: UserDocument["tier"] }
): Promise<void> {
  const existing = await getUserByEmail(email);
  if (!existing) return;

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.tier) update.tier = data.tier;

  for (const [key, value] of Object.entries(data)) {
    if (key !== "tier") {
      update[`lemonSqueezy.${key}`] = value;
    }
  }

  await usersRef.doc(existing.id).update(update);
}

/**
 * Find a user by their Lemon Squeezy customer ID.
 */
export async function findUserByLemonSqueezyCustomerId(
  customerId: string
): Promise<{ id: string; data: UserDocument } | null> {
  const snapshot = await usersRef
    .where("lemonSqueezy.customerId", "==", customerId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return { id: doc.id, data: doc.data() as UserDocument };
}

// ─── Usage Logs ─────────────────────────────────────────────────────

export async function logUsage(log: UsageLog): Promise<void> {
  await usageLogsRef.add(log);
}

export { db };
