import {registerHooks,syncBuiltinESMExports} from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
const originalSocketConnect=net.Socket.prototype.connect;
const originalListen=net.Server.prototype.listen;
const originalFetch=globalThis.fetch;
const blocked=()=>{throw Error('A1 test forbids network access (including MySQL)');};
net.Socket.prototype.connect=blocked;
net.createConnection=blocked;
net.connect=blocked;
tls.connect=blocked;
dgram.createSocket=blocked;
globalThis.fetch=blocked;

// Legacy regression tests may import env.js. Never load runtime .env during A1 tests.
registerHooks({resolve(specifier,context,next){
 if(specifier==='dotenv/config')return {url:'data:text/javascript,export{}',shortCircuit:true};
 return next(specifier,context);
}});
syncBuiltinESMExports();

 // Optional regression-only HTTP: ephemeral servers created by this very process.
 // All other sockets (including MySQL and pre-existing loopback services) remain blocked.
if(process.env.P14_TEST_OWNED_HTTP==='1'){
 const ports=new Set(),hosts=new Set(['127.0.0.1','::1','localhost']);
 net.Server.prototype.listen=function(...args){
  const o=args[0],port=typeof o==='object'?o.port:o;
  const host=typeof o==='object'?o.host:args[1];
  if(Number(port)!==0||!hosts.has(host))return blocked();
  this.once('listening',()=>{const p=this.address().port;ports.add(p);this.once('close',()=>ports.delete(p));});
  return originalListen.apply(this,args);
 };
 net.Socket.prototype.connect=function(...args){
  const o=args[0],port=typeof o==='object'?Number(o.port):Number(o);
  const host=typeof o==='object'?o.host:typeof args[1]==='string'?args[1]:'localhost';
  if(!hosts.has(host)||!ports.has(port))return blocked();
  return originalSocketConnect.apply(this,args);
 };
 net.createConnection=net.connect=(...args)=>new net.Socket().connect(...args);
 globalThis.fetch=(input,...args)=>{
  const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(u.protocol!=='http:'||!hosts.has(u.hostname)||!ports.has(Number(u.port)))return blocked();
  return originalFetch(input,...args);
 };
 syncBuiltinESMExports();
}

