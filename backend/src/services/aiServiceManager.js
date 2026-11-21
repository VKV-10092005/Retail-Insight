import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const backendRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const projectRoot=path.resolve(backendRoot,'..');
const aiRoot=path.join(projectRoot,'ai-service');
let child=null, stopping=false, respawnTimer=null;
const rawAiServiceUrl=process.env.AI_SERVICE_URL||'http://127.0.0.1:8000';
const normalizedAiServiceUrl=/^[a-z][a-z\d+.-]*:\/\//i.test(rawAiServiceUrl)?rawAiServiceUrl:`https://${rawAiServiceUrl}`;
const healthUrl=normalizedAiServiceUrl.replace(/\/$/,'')+'/health';
const aiServiceUrl=new URL(normalizedAiServiceUrl);
const externalAiService=!['localhost','127.0.0.1','::1'].includes(aiServiceUrl.hostname);
async function healthy(){try{const r=await fetch(healthUrl,{signal:AbortSignal.timeout(15000)});return r.ok || r.status===429;}catch{return false;}}
function pythonCommand(){
 const candidates=[path.join(aiRoot,'.venv','Scripts','python.exe'),path.join(aiRoot,'venv','Scripts','python.exe'),path.join(projectRoot,'.venv','Scripts','python.exe'),path.join(projectRoot,'venv','Scripts','python.exe')];
 for(const candidate of candidates)if(existsSync(candidate))return {command:candidate,args:['-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000']};
 return process.platform==='win32'?{command:'py',args:['-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000']}:{command:'python3',args:['-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000']};
}
async function launch(){
 if(stopping||child||await healthy())return;
 const {command,args}=pythonCommand();
 console.log(`[AI] Starting FastAPI with ${command} ${args.join(' ')} (cwd: ${aiRoot}).`);
 child=spawn(command,args,{cwd:aiRoot,stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false,env:process.env});
 const current=child;
 current.stdout?.on('data',chunk=>process.stdout.write(`[AI] ${chunk}`));
 current.stderr?.on('data',chunk=>process.stderr.write(`[AI][stderr] ${chunk}`));
 current.once('error',error=>console.error(`[AI] Could not start FastAPI using ${command}:`,error));
 current.once('exit',(code,signal)=>{if(child===current)child=null;if(!stopping){console.warn(`[AI] FastAPI exited (${code??signal}); retrying in 2s.`);respawnTimer=setTimeout(()=>void launch(),2000);}});
 const deadline=Date.now()+30000;
 while(Date.now()<deadline&&!stopping){if(await healthy()){console.log('[AI] FastAPI health check passed.');return;}if(current.exitCode!==null)return;await new Promise(resolve=>setTimeout(resolve,400));}
 console.warn('[AI] FastAPI did not become healthy within 30 seconds.');
}
export function startAiService(){stopping=false;if(!externalAiService)void launch();}
export function restartAiService(){if(externalAiService||stopping||child)return;console.warn('[AI] Connection refused; starting FastAPI.');void launch();}
export function stopAiService(){stopping=true;clearTimeout(respawnTimer);if(child){const current=child;child=null;current.kill('SIGTERM');if(process.platform==='win32'&&current.pid)spawn('taskkill',['/pid',String(current.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});}}
