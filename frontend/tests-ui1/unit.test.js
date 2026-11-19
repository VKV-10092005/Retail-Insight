import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {normalizeTheme,resolveTheme,applyTheme} from '../src/design-system/theme.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const boot=read('../public/theme-init.js');
function bootstrap(value,dark,{blocked=false,noMedia=false}={}){
 const root={dataset:{},style:{}},meta={setAttribute(k,v){this[k]=v;}};
 vm.runInNewContext(boot,{localStorage:{getItem(){if(blocked)throw Error('denied');return value;}},
  window:{matchMedia(){if(noMedia)throw Error('unsupported');return {matches:dark};}},
  document:{documentElement:root,querySelector(){return meta;}}});
 return {root,meta};
}
for(const preference of ['light','dark','system',null,'invalid','<script>'])for(const dark of [false,true]){
 test('bootstrap and resolver agree: '+preference+' / OS dark='+dark,()=>{
  const {root,meta}=bootstrap(preference,dark),expected=resolveTheme(preference,dark);
  assert.equal(root.dataset.theme,expected);assert.equal(root.style.colorScheme,expected);
  assert.equal(root.dataset.themePreference,normalizeTheme(preference));
  assert.equal(meta.content,expected==='dark'?'#080D1B':'#F6F8FC');
 });
}
test('storage denied and missing matchMedia use readable fallback',()=>{
 const r=bootstrap('dark',true,{blocked:true,noMedia:true});
 assert.equal(r.root.dataset.theme,'light');assert.equal(r.root.dataset.themeStorage,'blocked');
});
test('applyTheme only changes presentation state and theme meta',()=>{
 const meta={},root={dataset:{},style:{},ownerDocument:{querySelector:()=>({setAttribute:(k,v)=>meta[k]=v})}};
 applyTheme('dark',false,root);assert.equal(root.dataset.theme,'dark');assert.equal(meta.content,'#080D1B');
 applyTheme('system',false,root);assert.equal(root.dataset.theme,'light');
});
test('early bootstrap precedes body and module entry in both documents',()=>{
 for(const name of ['../index.html','../ui1-preview.html']){
  const html=read(name);assert.ok(html.indexOf('src="/theme-init.js"')<html.indexOf('<body>'));
  assert.ok(html.indexOf('src="/theme-init.js"')<html.indexOf('type="module"'));
 }
 assert.ok(!/fetch|XMLHttpRequest|cookie|sessionStorage/.test(boot));
});
const css=read('../src/design-system/tokens.css');
const parse=s=>Object.fromEntries([...s.matchAll(/--ri-([a-z-]+):\s*(#[a-fA-F0-9]{6})/g)].map(m=>[m[1],m[2]]));
const light=parse(css.match(/:root\{([\s\S]*?)\}/)[1]);
const dark={...light,...parse(css.match(/\[data-theme="dark"\]\{([\s\S]*?)\}/)[1])};
const lum=h=>h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
for(const [name,palette] of [['light',light],['dark',dark]])for(const [foreground,background] of [
 ['text','bg'],['text','surface'],['muted','surface'],['on-primary','primary'],
 ['success','success-bg'],['warning','warning-bg'],['danger','danger-bg'],['info','info-bg']]){
 test(name+' opaque contrast '+foreground+'/'+background,()=>assert.ok(contrast(palette[foreground],palette[background])>=4.5));
}
test('tokens cover typography, geometry, motion, breakpoints and layers',()=>{
 for(const key of ['--ri-font','--ri-space-16','--ri-radius-lg','--ri-shadow-lg','--ri-motion-fast','--ri-bp-md','--ri-z-modal'])assert.ok(css.includes(key));
 assert.ok(contrast('#FFFFFF','#6366F1')<4.5);assert.equal(light.primary,'#4F46E5');
});
test('existing routes, auth, API, operations, backend and AI stay byte-identical',()=>{
 const baseline=JSON.parse(read('../../docs/ui1/SOURCE_BASELINE.json'));
 const allowed=new Set(['frontend/index.html','frontend/src/main.jsx','frontend/src/components/layout/AppLayout.jsx','frontend/src/components/ui/Elements.jsx','frontend/package.json']);
 let checked=0;
 for(const f of baseline){if(allowed.has(f.path))continue;
  const bytes=readFileSync(new URL('../../'+f.path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256,f.path);checked++;
 }
 assert.ok(checked>=100);
});
test('legacy adapters retain named exports and value-only change contracts',()=>{
 const source=read('../src/components/ui/Elements.jsx');
 for(const name of ['Card','SectionHeader','PageHeader','Stat','Badge','SearchField','Select','Pagination','TableWrap','DemoNote','ExportCSV'])assert.ok(source.includes('export function '+name));
 assert.ok(source.includes('onChange={e=>onChange(e.target.value)}'));assert.ok(source.includes('FoundationCard'));
});
test('preview graph never imports auth/business services; config cannot collect DB E2E',()=>{
 const preview=read('../src/design-system/preview.jsx'),config=read('../playwright.ui1.config.js'),vite=read('../vite.ui1.config.js');
 assert.ok(!/from.*(?:auth\/|operations\/|services\/|backend)/.test(preview));
 assert.ok(config.includes("testDir:'./tests-ui1'"));assert.ok(!config.includes('dotenv'));
 assert.ok(vite.includes('envDir:false'));assert.ok(vite.includes('proxy:{}'));
 assert.ok(vite.includes("p.startsWith('/api')"));
});
