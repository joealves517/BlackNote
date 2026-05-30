import { getUserByEmail, db } from "./services/firestore.js";

async function main() {
  const email = "alvesoscar517@gmail.com";
  console.log(`Granting credits to ${email}...`);
  try {
    const user = await getUserByEmail(email);
    if (!user) {
      console.log("No user found in Firestore database!");
      return;
    }
    
    const usersRef = db.collection("users");
    await usersRef.doc(user.id).update({
      credits: 10000,
      tier: "premium",
    });
    
    console.log("Successfully granted 10,000 credits and set tier to premium!");
    
    // Fetch again to verify
    const updated = await getUserByEmail(email);
    console.log("Updated User Info:", JSON.stringify(updated, null, 2));
  } catch (error) {
    console.error("Error updating user credits in Firestore:", error);
  }
}

main();
