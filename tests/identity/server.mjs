import http from "node:http";
import {readFile,stat} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
const root=resolve(process.env.TEST_PUBLIC_ROOT||"."),types={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".json":"application/json"};
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);let path=resolve(root,"."+pathname);if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return}if((await stat(path)).isDirectory())path=resolve(path,"index.html");const bytes=await readFile(path);res.writeHead(200,{"Content-Type":types[extname(path)]||"application/octet-stream","Cache-Control":"no-store"}).end(bytes)}catch{res.writeHead(404).end("Not found")}}).listen(4173,"127.0.0.1");
