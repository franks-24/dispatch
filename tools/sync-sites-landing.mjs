import {readFile,writeFile,mkdir,copyFile} from "node:fs/promises";
const target="sites/franks24-dispatch";
await mkdir(target+"/dist/assets",{recursive:true});
await mkdir(target+"/.openai",{recursive:true});
// The Sites presentation uses the same shell and theme. Authenticated portals
// continue to run on the canonical app origin, which owns the API and OAuth setup.
const html=(await readFile("index.html","utf8")).replace(/href="\.\/(deliveries|driver|dispatcher|operations|legal)\//g,'href="https://dispatch.franks24.com/$1/');
await writeFile(target+"/dist/index.html",html);
for(const file of ["site-shell.css","site-shell.js","delivery-plan.js","favicon.svg","route-map.svg"])await copyFile("assets/"+file,target+"/dist/assets/"+file);
await writeFile(target+"/.openai/hosting.json",JSON.stringify({project_id:"appgprj_6ae5854a78bc8191a799a5d403fb6606",static:{directory:"dist"}},null,2)+"\n");
await writeFile(target+"/README.md",`# Franks24 Dispatch Sites landing\n\nThe compact landing uses the same header, footer, fonts, colours and responsive navigation as the canonical Franks24 application. Customer, driver, dispatcher, operations and legal links open https://dispatch.franks24.com/. The local delivery-brief tool generates a download without submitting a quote or booking.\n\nRun \`node tools/sync-sites-landing.mjs\` from the repository root after shared website changes. The static Site is in \`dist/\`; no installation or build is needed. The registered Site ID is preserved in \`.openai/hosting.json\`.\n\nPublication must push this exact source to the registered Sites source repository before saving a version. The previous execution environment could not resolve \`git.chatgpt-team.site\`; a registered project or expected URL does not prove publication. Live courier operations and Google sign-in acceptance are verified separately.\n`);
console.log("Sites landing synchronized with the canonical website theme.");
