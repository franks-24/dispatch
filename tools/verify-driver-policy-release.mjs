// Checks the exact published legal documents against an approved release record.
// Only a human-authorized process may assert legal approval.
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
const documents=["legal/delivery-terms.html","legal/delivery-privacy.html","legal/delivery-data.html"];
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const value=entry=>typeof entry==="string"&&entry.trim().length>=3&&
 !/^(draft|pending|tbd|todo|unknown|example|none|n\/a)$/i.test(entry.trim());
export async function verifyDriverPolicyRelease({
 root=new URL("../",import.meta.url),version,now=Date.now()
}={}){
 if(!value(version)||/draft|test|sample/i.test(version))throw Error("An immutable approved driver policy version is required.");
 const contents=await readFile(new URL("docs/driver-policy-release.json",root),"utf8");
 let release;
 try{release=JSON.parse(contents);}catch{throw Error("Invalid driver policy release JSON.");}
 if(release?.status!=="approved"||release.version!==version)
  throw Error("No matching approved driver policy release exists.");
 for(const field of ["approvedBy","approvalReference","responsibleParty","informationOfficerContact",
                     "retentionScheduleReference","popiaReviewReference"])
  if(!value(release[field]))throw Error("Approved driver policy release is missing "+field+".");
 for(const field of ["approvedAt","effectiveAt"]){
  const date=Date.parse(release[field]);
  if(!Number.isFinite(date)||date>now)throw Error("Policy release has no effective past "+field+".");
 }
 const checksums={};
 for(const path of documents){
  const expected=release.documents?.[path]?.sha256;
  if(typeof expected!=="string"||!/^[a-f0-9]{64}$/.test(expected))
   throw Error("Missing SHA-256 checksum for "+path+".");
  const bytes=await readFile(new URL(path,root));
  if(/policy draft|draft for review|policies are drafts|delivery-draft/i.test(bytes.toString("utf8")))
   throw Error("Policy document remains visibly marked as draft: "+path+".");
  const actual=hash(bytes);
  if(actual!==expected)throw Error("Policy release checksum mismatch: "+path+".");
  checksums[path]=actual;
 }
 return Object.freeze({version,releaseSha256:hash(Buffer.from(contents,"utf8")),documents:checksums});
}
