import { Mp3Encoder } from "@breezystack/lamejs";
try {
  const encoder = new Mp3Encoder(1, 16000, 64);
  console.log("Encoder instantiated successfully:", encoder);
} catch (e) {
  console.error("Error instantiating encoder:", e);
}
