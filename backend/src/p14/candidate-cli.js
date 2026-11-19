import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {buildCandidate,releaseDigest} from './migration.js';

// Artifact tooling only: no connector, dotenv, runtime pool, runner execution or SQL call.
if(process.argv.slice(2).some(a=>a!=='--write-candidate'))throw Error('Only --write-candidate is supported; there is no apply command');
const release=await buildCandidate(fileURLToPath(new URL('../../../docs/p1_4_a0_sql/',import.meta.url)));
const target=new URL('../../releases/p14-a1-rc1/candidate.json',import.meta.url);
if(process.argv.includes('--write-candidate')){
 // Refuse overwriting a different release. Review edits need a new candidate directory/version.
 let existing=null;
 try{existing=JSON.parse(await readFile(target,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(existing&&existing.digest!==releaseDigest(release))throw Error('Candidate changed; version/review explicitly before replacing');
 await writeFile(target,JSON.stringify(release,null,2)+'\n',{encoding:'utf8'});
}
console.log(JSON.stringify({releaseId:release.releaseId,state:release.state,digest:release.digest,
 steps:release.steps.length,manualTemplates:release.manualTemplates.length,sqlExecuted:false}));

