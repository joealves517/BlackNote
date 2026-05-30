import { getUserByEmail, checkFreeCreditLimit } from "./services/firestore.js";

async function main() {
  const email = "nguyenloc351352@gmail.com";
  console.log(`Checking limits for ${email}...`);
  try {
    const user = await getUserByEmail(email);
    if (!user) {
      console.log("No user found!");
      return;
    }
    console.log("User credits:", user.data.credits);
    console.log("User tier:", user.data.tier);
    console.log("User freeCreditsUsedToday:", user.data.freeCreditsUsedToday);
    console.log("User freeCreditsLastReset:", user.data.freeCreditsLastReset);
    
    const limitResult = await checkFreeCreditLimit(email);
    console.log(`checkFreeCreditLimit result: ${limitResult}`);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
