import {build} from "esbuild";
import {mkdir} from "node:fs/promises";
await mkdir(".identity-tests",{recursive:true});
await build({entryPoints:["tests/identity/firebase-client.fixture.js"],bundle:true,format:"esm",platform:"browser",outfile:".identity-tests/firebase-client.js"});
