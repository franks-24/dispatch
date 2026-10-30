// Reject stale auth/profile results before they can expose another session's UI.
export function createIdentitySession({load, publish}) {
 let generation=0;
 return {
  get generation(){return generation},
  isCurrent(version){return version===generation},
  async resolve(user){
   const version=++generation;
   publish({phase:user?"loading":"signed_out",user,profile:null,hasAgreement:false});
   if(!user)return;
   try{
    const result=await load(user);
    if(version!==generation)return;
    if(result.profile && !["worker","employer"].includes(result.profile.role))throw new Error("invalid-profile-role");
    publish({phase:result.profile&&result.hasAgreement?"ready":"onboarding",user,...result});
   }catch(error){if(version===generation)publish({phase:"error",user,profile:null,hasAgreement:false,error})}
  }
 };
}
