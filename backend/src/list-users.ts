import { db } from "./services/firestore.js";

async function main() {
  console.log("Listing all users from Firestore...");
  try {
    const snapshot = await db.collection("users").get();
    if (snapshot.empty) {
      console.log("No users found.");
      return;
    }
    
    console.log(`Found ${snapshot.size} users:`);
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`- ID: ${doc.id}`);
      console.log(`  Email: ${data.email}`);
      console.log(`  DisplayName: ${data.displayName}`);
      console.log(`  Credits: ${data.credits}`);
      console.log(`  Tier: ${data.tier}`);
      console.log(`  FreeUsedToday: ${data.freeCreditsUsedToday}`);
      console.log(`  FreeLastReset: ${data.freeCreditsLastReset}`);
      console.log("-----------------------------------------");
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
