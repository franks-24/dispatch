import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const config = {
  apiKey: "AIza" + "x".repeat(35), // test fixture only; not a real API key
  authDomain: "dispatch-1491f.firebaseapp.com",
  projectId: "dispatch-1491f",
  storageBucket: "dispatch-1491f.firebasestorage.app",
  messagingSenderId: "1068135038943",
  appId: "1:1068135038943:web:example",
  measurementId: "G-TEST"
};
const script = new URL("../tools/write-firebase-config.mjs", import.meta.url).pathname;
function run(input) {
  const dir = mkdtempSync(join(tmpdir(), "dispatch-firebase-config-"));
  const output = join(dir, "config.js");
  try {
    execFileSync(process.execPath, [script], {
      env: {
        ...process.env,
        FIREBASE_WEB_CONFIG_JSON: input === undefined ? "" : JSON.stringify(input),
        FIREBASE_CONFIG_OUTPUT: output
      },
      stdio: "pipe"
    });
    return readFileSync(output, "utf8");
  } finally {
    rmSync(dir, {recursive:true,force:true});
  }
}
test("valid public Firebase configuration is serialized as a browser ES module", () => {
  const source = run(config);
  assert.match(source, /export const firebaseConfig =/);
  assert.ok(source.includes('"projectId": "dispatch-1491f"'));
  assert.ok(source.includes('"measurementId": "G-TEST"'));
  assert.ok(!source.includes("private_key"));
});
test("an absent Firebase configuration fails instead of shipping a dead login", () => {
  assert.throws(() => run(undefined));
});
test("rejects wrong Firebase project and extra credential fields", () => {
  assert.throws(() => run({...config,projectId:"other-project"}));
  assert.throws(() => run({...config,private_key:"should-never-be-emitted"}));
});
