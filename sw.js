/* Cache only app files, explicitly saved map tiles, and public map metadata. */
importScripts('./offline-core.js');
const VERSION='territory-shell-20261019-offline1',META='territory-offline-meta-v1',PREFIX='territory-map-v1-';
const ROOT=new URL('./',self.location.href).href;
const FILES=['./','index.html','improvements.css','territories.js','app-core.js','records.js','personal.js','public-visits.js','inline-share.js','offline.js','offline-core.js','offline.css','vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css','vendor/leaflet/images/layers.png','vendor/leaflet/images/layers-2x.png','vendor/leaflet/images/marker-icon.png','vendor/leaflet/images/marker-icon-2x.png','vendor/leaflet/images/marker-shadow.png'];
const ASSETS=new Set(FILES.map(p=>new URL(p,ROOT).pathname));
const metaURL=id=>ROOT+'__offline/'+id;
async function metadata(verify=false){const cache=await caches.open(META),keys=await cache.keys(),rows=[];for(const k of keys){try{const r=await (await cache.match(k)).json();if(!/^T\d{4,}$/.test(r.id)||!r.cache?.startsWith(PREFIX)||!Number.isInteger(r.count))continue;if(verify){if(!(await caches.keys()).includes(r.cache)||(await (await caches.open(r.cache)).keys()).length!==r.count)continue;}rows.push(r);}catch{}}return rows;}
async function saveMap(data,progress){
 if(!/^T\d{4,}$/.test(data.id))throw Error('区域を確認できません。');
 const plan=OfflineCore.plan(data.boundary),name=PREFIX+data.id+'-'+Date.now()+'-'+Math.random().toString(36).slice(2),cache=await caches.open(name);let done=0,index=0,failed=false;
 try{
  async function worker(){while(!failed&&index<plan.urls.length){const url=plan.urls[index++];let response;
   for(let attempt=0;attempt<2;attempt++){try{response=await fetch(url,{mode:'cors',cache:'reload',signal:AbortSignal.timeout(20000)});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error();break;}catch(e){if(attempt){failed=true;throw e;}}}
   await cache.put(url,response);done++;progress({done,total:plan.urls.length});
  }}
  const run=()=>worker().catch(e=>{failed=true;throw e;});const workers=await Promise.allSettled([run(),run(),run()]);if(workers.some(w=>w.status==='rejected'))throw Error();
  const result={id:data.id,name:String(data.name||data.id).slice(0,100),savedAt:Date.now(),cache:name,count:done,bounds:plan.bounds,minZoom:plan.minZoom,maxZoom:plan.maxZoom};
  const meta=await caches.open(META),old=await meta.match(metaURL(data.id));await meta.put(metaURL(data.id),new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}}));
  if(old){const previous=await old.json();if(previous.cache!==name)await caches.delete(previous.cache);}
  return result;
 }catch(e){await caches.delete(name);throw Error('地図をすべて保存できませんでした。通信と端末の空き容量を確認して、もう一度お試しください。');}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(VERSION);try{await c.addAll(FILES.map(p=>new Request(new URL(p,ROOT),{cache:'reload'})));}catch(e){await caches.delete(VERSION);throw e;}await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{await self.clients.claim();const keep=new Set((await metadata()).map(m=>m.cache));for(const key of await caches.keys())if((key.startsWith('territory-shell-')&&key!==VERSION)||(key.startsWith(PREFIX)&&!keep.has(key)))await caches.delete(key);})()));
let saving=false;
self.addEventListener('message',event=>{
 const port=event.ports[0];if(!port)return;
 event.waitUntil((async()=>{try{
  const d=event.data||{};let result;
  if(d.type==='LIST')result=await metadata(true);
  else if(d.type==='SAVE'){if(saving)throw Error('別の地図を保存中です。');saving=true;try{result=await saveMap(d,p=>port.postMessage({progress:p}));}finally{saving=false;}}
  else if(d.type==='DELETE'){if(saving)throw Error('保存が終わってから操作してください。');if(!/^T\d{4,}$/.test(d.id))throw Error('区域を確認できません。');const m=await caches.open(META),r=await m.match(metaURL(d.id));if(r)await caches.delete((await r.json()).cache);await m.delete(metaURL(d.id));result=true;}
  else throw Error('操作を確認できません。');port.postMessage({result});
 }catch(e){port.postMessage({error:e.message||'保存できませんでした。'});}})());
});
async function timedFetch(request){const c=new AbortController(),t=setTimeout(()=>c.abort(),4000);try{return await fetch(request,{signal:c.signal});}finally{clearTimeout(t);}}
self.addEventListener('fetch',event=>{
 const req=event.request,u=new URL(req.url);if(req.method!=='GET')return;
 if(u.href.startsWith(OfflineCore.tileOrigin)&&/\/\d+\/\d+\/\d+\.png$/.test(u.pathname)){
  event.respondWith((async()=>{for(const m of await metadata()){const c=await caches.open(m.cache),hit=await c.match(req.url);if(hit)return hit;}try{return await fetch(req);}catch{return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eeebf2"/><text x="128" y="130" text-anchor="middle" fill="#6b627c" font-size="15">保存範囲外・通信を確認</text></svg>',{headers:{'Content-Type':'image/svg+xml'}});}})());return;
 }
 if(u.origin!==self.location.origin||!u.pathname.startsWith(new URL(ROOT).pathname))return;
 if(req.mode==='navigate'&&(u.pathname===new URL(ROOT).pathname||u.pathname===new URL('index.html',ROOT).pathname)){
  event.respondWith((async()=>{const cache=await caches.open(VERSION);try{const r=await timedFetch(req);if(r.ok){await cache.put(ROOT,r.clone());return r;}}catch{}return await cache.match(ROOT)||Response.error();})());return;
 }
 if(ASSETS.has(u.pathname))event.respondWith((async()=>{const c=await caches.open(VERSION),key=u.origin+u.pathname;try{const r=await timedFetch(req);if(r.ok){await c.put(key,r.clone());return r;}}catch{}return await c.match(key)||Response.error();})());
});
