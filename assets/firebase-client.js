// Production SDK boundary. Browser tests replace this module via request routing;
// no emulator or test-account switch is shipped in the production application.
export async function connectFirebase(config) {
 const [appSdk,authSdk,dbSdk]=await Promise.all([
  import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
  import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
  import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js")
 ]);
 const app=appSdk.initializeApp(config);
 const auth=authSdk.getAuth(app),db=dbSdk.getFirestore(app);
 await authSdk.setPersistence(auth,authSdk.browserLocalPersistence);
 return {auth,db,api:{...authSdk,...dbSdk}};
}
