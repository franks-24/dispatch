// Browser-side routing hint only. Actual role authorization is always performed by the backend.
export async function isVerifiedDispatcher({user,enabled,endpoint,origin,fetcher=fetch}) {
 if(!user||!enabled)return false;
 const target=new URL(endpoint,origin);
 if(target.origin!==origin || !/^\/api\/dispatcher\/[A-Za-z0-9/_-]+$/.test(target.pathname) ||
    target.search || target.hash)throw new Error("Invalid dispatcher verification endpoint.");
 const idToken=await user.getIdToken(true);
 const response=await fetcher(target.href,{method:"GET",headers:{Authorization:"Bearer "+idToken,Accept:"application/json"},cache:"no-store",redirect:"error"});
 if(response.status===403)return false; // verified non-staff remains a customer; no dispatcher privilege
 if(!response.ok || !(response.headers.get("content-type")||"").startsWith("application/json"))
  throw new Error("Directory role lookup unavailable.");
 const result=await response.json();
 if(result.role!=="dispatcher"||result.workspace!=="dispatcher")throw new Error("Unverified Dispatcher role.");
 return true;
}
