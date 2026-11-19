import {Router} from 'express';
import {asyncRoute,HttpError} from '../utils/http.js';

const router=Router();
const audioCache=new Map();
const pendingAudio=new Map();
const MAX_CACHE_ITEMS=64;
const CACHE_TTL_MS=6*60*60*1000;
const MAX_TEXT_LENGTH=420;

const normalizeText=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim();
const escapeXml=value=>value.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));

function remember(key,value){
 audioCache.delete(key);
 audioCache.set(key,{...value,cachedAt:Date.now()});
 while(audioCache.size>MAX_CACHE_ITEMS)audioCache.delete(audioCache.keys().next().value);
}

function cached(key){
 const entry=audioCache.get(key);
 if(!entry)return null;
 if(Date.now()-entry.cachedAt>CACHE_TTL_MS){audioCache.delete(key);return null;}
 audioCache.delete(key);audioCache.set(key,entry);
 return entry;
}

async function fetchWithTimeout(url,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{return await fetch(url,{...options,signal:controller.signal});}
 finally{clearTimeout(timer);}
}

async function synthesizeAzure(text){
 const key=process.env.AZURE_SPEECH_KEY,region=process.env.AZURE_SPEECH_REGION;
 if(!key||!region)return null;
 const voice=process.env.AZURE_TTS_VOICE||'vi-VN-HoaiMyNeural';
 const endpoint=`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
 const ssml=`<speak version="1.0" xml:lang="vi-VN"><voice name="${escapeXml(voice)}"><prosody rate="+2%" pitch="+0Hz">${escapeXml(text)}</prosody></voice></speak>`;
 const response=await fetchWithTimeout(endpoint,{method:'POST',headers:{'Ocp-Apim-Subscription-Key':key,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'audio-24khz-48kbitrate-mono-mp3','User-Agent':'RetailInsightTTS'},body:ssml});
 if(!response.ok)throw new Error(`Azure Speech trả về HTTP ${response.status}`);
 return {audio:Buffer.from(await response.arrayBuffer()),contentType:'audio/mpeg',provider:'azure-hoai-my'};
}

async function synthesizeGoogle(text){
 const url=new URL('https://translate.google.com/translate_tts');
 url.search=new URLSearchParams({ie:'UTF-8',client:'tw-ob',tl:'vi',q:text}).toString();
 const response=await fetchWithTimeout(url,{headers:{Accept:'audio/mpeg,audio/*;q=0.9','Accept-Language':'vi-VN,vi;q=0.9','User-Agent':'Mozilla/5.0 RetailInsightTTS/1.0'}});
 if(!response.ok)throw new Error(`Google TTS trả về HTTP ${response.status}`);
 const contentType=response.headers.get('content-type')||'';
 if(!contentType.toLowerCase().includes('audio'))throw new Error('Nhà cung cấp TTS không trả về âm thanh');
 return {audio:Buffer.from(await response.arrayBuffer()),contentType:'audio/mpeg',provider:'google-vi'};
}

async function synthesize(text){
 try{
  const azure=await synthesizeAzure(text);
  if(azure)return azure;
 }catch(error){
  console.warn('Azure TTS unavailable, falling back to Google TTS:',error.message);
 }
 return synthesizeGoogle(text);
}

router.get('/speak',asyncRoute(async(req,res)=>{
 const text=normalizeText(req.query.text);
 if(!text)throw new HttpError(400,'Thiếu nội dung cần đọc');
 if(text.length>MAX_TEXT_LENGTH)throw new HttpError(400,`Nội dung đọc tối đa ${MAX_TEXT_LENGTH} ký tự`);
 const key=`vi-female:${text}`;
 let entry=cached(key),cacheStatus='HIT';
 if(!entry){
  cacheStatus='MISS';
  let task=pendingAudio.get(key);
  if(!task){task=synthesize(text).finally(()=>pendingAudio.delete(key));pendingAudio.set(key,task);}
  try{entry=await task;}catch(error){throw new HttpError(502,`Không thể tạo giọng đọc lúc này: ${error.message}`);}
  if(!entry.audio.length)throw new HttpError(502,'Dịch vụ giọng đọc trả về tệp rỗng');
  remember(key,entry);
 }
 res.set({
  'Content-Type':entry.contentType,
  'Content-Length':String(entry.audio.length),
  'Cache-Control':'private, max-age=21600',
  'X-TTS-Cache':cacheStatus,
  'X-TTS-Provider':entry.provider
 });
 res.send(entry.audio);
}));

export default router;
