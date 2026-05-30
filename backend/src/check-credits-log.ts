import { db, getUserByEmail } from "./services/firestore.js";

async function main() {
  const email = "alvesoscar517@gmail.com";
  console.log(`Analyzing usage logs for ${email}...`);

  try {
    const userSnapshot = await getUserByEmail(email);
    if (!userSnapshot) {
      console.log(`User ${email} not found.`);
      return;
    }

    const userId = userSnapshot.id;
    const userData = userSnapshot.data;

    console.log(`User Profile:`);
    console.log(`- UID: ${userId}`);
    console.log(`- Email: ${userData.email}`);
    console.log(`- Tier: ${userData.tier}`);
    console.log(`- Active Credits: ${userData.credits}`);
    console.log(`- Total Credits Used (Accumulated): ${userData.totalCreditsUsed || 0}`);
    console.log("-----------------------------------------");

    // Fetch up to 300 logs to make sure we find non-zero ones
    const logsSnapshot = await db.collection("usage_logs")
      .where("userId", "==", userId)
      .limit(300)
      .get();

    if (logsSnapshot.empty) {
      console.log("No usage logs found for this user.");
      return;
    }

    const logs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Filter non-zero credits or agent actions
    const billingLogs = logs.filter((log: any) => log.creditsUsed > 0 || log.action === "agent");

    billingLogs.sort((a: any, b: any) => {
      const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime();
      const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime();
      return timeB - timeA; // desc
    });

    console.log(`Recent Billing / Agent Logs (Total found: ${billingLogs.length}):`);
    let totalVerified = 0;
    billingLogs.slice(0, 30).forEach((log: any, index) => {
      totalVerified += log.creditsUsed || 0;
      const timeStr = log.timestamp?.toDate ? log.timestamp.toDate().toISOString() : new Date(log.timestamp).toISOString();
      console.log(`[${index + 1}] Time: ${timeStr}`);
      console.log(`    Action: ${log.action} | Model: ${log.model}`);
      console.log(`    Credits Used: ${log.creditsUsed}`);
      if (log.inputTokens !== undefined) {
        console.log(`    Tokens: Input ${log.inputTokens} | Output ${log.outputTokens}`);
      }
    });

    console.log("-----------------------------------------");
    console.log(`Total credits in the displayed logs: ${totalVerified} credits`);

  } catch (err) {
    console.error("Error running log analysis:", err);
  }
}

main();
