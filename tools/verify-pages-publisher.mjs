import {pathToFileURL} from "node:url";
export async function verifyPagesPublisher({token,repository,fetcher=fetch}){
 if(repository!=="franks-24/dispatch"||!token)throw Error("Pages verification requires this repository's workflow token.");
 const response=await fetcher("https://api.github.com/repos/"+repository+"/pages",{
  headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},
  redirect:"error",signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error("Cannot verify Pages settings (HTTP "+response.status+"). No deployment was started.");
 const site=await response.json();
 if(site.build_type!=="workflow")throw Error("Set Settings > Pages > Build and deployment > Source to GitHub Actions at https://github.com/franks-24/dispatch/settings/pages. The legacy branch publisher can overwrite the tested artifact.");
 return {buildType:site.build_type};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await verifyPagesPublisher({token:process.env.GH_TOKEN,repository:process.env.GITHUB_REPOSITORY});
 console.log("Verified a single Pages publisher: "+result.buildType);
}

