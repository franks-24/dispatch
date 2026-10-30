import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {createRuntime} from "./runtime.js";
import {createOperator,hash} from "./service.js";

// Run only with a named human's IAM-authorised ADC. No operator customer endpoint.
// Audit identity is bound to the ADC principal by the user-supplied label and Cloud Audit Logs.
const [command,uid,id,payloadFile]=process.argv.slice(2);
if(!["issue-quote","advance","attach-proof"].includes(command)||!uid||!/^[A-Za-z0-9_-]{1,128}$/.test(id||"")||!payloadFile||!process.env.DELIVERY_OPERATOR_LABEL)throw new Error("Usage: node operator.js issue-quote|advance|attach-proof UID ID payload.json; set DELIVERY_OPERATOR_LABEL for audit.");
const runtime=await createRuntime();
await getAuth(runtime.app).getUser(uid);
const operator=createOperator(runtime),payload=JSON.parse(await readFile(payloadFile,"utf8"));
const label=process.env.DELIVERY_OPERATOR_LABEL;
if(command==="issue-quote")await operator.issueQuote(uid,id,{...payload,operator:label});
if(command==="advance")await operator.advance(uid,id,{...payload,operator:label});
if(command==="attach-proof"){
  if(!process.env.DELIVERY_PROOF_BUCKET)throw new Error("Set a private proof bucket.");
  const bytes=await readFile(payload.file);
  if(bytes.length>10*1024*1024||bytes.subarray(0,5).toString()!=="%PDF-")throw new Error("A PDF up to 10 MB is required.");
  const path=`delivery-proofs/${hash(uid)}/${id}/${randomUUID()}.pdf`;
  const file=(await runtime.proofBucket()).file(path);
  await file.save(bytes,{resumable:false,validation:"crc32c",preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:"application/pdf",cacheControl:"private, no-store"}});
  const [metadata]=await file.getMetadata();
  // A failed metadata transaction leaves an unreferenced private object; never a false delivery.
  await operator.attachProof(uid,id,{path,generation:String(metadata.generation)},label);
}
console.log("Operator action recorded.");
