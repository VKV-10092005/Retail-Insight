import {readFile,writeFile} from 'node:fs/promises';
import {buildCandidate} from './candidate.js';
const args=process.argv.slice(2);
if(args.some(a=>!['--inspect','--write-candidate'].includes(a)))throw Error('Only offline inspect/write-candidate supported; no apply command');
const r=await buildCandidate(),target=new URL('../../../releases/p14-a20h-rc2/candidate.json',import.meta.url);
if(args.includes('--write-candidate')){
 let old;try{old=JSON.parse(await readFile(target,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(old&&old.digest!==r.digest)throw Error('Refuse to overwrite changed RC2; review/version explicitly');
 await writeFile(target,JSON.stringify(r,null,2)+'\n','utf8');
}
console.log(JSON.stringify({releaseId:r.releaseId,state:r.state,digest:r.digest,
 phases:r.phases.length,steps:r.phases.reduce((n,p)=>n+p.steps.length,0),
 nativeVerified:r.nativeVerified,sqlExecuted:false}));

