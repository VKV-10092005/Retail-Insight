import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import tts from '../src/routes/tts.js';

test('TTS proxy returns MP3 and serves the second request from memory',async()=>{
 const originalFetch=globalThis.fetch;
 let upstreamCalls=0;
 globalThis.fetch=async()=>{upstreamCalls+=1;return new Response(Buffer.from('fixture-mp3'),{status:200,headers:{'Content-Type':'audio/mpeg'}});};
 const app=express();app.use('/api/v1/tts',tts);app.use((error,req,res,next)=>res.status(error.status||500).json({message:error.message}));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 try{
  const {port}=server.address(),url=`http://127.0.0.1:${port}/api/v1/tts/speak?text=${encodeURIComponent('Lời đọc kiểm thử bộ nhớ đệm')}`;
  const first=await originalFetch(url),firstAudio=Buffer.from(await first.arrayBuffer());
  const second=await originalFetch(url),secondAudio=Buffer.from(await second.arrayBuffer());
  assert.equal(first.status,200);assert.equal(first.headers.get('content-type'),'audio/mpeg');assert.equal(first.headers.get('x-tts-cache'),'MISS');
  assert.equal(second.status,200);assert.equal(second.headers.get('x-tts-cache'),'HIT');assert.deepEqual(secondAudio,firstAudio);assert.equal(upstreamCalls,1);
 }finally{
  globalThis.fetch=originalFetch;
  await new Promise(resolve=>server.close(resolve));
 }
});
