import {initializeApp,applicationDefault,getApps} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {createFirestoreStore} from "./firestore-store.js";
import {validatePrivateBucket} from "./proof-policy.js";

// No production database is assumed. Fail closed until a Standard native-mode
// instance has been explicitly selected and its live metadata verified.
export async function createRuntime(env=process.env) {
  const projectId=env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT;
  const databaseId=env.DELIVERY_DATABASE_ID;
  if(!projectId||!databaseId||env.DELIVERY_DATABASE_EDITION!=="STANDARD")throw new Error("Select and verify a Standard Firestore database before activating deliveries.");
  if(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error("Production runtime does not accept emulator overrides.");
  const credential=applicationDefault();
  const access=await credential.getAccessToken();
  const metadata=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}`,{headers:{Authorization:`Bearer ${access.access_token}`},signal:AbortSignal.timeout(10000)});
  if(!metadata.ok)throw new Error("Database metadata could not be verified.");
  const database=await metadata.json();
  if(database.databaseEdition!=="STANDARD"||database.type!=="FIRESTORE_NATIVE")throw new Error("This adapter requires an explicitly verified Standard native Firestore database.");
  const appName=`franks24-delivery-${projectId}`;
  const app=getApps().find(app=>app.name===appName)||initializeApp({credential,projectId},appName);
  const db=getFirestore(app,databaseId), store=createFirestoreStore(db);
  async function proofBucket() {
    if(!env.DELIVERY_PROOF_BUCKET)throw new Error("Proof storage is not configured.");
    const bucket=getStorage(app).bucket(env.DELIVERY_PROOF_BUCKET);
    const [[metadata],[policy]]=await Promise.all([bucket.getMetadata(),bucket.iam.getPolicy()]);
    validatePrivateBucket(metadata,policy);return bucket;
  }
  return {
    app,db,store,proofBucket,
    verifyToken:token=>getAuth(app).verifyIdToken(token,true),
    async readProof(proof) {
      const file=(await proofBucket()).file(proof.path,{generation:proof.generation});
      const [metadata]=await file.getMetadata();
      if(metadata.contentType!=="application/pdf"||Number(metadata.size)>10*1024*1024||metadata.metadata?.firebaseStorageDownloadTokens)throw new Error("Proof metadata failed validation.");
      const [bytes]=await file.download({validation:"crc32c"});return bytes;
    }
  };
}
