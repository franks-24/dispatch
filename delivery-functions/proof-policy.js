// Validate actual bucket metadata/IAM before either upload or download.
export function validatePrivateBucket(metadata,policy) {
  const iam=metadata?.iamConfiguration;
  if(iam?.publicAccessPrevention!=="enforced" || iam?.uniformBucketLevelAccess?.enabled!==true || (policy?.bindings||[]).some(binding=>(binding.members||[]).some(member=>member==="allUsers"||member==="allAuthenticatedUsers")))throw new Error("Proof bucket is not private.");
}
