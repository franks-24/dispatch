import {readFile,writeFile,readdir} from "node:fs/promises";
import {header,footer,headAssets} from "./site-shell.mjs";
const paths=["index.html"];
for(const folder of ["deliveries","driver","dispatcher","operations","legal"]){
 for(const file of await readdir(folder))if(file.endsWith(".html"))paths.push(folder+"/"+file);
}
for(const file of paths){
 const base=file.includes("/")?"../":"./",active=file==="index.html"?"home":file.startsWith("legal/")||file.endsWith("policies.html")?null:file.split("/")[0];
 let html=await readFile(file,"utf8");
 html=html.replace(/<!-- f24-assets:start -->[\s\S]*?<!-- f24-assets:end -->\s*/g,"").replace(/<meta name="theme-color"[^>]*>/g,"");
 html=html.replace("</head>",headAssets(base)+"\n</head>");
 html=html.replace(/<body([^>]*)>/,(_,attrs)=>`<body${attrs.replace(/\sclass="[^"]*"/,"")} class="f24-app">`);
 const renderedHeader=header(base,active),renderedFooter=footer(base);
 if(html.includes("<!-- f24-header:start -->"))html=html.replace(/<!-- f24-header:start -->[\s\S]*?<!-- f24-header:end -->/,renderedHeader);
 else if(/<header\b/.test(html))html=html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/,renderedHeader);
 else html=html.replace(/<body[^>]*>/,match=>match+'\n<a class="skip" href="#main">Skip to content</a>\n'+renderedHeader);
 if(html.includes("<!-- f24-footer:start -->"))html=html.replace(/<!-- f24-footer:start -->[\s\S]*?<!-- f24-footer:end -->/,renderedFooter);
 else if(/<footer\b/.test(html))html=html.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/,renderedFooter);
 else html=html.replace("</body>",renderedFooter+"\n</body>");
 html=html.replace(/<main(?![^>]*\bid=)([^>]*)>/,"<main id=\"main\"$1>");
 await writeFile(file,html);
}
console.log(`Shared shell synchronized across ${paths.length} pages.`);
