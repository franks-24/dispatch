// Serializable, rollback-capable test repository. Never imported by production code.
export function memoryStore() {
  const data=new Map();let tail=Promise.resolve();
  return {
    data,
    async get(path){return structuredClone(data.get(path)||null);},
    async list(path,{limit,cursor}){const entries=[...data].filter(([key])=>key.startsWith(path+"/")&&key.slice(path.length+1).split("/").length===1).map(([,value])=>structuredClone(value)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));const offset=cursor?entries.findIndex(x=>x.id===cursor)+1:0;const items=entries.slice(offset,offset+limit);return {items,nextCursor:entries.length>offset+limit?items.at(-1).id:null};},
    transaction(work){const job=tail.then(async()=>{const snapshot=new Map([...data].map(([key,value])=>[key,structuredClone(value)]));const staged=[];let wrote=false;const result=await work({async get(path){if(wrote)throw new Error("Read after write");return structuredClone(snapshot.get(path)||null);},create(path,value){wrote=true;if(snapshot.has(path)||staged.some(([key])=>key===path))throw new Error("Duplicate create");staged.push([path,structuredClone(value)]);},set(path,value){wrote=true;staged.push([path,structuredClone(value)]);}});for(const [key,value]of staged)data.set(key,value);return result;});tail=job.catch(()=>{});return job;}
  };
}
