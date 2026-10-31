import {createHash, randomUUID} from "node:crypto";

export class HttpError extends Error {
  constructor(status, message) {super(message);this.status=status;}
}
const requireValue = (condition, status, message) => {if(!condition)throw new HttpError(status,message);};
export const hash = value => createHash("sha256").update(value).digest("hex");
export const customerPath = uid => `deliveryCustomers/${hash(uid)}`;
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const fingerprint = value => hash(JSON.stringify(canonical(value)));
function text(value, min=3, max=300) {requireValue(typeof value==="string" && value.trim().length>=min && value.trim().length<=max,400,"Invalid request fields.");return value.trim();}
function fields(body, allowed) {requireValue(body && typeof body==="object" && !Array.isArray(body) && Object.keys(body).every(key=>allowed.includes(key)),400,"Unexpected request fields.");}
function consent(body, version) {
  fields(body,["version","terms","privacy","ownership"]);
  requireValue(body.version===version && body.terms===true && body.privacy===true && body.ownership===true,400,"Acknowledge the current delivery policies.");
  return {version,terms:true,privacy:true,ownership:true};
}
function quoteFields(body) {
  fields(body,["pickupArea","deliveryArea","weightKg","lengthCm","widthCm","heightCm","service","acceptance"]);
  const result={pickupArea:text(body.pickupArea,3,160),deliveryArea:text(body.deliveryArea,3,160),service:body.service};
  requireValue(["economy","express"].includes(result.service),400,"Invalid service.");
  for(const key of ["weightKg","lengthCm","widthCm","heightCm"]){requireValue(typeof body[key]==="number" && Number.isFinite(body[key]) && body[key]>0 && body[key]<=(key==="weightKg"?1000:500),400,"Invalid parcel dimensions.");result[key]=body[key];}
  return result;
}
function bookingFields(body) {
  fields(body,["quoteId","pickupAddress","deliveryAddress","recipientName","recipientPhone","acceptance"]);
  requireValue(validId(body.quoteId),400,"Invalid quote reference.");
  const result={quoteId:body.quoteId};
  for(const key of ["pickupAddress","deliveryAddress","recipientName","recipientPhone"])result[key]=text(body[key]);
  requireValue(/^\+?[\d ()-]{7,30}$/.test(result.recipientPhone),400,"Invalid recipient phone.");return result;
}
const transitions={requested:["confirmed","cancelled"],confirmed:["collected","cancelled"],collected:["in_transit","exception"],in_transit:["out_for_delivery","exception"],out_for_delivery:["delivered","exception"],exception:["in_transit","out_for_delivery","cancelled"],delivered:[],cancelled:[]};
function shipmentView(shipment) {
  const {id,reference,status,pickupArea,deliveryArea,updatedAt,events}=shipment;
  return {id,reference,status,pickupArea,deliveryArea,updatedAt,events,proofAvailable:status==="delivered" && Boolean(shipment.proof)};
}
function quoteView(quote) {
  const {id,status,pickupArea,deliveryArea,service,createdAt,totalMinor,currency,expiresAt}=quote;
  return {id,status,pickupArea,deliveryArea,service,createdAt,...(status!=="pending"?{totalMinor,currency,expiresAt}:{})};
}

// Store transactions must provide serializable isolation and commit all writes atomically.
// Transaction callbacks do not call carriers, send mail or write external objects.
export function createService({store, verifyToken, readProof, enabled=false, policyVersion, clock=Date.now, uuid=randomUUID, maxPerMinute=60}) {
  async function rate(uid) {
    const minute=Math.floor(clock()/60000);const path=`${customerPath(uid)}/limits/${minute}`;
    await store.transaction(async tx=>{const prior=await tx.get(path);requireValue((prior?.count||0)<maxPerMinute,429,"Too many requests.");tx.set(path,{count:(prior?.count||0)+1,expiresAt:new Date((minute+120)*60000)});});
  }
  async function write(uid, operation, key, body, mutation) {
    requireValue(typeof key==="string" && /^[A-Za-z0-9_-]{8,128}$/.test(key),400,"An idempotency key is required.");
    const parent=customerPath(uid), path=`${parent}/requests/${hash(`${operation}:${key}`)}`, digest=fingerprint(body);
    return store.transaction(async tx=>{
      const previous=await tx.get(path);
      if(previous){requireValue(previous.digest===digest,409,"Idempotency key conflicts with an earlier request.");return previous.response;}
      const now=clock(), at=new Date(now).toISOString();
      const response=await mutation(tx,parent,at,now);
      if(body.acceptance)tx.create(`${parent}/agreements/${uuid()}`,{uid,acceptance:body.acceptance,acceptedAt:at,operation,requestDigest:digest});
      tx.create(path,{digest,response,createdAt:at,operation});return response;
    });
  }
  async function execute(uid, method, url, headers, body) {
    const parent=customerPath(uid), route=url.pathname;

    if(method==="GET"&&route==="/api/deliveries/profile"){
      const profile=await store.get(parent);
      return {profile:profile?{displayName:profile.displayName,phone:profile.phone,updatedAt:profile.updatedAt}:null};
    }
    if(method==="POST"&&route==="/api/deliveries/profile"){
      fields(body,["displayName","phone","acceptance"]);consent(body.acceptance,policyVersion);
      const displayName=text(body.displayName,2,120),phone=text(body.phone,7,30);
      requireValue(/^\+?[\d ()-]{7,30}$/.test(phone),400,"Invalid contact phone.");
      return write(uid,"profile",headers["idempotency-key"],body,async(tx,parent,at)=>{
        tx.set(parent,{displayName,phone,updatedAt:at});
        return {profile:{displayName,phone,updatedAt:at}};
      });
    }
    if(method==="POST"&&route==="/api/deliveries/privacy-requests"){
      fields(body,["type","details"]);
      requireValue(["access","correction","erasure","withdrawal"].includes(body.type),400,"Select a supported privacy request.");
      const details=text(body.details,3,1000);
      return write(uid,"privacy-request",headers["idempotency-key"],body,async(tx,parent,at)=>{
        const request={id:uuid(),type:body.type,details,status:"received_for_review",createdAt:at};
        tx.create(parent+"/privacyRequests/"+request.id,request);
        tx.create("dispatchPrivacyQueue/"+request.id,{...request,customerUid:uid});
        return {request};
      });
    }
    if(method==="POST" && route==="/api/deliveries/quotes") {
      const data=quoteFields(body);consent(body.acceptance,policyVersion);
      return write(uid,"quote",headers["idempotency-key"],body,async(tx,parent,at)=>{const id=uuid();const response={id,status:"pending"};tx.create(`${parent}/quotes/${id}`,{...data,...response,createdAt:at,updatedAt:at});tx.create(`dispatchQuoteQueue/${hash(uid+":"+id)}`,{id:hash(uid+":"+id),customerUid:uid,quoteId:id,...data,status:"pending",createdAt:at});return response;});
    }
    if(method==="POST" && route==="/api/deliveries/bookings") {
      const data=bookingFields(body);consent(body.acceptance,policyVersion);
      return write(uid,"booking",headers["idempotency-key"],body,async(tx,parent,at,now)=>{
        const quotePath=`${parent}/quotes/${data.quoteId}`, quote=await tx.get(quotePath);
        requireValue(quote,404,"No matching quote.");
        requireValue(quote.status==="quoted" && Date.parse(quote.expiresAt)>now && Number.isSafeInteger(quote.totalMinor) && quote.totalMinor>0 && quote.currency==="ZAR" && quote.coverageApproved===true,409,"Quote is unavailable, expired or already booked.");
        const id=uuid(), response={id,reference:id,status:"requested"};
        tx.create(`${parent}/shipments/${id}`,{...response,...data,pickupArea:quote.pickupArea,deliveryArea:quote.deliveryArea,service:quote.service,totalMinor:quote.totalMinor,currency:quote.currency,createdAt:at,updatedAt:at,events:[{status:"requested",at,description:"Collection requested; awaiting confirmation."}]});
        tx.set(quotePath,{...quote,status:"booked",shipmentId:id,updatedAt:at});tx.create(`dispatchShipmentQueue/${hash(uid+":"+id)}`,{id:hash(uid+":"+id),customerUid:uid,shipmentId:id,reference:response.reference,status:"requested",pickupArea:quote.pickupArea,deliveryArea:quote.deliveryArea,createdAt:at});return response;
      });
    }
    if(method==="GET" && ["/api/deliveries/quotes","/api/deliveries/shipments"].includes(route)) {
      const limit=Number(url.searchParams.get("limit")||100);requireValue(Number.isInteger(limit)&&limit>=1&&limit<=100,400,"Invalid page size.");
      const cursor=url.searchParams.get("cursor");requireValue(!cursor||validId(cursor),400,"Invalid cursor.");
      const collection=route.endsWith("quotes")?"quotes":"shipments";
      const page=await store.list(`${parent}/${collection}`,{limit,cursor});
      return {...page,items:page.items.map(collection==="quotes"?quoteView:shipmentView)};
    }
    const match=route.match(/^\/api\/deliveries\/shipments\/([A-Za-z0-9_-]{1,128})(\/proof)?$/);
    if(method==="GET" && match) {
      const shipment=await store.get(`${parent}/shipments/${match[1]}`);
      requireValue(shipment,404,"No matching delivery.");
      if(!match[2])return shipmentView(shipment);
      requireValue(shipment.status==="delivered" && shipment.proof,404,"Proof is not available.");
      const expected=`delivery-proofs/${hash(uid)}/${shipment.id}/`;
      requireValue(shipment.proof.path.startsWith(expected) && /^\d+$/.test(String(shipment.proof.generation)),503,"Proof is unavailable.");
      const bytes=await readProof(shipment.proof);
      requireValue(Buffer.isBuffer(bytes) && bytes.length<=10*1024*1024 && bytes.subarray(0,5).toString()==="%PDF-",503,"Proof is unavailable.");
      await store.transaction(async tx=>{tx.create(`${parent}/audit/${uuid()}`,{type:"proof-read",shipmentId:shipment.id,at:new Date(clock()).toISOString()});});
      return {pdf:bytes};
    }
    throw new HttpError(404,"Unknown delivery endpoint.");
  }
  async function handle({method,path,headers={},body}) {
    const responseHeaders={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Type":"application/json"};
    try {
      requireValue(enabled && typeof policyVersion==="string" && policyVersion.length>0,503,"Delivery service is not open.");
      requireValue(["GET","POST"].includes(method),405,"Method not allowed.");
      const bearer=headers.authorization?.match(/^Bearer ([^\s]+)$/);requireValue(bearer,401,"Sign in to continue.");
      let identity;try{identity=await verifyToken(bearer[1]);}catch{throw new HttpError(401,"Invalid or expired session.");}
      requireValue(identity?.uid && identity.firebase?.sign_in_provider==="google.com" && identity.email_verified===true,403,"A verified Google account is required.");
      if(method==="POST") {
        requireValue(headers["content-type"]?.split(";")[0]==="application/json",415,"JSON is required.");
        requireValue(Buffer.byteLength(JSON.stringify(body) || "")<=16384,413,"Request is too large.");
      }
      await rate(identity.uid);
      const result=await execute(identity.uid,method,new URL(path,"https://delivery.invalid"),headers,body);
      if(result.pdf)return {status:200,headers:{...responseHeaders,"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="Franks24-proof-of-delivery.pdf"'},body:result.pdf};
      return {status:method==="POST"?201:200,headers:responseHeaders,body:result};
    }catch(error){const status=error instanceof HttpError?error.status:503;return {status,headers:responseHeaders,body:{error:error instanceof HttpError?error.message:"Delivery service unavailable."}};}
  }
  return {handle};
}

// Privileged operations are called by the IAM-authorised operator CLI, never customer routes.
export function createOperator({store,clock=Date.now,uuid=randomUUID}) {
  return {
    async issueQuote(uid,id,{totalMinor,expiresAt,coverageApproved,operator}) {
      requireValue(validId(id)&&Number.isSafeInteger(totalMinor)&&totalMinor>0&&totalMinor<=100000000&&Date.parse(expiresAt)>clock()&&coverageApproved===true,400,"A positive ZAR price, future expiry and verified coverage are required.");
      const path=`${customerPath(uid)}/quotes/${id}`;
      await store.transaction(async tx=>{const quote=await tx.get(path);requireValue(quote,404,"Quote not found.");requireValue(quote.status==="pending",409,"Quote has already been issued.");const at=new Date(clock()).toISOString();tx.set(path,{...quote,status:"quoted",totalMinor,currency:"ZAR",expiresAt:new Date(expiresAt).toISOString(),coverageApproved:true,updatedAt:at});tx.create(`${customerPath(uid)}/audit/${uuid()}`,{type:"quote-issued",quoteId:id,operator,at,totalMinor});});
    },
    async advance(uid,id,{status,description,carrierReference,operator}) {
      const path=`${customerPath(uid)}/shipments/${id}`;requireValue(validId(id),400,"Invalid shipment.");
      await store.transaction(async tx=>{const shipment=await tx.get(path);requireValue(shipment,404,"Shipment not found.");requireValue(transitions[shipment.status]?.includes(status),409,"Invalid delivery transition.");requireValue(status!=="confirmed" || (typeof carrierReference==="string" && carrierReference.trim().length>=3 && carrierReference.length<=160),400,"Confirmation requires a carrier booking reference.");const at=new Date(clock()).toISOString();const event={status,at,description:text(description,3,300)};requireValue(shipment.events.length<200,409,"Event limit reached; operator review required.");tx.set(path,{...shipment,status,updatedAt:at,events:[...shipment.events,event],...(status==="confirmed"?{carrierReference}:{} )});tx.create(`${customerPath(uid)}/audit/${uuid()}`,{type:"shipment-transition",shipmentId:id,operator,status,at});});
    },
    async attachProof(uid,id,proof,operator) {
      requireValue(validId(id) && proof.path.startsWith(`delivery-proofs/${hash(uid)}/${id}/`) && /^\d+$/.test(String(proof.generation)),400,"Invalid proof object.");
      const path=`${customerPath(uid)}/shipments/${id}`;
      await store.transaction(async tx=>{const shipment=await tx.get(path);requireValue(shipment?.status==="delivered",409,"Proof requires a delivered shipment.");requireValue(!shipment.proof,409,"Proof is already recorded.");const at=new Date(clock()).toISOString();tx.set(path,{...shipment,proof,updatedAt:at});tx.create(`${customerPath(uid)}/audit/${uuid()}`,{type:"proof-attached",shipmentId:id,operator,at});});
    }
  };
}
