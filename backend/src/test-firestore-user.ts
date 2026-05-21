import { getUserByEmail } from "./services/firestore.js";

async function main() {
  const email = "alvesoscar517@gmail.com";
  console.log(`Querying user info for ${email}...`);
  try {
    const user = await getUserByEmail(email);
    if (!user) {
      console.log("No user found in Firestore database!");
      return;
    }
    console.log("User Info from Firestore:");
    console.log(JSON.stringify(user, null, 2));
  } catch (error) {
    console.error("Error querying Firestore:", error);
  }
}

main();
