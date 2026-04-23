import { Firestore } from "@google-cloud/firestore";

const db = new Firestore({ projectId: "ask-this-page" });

async function checkUser() {
  const email = "alvesoscar517@gmail.com";
  console.log(`Checking for email: ${email}`);
  
  const snapshot = await db.collection("users").where("email", "==", email).get();
  if (snapshot.empty) {
    console.log("No user found by email.");
    
    // Check all users to see what's in the DB
    const all = await db.collection("users").get();
    console.log(`Total users in DB: ${all.size}`);
    all.docs.forEach(d => console.log(d.id, "=>", d.data().email, d.data().credits));
  } else {
    console.log(`Found ${snapshot.size} docs.`);
    snapshot.docs.forEach(doc => {
      console.log(`ID: ${doc.id}`);
      console.log(doc.data());
    });
  }
}

checkUser().catch(console.error);
