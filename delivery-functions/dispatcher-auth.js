// Server-only Dispatcher identity policy. Never expose Workspace Directory credentials in GitHub Pages.
// No privileges from email suffix, local profile.role, Firebase custom claims or browser controls.
export class DispatcherAccessError extends Error {
  constructor(status, message) { super(message); this.status=status; }
}
const fail=(status,message)=>{throw new DispatcherAccessError(status,message);};
const lower=value=>typeof value==="string"?value.trim().toLowerCase():"";
export function createDispatcherAuthorizer({verifyToken,lookupDirectoryUser,checkGroupMembership,workspaceCustomerId,dispatcherGroup}) {
  const configured=typeof verifyToken==="function" && typeof lookupDirectoryUser==="function" &&
    typeof checkGroupMembership==="function" && typeof workspaceCustomerId==="string" &&
    workspaceCustomerId.trim().length>0 && typeof dispatcherGroup==="string" && dispatcherGroup.trim().length>0;
  async function authorize(idToken) {
    if(!configured)fail(503,"Dispatcher identity is not configured.");
    if(typeof idToken!=="string" || !idToken || idToken.length>8192)fail(401,"Sign in to continue.");
    let identity;
    try {identity=await verifyToken(idToken);} catch {fail(401,"Invalid or expired session.");}
    if(!identity?.uid || identity.email_verified!==true ||
       identity.firebase?.sign_in_provider!=="google.com" || !lower(identity.email))
      fail(403,"Internal Google Workspace access required.");
    let person;
    try {person=await lookupDirectoryUser(identity.email);} catch {fail(503,"Directory verification unavailable.");}
    if(!person || person.customerId!==workspaceCustomerId || person.suspended!==false ||
       person.archived===true || typeof person.id!=="string" || !person.id ||
       lower(person.primaryEmail)!==lower(identity.email) &&
       !(Array.isArray(person.aliases)&&person.aliases.some(a=>lower(a)===lower(identity.email))))
      fail(403,"Dispatcher access denied.");
    let member;
    try{member=await checkGroupMembership(dispatcherGroup,person.id);}catch{fail(503,"Directory verification unavailable.");}
    if(member!==true)fail(403,"Dispatcher access denied.");
    return Object.freeze({uid:identity.uid,email:lower(identity.email),role:"dispatcher",workspace:"dispatcher"});
  }
  return {authorize};
}

// Exposes only a minimal role assertion; protected business endpoints must repeat authorization.
export function createDispatcherSessionService({authorizer,enabled=false}={}) {
  return {
    async handle({method,headers={}}) {
      const responseHeaders={"Cache-Control":"private, no-store","Content-Type":"application/json","X-Content-Type-Options":"nosniff"};
      try {
        if(!enabled || !authorizer || typeof authorizer.authorize!=="function")
          fail(503,"Dispatcher workspace is not enabled.");
        if(method!=="GET")fail(405,"Method not allowed.");
        const header=headers.authorization??headers.Authorization;
        const token=typeof header==="string"?header.match(/^Bearer ([^\s]+)$/)?.[1]:undefined;
        if(!token)fail(401,"Sign in to continue.");
        const result=await authorizer.authorize(token);
        return {status:200,headers:responseHeaders,body:{role:result.role,workspace:result.workspace}};
      } catch(error) {
        const status=error instanceof DispatcherAccessError?error.status:503;
        return {status,headers:responseHeaders,body:{error:error instanceof DispatcherAccessError?error.message:"Directory verification unavailable."}};
      }
    }
  };
}
