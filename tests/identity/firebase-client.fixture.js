import * as appSdk from "firebase/app";
import * as authSdk from "firebase/auth";
import * as dbSdk from "firebase/firestore";
export async function connectFirebase(){
 const app=appSdk.initializeApp({apiKey:"fake-api-key",authDomain:"demo-dispatch-identity.firebaseapp.com",projectId:"demo-dispatch-identity",appId:"1:123:web:identity-tests"});
 const auth=authSdk.getAuth(app),db=dbSdk.getFirestore(app);
 authSdk.connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
 dbSdk.connectFirestoreEmulator(db,"127.0.0.1",8080);
 await authSdk.setPersistence(auth,authSdk.browserLocalPersistence);
 const api={...authSdk,...dbSdk,
  async getDoc(ref){if(window.dispatchTestFailProfile&&ref.path.startsWith("users/")){const error=new Error("Test profile access denied");error.code="permission-denied";throw error}return dbSdk.getDoc(ref)},
  async signInWithPopup(){
   if(window.dispatchTestCancel){const error=new Error("Cancelled");error.code="auth/popup-closed-by-user";throw error}
   const account=window.dispatchTestAccount||"worker";
   const encode=value=>btoa(JSON.stringify(value)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
   const token=encode({alg:"none",typ:"JWT"})+"."+encode({sub:account,email:account+"@example.test",email_verified:true,name:"Identity Test",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})+".";
   const result=await authSdk.signInWithCredential(auth,authSdk.GoogleAuthProvider.credential(token));
   window.dispatchTestUid=result.user.uid;return result;
  }
 };
 return {auth,db,api};
}
