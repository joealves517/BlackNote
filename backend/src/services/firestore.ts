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
  profile: { email: string; displayName: string; picture: string }
): Promise<UserDocument & { id: string }> {
  const existing = await getUserByEmail(profile.email);

  if (existing) {
    await usersRef.doc(existing.id).update({
      displayName: profile.displayName,
      picture: profile.picture,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...existing.data, ...profile, id: existing.id };
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
