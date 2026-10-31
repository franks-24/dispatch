// Stamps the GitHub Pages artifact with the exact source commit published.
// Public metadata only; never include tokens, personal data or credentials.
import {writeFile, mkdir} from "node:fs/promises";
import {dirname} from "node:path";
const revision=process.env.GITHUB_SHA;
if(!/^[a-f0-9]{40}$/.test(revision||""))throw new Error("A 40-character GITHUB_SHA is required for publishing.");
const path=process.env.DISPATCH_RELEASE_PATH||"public/dispatch-release.json";
const release={schemaVersion:1,product:"franks24-dispatch",revision};
await mkdir(dirname(path),{recursive:true});
await writeFile(path,JSON.stringify(release,null,2)+"\n");
console.log("Stamped public Dispatch release at "+path+" (revision "+revision.slice(0,12)+")");
