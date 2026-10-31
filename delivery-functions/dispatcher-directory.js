// Server-only Workspace Directory connector. Do not export Workspace tokens to clients.
// Uses IAM Credentials signJwt: no user-managed service-account private keys.
const BASE="https://admin.googleapis.com/admin/directory/v1";
const OAUTH_TOKEN_URL="https://oauth2.googleapis.com/token";
const SIGN_JWT_URL="https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/franks24-directory%40dispatch-1491f.iam.gserviceaccount.com:signJwt";
const DIRECTORY_SERVICE_ACCOUNT="franks24-directory@dispatch-1491f.iam.gserviceaccount.com";
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

// ADC belongs to the Functions runtime identity. Only that identity should have
// iam.serviceAccounts.signJwt on the dedicated, Workspace-delegated account.
let adcClientPromise;
async function signJwtWithIam(payload){
 if(!adcClientPromise){
  adcClientPromise=import("google-auth-library")
   .then(async({GoogleAuth})=>new GoogleAuth({
    scopes:["https://www.googleapis.com/auth/cloud-platform"]
   }).getClient())
   .catch(error=>{adcClientPromise=undefined;throw error;});
 }
 const client=await adcClientPromise;
 const response=await client.request({
  method:"POST",url:SIGN_JWT_URL,data:{payload},timeout:10000
 });
 return required(response?.data?.signedJwt,"Signed Directory assertion");
}

export function createWorkspaceDirectory({
 delegatedAdminEmail,fetcher=fetch,clock=Date.now,signJwt=signJwtWithIam
}){
 const subject=required(delegatedAdminEmail,"Delegated Workspace administrator");
 if(typeof signJwt!=="function"||typeof clock!=="function")throw Error("Directory signer unavailable.");
 let cached, pending;
 const issue=async()=>{
  const iat=Math.floor(clock()/1000);
  const payload=JSON.stringify({
   iss:DIRECTORY_SERVICE_ACCOUNT,sub:subject,scope:SCOPES.join(" "),
   aud:OAUTH_TOKEN_URL,iat,exp:iat+3600
  });
  const assertion=required(await signJwt(payload),"Signed Directory assertion");
  const response=await fetcher(OAUTH_TOKEN_URL,{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},
   body:new URLSearchParams({"grant_type":"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),
   cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw Error("Directory access token unavailable.");
  const result=await response.json();
  if(typeof result?.access_token!=="string"||!result.access_token||
     !Number.isFinite(result.expires_in)||result.expires_in<=120)
   throw Error("Directory access token unavailable.");
  cached={token:result.access_token,expiresAt:clock()+result.expires_in*1000};
  return cached.token;
 };
 const getToken=async()=>{
  if(cached?.expiresAt>clock()+60000)return cached.token;
  if(!pending)pending=issue().finally(()=>{pending=undefined;});
  return pending;
 };
 return createDirectoryReader({getToken,fetcher});
}
