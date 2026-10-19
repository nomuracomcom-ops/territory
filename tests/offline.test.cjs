const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),base='https://example.test/territory/',boundary=[[34.644,136.118],[34.645,136.118],[34.645,136.119],[34.644,136.119]];
function worker(){
 const events={},stores=new Map();let offline=false,failTile=false;
 const normalize=x=>new URL(typeof x==='string'?x:x.url,base).href;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return {async put(k,v){map.set(normalize(k),v.clone());},async match(k){return map.get(normalize(k))?.clone();},async keys(){return [...map.keys()].map(k=>new Request(k));},async delete(k){return map.delete(normalize(k));},async addAll(urls){const rows=await Promise.all(urls.map(async u=>[u,await fetcher(u)]));if(rows.some(([,r])=>!r.ok))throw Error();for(const [u,r]of rows)map.set(normalize(u),r.clone());}};},async keys(){return [...stores.keys()];},async delete(k){return stores.delete(k);}};
 async function fetcher(req){const url=normalize(req);if(offline||failTile&&url.includes('/xyz/'))throw Error('offline');return new Response(url.includes('/xyz/')?'tile':'APP SHELL',{headers:{'Content-Type':url.includes('/xyz/')?'image/png':'text/html'}});}
 const self={location:new URL(base+'sw.js'),addEventListener:(n,f)=>events[n]=f,clients:{claim:async()=>{}},skipWaiting:async()=>{}};
 const c={self,caches,URL,Request,Response,AbortController,AbortSignal,setTimeout,clearTimeout,fetch:fetcher,console};vm.createContext(c);c.importScripts=()=>{vm.runInContext(fs.readFileSync(path.join(root,'offline-core.js'),'utf8'),c);c.OfflineCore=self.OfflineCore;};vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),c);
 async function lifecycle(n){let wait;events[n]({waitUntil:p=>wait=p});await wait;}
 async function rpc(data){let wait,result;events.message({data,ports:[{postMessage:x=>{if(!x.progress)result=x;}}],waitUntil:p=>wait=p});await wait;return result;}
 async function request(url,mode='cors',method='GET'){let response;events.fetch({request:{url:new URL(url,base).href,mode,method},respondWith:p=>response=p});return response?await response:null;}
 return {c,stores,lifecycle,rpc,request,setOffline:v=>offline=v,setFailTile:v=>failTile=v};
}
test('tile plan covers every boundary point, caps downloads and uses only GSI map URLs',()=>{
 const w=worker(),plan=w.c.OfflineCore.plan(boundary);assert(plan.urls.length>0&&plan.urls.length<=600);assert.equal(plan.maxZoom,18);assert(plan.urls.every(u=>u.startsWith('https://cyberjapandata.gsi.go.jp/xyz/std/')));
 for(const [lat,lng]of boundary)assert(lat>=plan.bounds[0]&&lat<=plan.bounds[2]&&lng>=plan.bounds[1]&&lng<=plan.bounds[3]);
 const wide=w.c.OfflineCore.plan([[34.5,136],[34.9,136],[34.9,136.5],[34.5,136.5]]);assert(wide.urls.length<=600);assert(wide.maxZoom<18);assert.throws(()=>w.c.OfflineCore.plan([[0,0]]));
});
test('offline reload uses cached app for fixed territory IDs and does not store invitation URLs',async()=>{
 const w=worker();await w.lifecycle('install');await w.lifecycle('activate');w.setOffline(true);
 const page=await w.request('?t=T0005&s=PRIVATE&k=SECRET','navigate');assert.equal(await page.text(),'APP SHELL');
 const script=await w.request('app-core.js?v=next');assert.equal(await script.text(),'APP SHELL');
 for(const cache of w.stores.values())for(const key of cache.keys())assert(!key.includes('PRIVATE')&&!key.includes('SECRET'));
 assert.equal(await w.request('https://service.test/api/map-share','cors','POST'),null);
});
test('saved maps survive failed updates; incomplete maps are never reported as available',async()=>{
 const w=worker();await w.lifecycle('install');const r=await w.rpc({type:'SAVE',id:'T0005',name:'試験区域',boundary});assert(r.result.count>0);const original=r.result.cache;
 w.setOffline(true);const tile=await w.request(w.c.OfflineCore.plan(boundary).urls[0]);assert.equal(await tile.text(),'tile');
 const failed=await w.rpc({type:'SAVE',id:'T0005',boundary});assert(failed.error);let list=await w.rpc({type:'LIST'});assert.equal(list.result[0].cache,original);
 assert.equal([...w.stores.keys()].filter(k=>k.startsWith('territory-map-v1-')).length,1);
 const cache=w.stores.get(original);cache.delete(cache.keys().next().value);list=await w.rpc({type:'LIST'});assert.equal(list.result.length,0);
 await w.rpc({type:'DELETE',id:'T0005'});assert(!w.stores.has(original));assert.equal((await w.rpc({type:'LIST'})).result.length,0);
});
test('only explicitly downloaded map tiles are cached; missing offline tiles say so',async()=>{
 const w=worker();await w.lifecycle('install');const url='https://cyberjapandata.gsi.go.jp/xyz/std/18/1/1.png';await w.request(url);assert.equal([...w.stores.keys()].filter(k=>k.startsWith('territory-map-v1-')).length,0);
 w.setOffline(true);const r=await w.request(url);assert.match(await r.text(),/保存範囲外/);
 assert.equal(await w.request('https://service.test/private-report'),null);
});
test('offline report click preserves a location as pending without sending a report',async()=>{
 const {parseHTML}=require('linkedom'),{document,Event}=parseHTML('<html><body><header></header><a id="report" href="https://kikyogaoka-companions.balmy-titan-5521.chatgpt.site/report?t=T0005&lat=34.644&lng=136.118">報告</a></body></html>');
 const data=new Map(),events={},navigator={onLine:true,serviceWorker:{controller:{postMessage(d,ports){ports[0].send({result:[]});}},register:async()=>({}),ready:Promise.resolve({active:{}})}};
 class Channel{constructor(){this.port1={close(){}};this.port2={send:d=>queueMicrotask(()=>this.port1.onmessage({data:d}))};}}
 const c={document,navigator,MessageChannel:Channel,URL,URLSearchParams,Date,crypto,console,location:new URL(base+'?t=T0005'),isSecureContext:true,setTimeout,clearTimeout,localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},Territory:{get:()=>({id:'T0005',name:'試験区域',boundary}),number:()=> '2-23-1'},InlineShare:{status:()=>({pending:1})},addEventListener:(n,f)=>events[n]=f};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'offline.js'),'utf8'),c);await events.load();assert.equal(document.getElementById('offlineSave').disabled,false);
 navigator.onLine=false;events.offline();document.getElementById('report').click();
 const queued=JSON.parse(data.get('offline-report-locations-v1'));assert.equal(queued.length,1);assert.equal(queued[0].territory,'T0005');assert.equal(queued[0].lat,34.644);assert.equal(queued[0].address,undefined);assert.equal(queued[0].memo,undefined);assert.match(document.getElementById('offlineStatus').textContent,/報告待ち 1件/);assert.match(document.getElementById('offlineStatus').textContent,/未送信 1件/);assert.equal(document.getElementById('offlineSave').disabled,true);assert(document.getElementById('offlinePanel').hasAttribute('open'));
 document.getElementById('report').click();assert.equal(JSON.parse(data.get('offline-report-locations-v1')).length,1);
 navigator.onLine=true;events.online();assert.equal(document.getElementById('offlineSave').disabled,false);assert.equal(JSON.parse(data.get('offline-report-locations-v1')).length,1);
});
