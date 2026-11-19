import {createHash,verify as verifySignature} from 'node:crypto';
export const digest=x=>createHash('sha256').update(typeof x==='string'?x:canonical(x)).digest('hex');
export function canonical(x){
 if(x===null||typeof x!=='object')return JSON.stringify(x);
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
}
export function immutable(x){
 const copy=structuredClone(x);
 const freeze=v=>{if(v&&typeof v==='object'){for(const c of Object.values(v))freeze(c);Object.freeze(v);}return v;};
 return freeze(copy);
}
export const denySchemas=new Set(['retail_app','retail_management','retail_datawarehouse']);
export const isHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const isUuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x);
export function reject(code){throw Object.assign(new Error('P14_RC2: '+code),{code,status:503});}
export function assertTarget(permit,identity,action){
 if(permit?.stage!=='A2_1_DISPOSABLE'||permit.allowNativeWrites!==true||!permit.approvalRef||!permit.runId||
  !permit.actions?.includes(action)||!isUuid(permit.serverUuid)||
  !Array.isArray(permit.forbiddenServerUuids)||!permit.forbiddenServerUuids.length||
  permit.forbiddenServerUuids.includes(identity.server_uuid)||identity.server_uuid!==permit.serverUuid||
  denySchemas.has(identity.database)||!/^retail_p14_test_[a-zA-Z0-9_]{1,48}$/.test(identity.database??'')||
  permit.schemas?.length!==1||permit.schemas[0]!==identity.database)reject('TARGET_OR_AUTHORITY');
}
export function bindingOf(release,target,runId){
 return digest({release:release.digest,target:{schema:target.database,uuid:target.server_uuid,
  host:target.host,port:target.port},runId});
}
export function verifyAttestation(attestation,{publicKey,expected,now=Date.now()}){
 const p=attestation?.payload;
 if(!p||!publicKey||!attestation.signature||!isHash(p.evidenceDigest)||
  !Number.isFinite(Date.parse(p.issuedAt))||!Number.isFinite(Date.parse(p.expiresAt))||
  Date.parse(p.issuedAt)>now||Date.parse(p.expiresAt)<=now||
  Date.parse(p.expiresAt)-Date.parse(p.issuedAt)>3600000||
  !p.operator||!p.nonce)reject('ATTESTATION_INVALID');
 for(const [k,v] of Object.entries(expected))if(canonical(p[k])!==canonical(v))reject('ATTESTATION_BINDING');
 try{if(!verifySignature(null,Buffer.from(canonical(p)),publicKey,Buffer.from(attestation.signature,'base64')))reject('ATTESTATION_SIGNATURE');}
 catch{reject('ATTESTATION_SIGNATURE');}
 return immutable(p);
}

