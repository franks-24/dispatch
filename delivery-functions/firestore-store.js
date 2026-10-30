import {FieldPath} from "firebase-admin/firestore";
import {HttpError} from "./service.js";

export function createFirestoreStore(db) {
  return {
    async get(path) {const snapshot=await db.doc(path).get();return snapshot.exists?snapshot.data():null;},
    transaction(work) {
      return db.runTransaction(async native=>work({
        async get(path) {const snapshot=await native.get(db.doc(path));return snapshot.exists?snapshot.data():null;},
        create(path,value) {native.create(db.doc(path),value);},
        set(path,value) {native.set(db.doc(path),value);}
      }));
    },
    async list(path,{limit,cursor}) {
      let query=db.collection(path).orderBy("createdAt","desc").orderBy(FieldPath.documentId(),"desc");
      if(cursor){const snapshot=await db.doc(`${path}/${cursor}`).get();if(!snapshot.exists)throw new HttpError(400,"Invalid cursor.");query=query.startAfter(snapshot);}
      const result=await query.limit(limit+1).get();const docs=result.docs.slice(0,limit);
      return {items:docs.map(doc=>doc.data()),nextCursor:result.docs.length>limit?docs.at(-1).id:null};
    }
  };
}
