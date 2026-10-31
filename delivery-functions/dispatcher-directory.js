import {JWT} from "google-auth-library";

// Google Workspace Directory operations run only on the backend.
const BASE="https://admin.googleapis.com/admin/directory/v1";
const SCOPES=[
 "https://www.googleapis.com/auth/admin.directory.user.readonly",
 "https://www.googleapis.com/auth/admin.directory.group.member.readonly"
];
const required=(value,label)=>{
 if(typeof value!=="string"||!value.trim())throw Error(label+" is not configured.");
 return value.trim();
};
export function createDirectoryReader({getToken,fetcher=fetch}){
 if(typeof getToken!=="function"||typeof fetcher!=="function")throw Error("Directory connector unavailable.");
 const read=async path=>{
  const token=required(await getToken(),"Directory access token");
  const response=await fetcher(BASE+path,{method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},
   cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
  if(response.status===404)return null;
  if(!response.ok||!(response.headers.get("content-type")||"").startsWith("application/json"))
   throw Error("Directory unavailable.");
  return response.json();
 };
 return {
  lookupDirectoryUser:email=>read("/users/"+encodeURIComponent(required(email,"Staff email"))+"?projection=full"),
  checkGroupMembership:async(groupKey,memberKey)=>{
   const result=await read("/groups/"+encodeURIComponent(required(groupKey,"Dispatcher group"))+
    "/hasMember/"+encodeURIComponent(required(memberKey,"Member ID")));
   return result?.isMember===true;
  }
 };
}
export function createWorkspaceDirectory({credentialsJson,delegatedAdminEmail,fetcher=fetch}){
 const subject=required(delegatedAdminEmail,"Delegated Workspace administrator");
 let credentials;
 try{credentials=JSON.parse(required(credentialsJson,"Directory service account secret"));}
 catch{throw Error("Invalid Directory secret.");}
 if(credentials?.type!=="service_account"||!credentials.client_email||
  typeof credentials.private_key!=="string"||!credentials.private_key.includes("BEGIN PRIVATE KEY"))
  throw Error("Invalid Directory identity.");
 const jwt=new JWT({email:credentials.client_email,key:credentials.private_key,subject,scopes:SCOPES});
 return createDirectoryReader({getToken:async()=>await jwt.getAccessToken().then(r=>r.token),fetcher});
}
