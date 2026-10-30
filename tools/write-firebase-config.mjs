/**
 * Write the public Firebase Web SDK config into the GitHub Pages upload artifact.
 * Required: FIREBASE_WEB_CONFIG_JSON (repository variable) or assets/firebase-config.public.json.
 * This is a public client configuration, never a service-account or OAuth secret.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const publicFile = "assets/firebase-config.public.json";
const raw = process.env.FIREBASE_WEB_CONFIG_JSON || (existsSync(publicFile) ? readFileSync(publicFile, "utf8") : "");
if (!raw) {
  console.error("Missing public Firebase settings: set FIREBASE_WEB_CONFIG_JSON or add assets/firebase-config.public.json. Refusing to publish an unconfigured login.");
  process.exit(1);
}
let input;
try {
  input = JSON.parse(raw);
} catch {
  console.error("Firebase public configuration must contain valid JSON.");
  process.exit(1);
}
const allowed = ["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId","measurementId"];
const required = ["apiKey","authDomain","projectId","messagingSenderId","appId"];
if (!input || Array.isArray(input) || typeof input !== "object"
  || Object.keys(input).some(key => !allowed.includes(key))
  || required.some(key => typeof input[key] !== "string" || !input[key].trim())
  || input.projectId !== "dispatch-1491f"
  || input.authDomain !== "dispatch-1491f.firebaseapp.com"
  || input.messagingSenderId !== "1068135038943"
  || !input.appId.startsWith("1:1068135038943:web:")
) {
  console.error("Invalid Firebase Web SDK configuration for dispatch-1491f. No deployment will occur.");
  process.exit(1);
}
const output = process.env.FIREBASE_CONFIG_OUTPUT || "assets/config.js";
writeFileSync(output, "// Public Firebase Web SDK configuration injected by the Pages deployment workflow.\n"
  + "export const firebaseConfig = " + JSON.stringify(input, null, 2) + ";\n");
console.log("Validated Firebase client configuration for dispatch-1491f.");
