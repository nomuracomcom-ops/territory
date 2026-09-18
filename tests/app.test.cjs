const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const {parseHTML}=require('linkedom');const root=path.join(__dirname,'..');
function app(t='4',sharedCSV='区域番号,建物ID,緯度,経度,建物名,部屋番号\n4,building-a,34.647,136.118,テスト建物,"101,102"',saved={},hash=''){
 const {document,Event}=parseHTML(fs.readFileSync(path.join(root,'index.html'),'utf8'));const data=new Map(Object.entries(saved)),maps=[],alerts=[];let domReady,failKey=null;
 const localStorage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>{if(k===failKey){failKey=null;throw Error('QuotaExceeded');}data.set(k,String(v));},removeItem:k=>data.delete(k)};
 const bounds={extend(){return this}};
 function obj(ll){return {ll,handlers:{},on(name,f){this.handlers[name]=f;return this},addTo(g){if(g.items)g.items.push(this);return this},getBounds:()=>bounds,getLatLng:()=>({lat:ll[0],lng:ll[1]}),setLatLng(){},setIcon(){},bindPopup(f){this.popup=f;return this},openPopup(){this.opened=true;},getCenter:()=>({lat:34,lng:136})};}
 const L={__ap:0,map(){const m=obj([34,136]);m.handlers={};m.on=function(n,f){(this.handlers[n]||=[]).push(f);return this};m.emit=(n,e)=>{for(const f of m.handlers[n]||[])f(e)};m.setView=()=>m;m.fitBounds=()=>m;m.invalidateSize=()=>{};m.closePopup=()=>{};m.items=[];maps.push(m);return m},control:{zoom:()=>({addTo(){document.getElementById('map').insertAdjacentHTML('beforeend','<div class="leaflet-top leaflet-right"></div>');}})},tileLayer:()=>({addTo(){}}),polygon:()=>obj([34,136]),marker:obj,circleMarker:obj,divIcon:o=>o,layerGroup(){const g={items:[],addTo(m){m.items.push(this);return this},clearLayers(){this.items=[]},getLayers(){return this.items}};return g}};
 const events={};const context={document,localStorage,L,URLSearchParams,Date,Set,Map,AbortController,Blob,URL,console,navigator:{clipboard:{writeText:async s=>context.copied=s}},location:{search:t===null?'':'?t='+t,hash,reload:()=>context.reloaded=true},alert:s=>alerts.push(s),confirm:()=>true,prompt:()=>null,setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},addEventListener:(n,f)=>events[n]=f};
 context.fetch=async url=>({ok:true,text:async()=>url.includes('2125994133')?sharedCSV:url.includes('852025746')?'区域番号,状態\n4,使用中':'t,lat,lng,kind,memo\n4,34.647,136.118,dnc,"注意,メモ"'});
 context.window=context;vm.createContext(context);
 const add=document.addEventListener.bind(document);document.addEventListener=(n,f)=>{if(n==='DOMContentLoaded')domReady=f;else add(n,f)};
 for(const script of document.querySelectorAll('script')){const src=script.getAttribute('src');if(src && src.startsWith('https:'))continue;vm.runInContext(src?fs.readFileSync(path.join(root,src.split('?')[0]),'utf8'):script.textContent,context);}
 domReady();
 return {context,document,maps,data,alerts,failOnce:k=>failKey=k,click:id=>document.getElementById(id).click(),flush:async()=>{await new Promise(r=>setImmediate(r))},input:(id,value)=>{const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input'));}};
}
test('apartment add, duplicate room suppression, room status persistence and shared export omit private records',async()=>{
 const a=app();await a.flush();a.click('btnAddApt');a.maps[0].emit('click',{latlng:{lat:34.648,lng:136.118}});a.input('aptName','試験棟');a.input('roomAddInput','101,102,101');a.click('roomAddBtn');assert.equal(a.document.querySelectorAll('#roomBody .room').length,2);
 a.document.querySelector('#roomBody button[aria-label="101 会えた"]').click();const local=JSON.parse(a.data.get('terr-4-apt'));assert.equal(local[0].rooms[0].status,'met');assert.equal(a.data.has('terr-4'),false);
 a.click('aptShare');await a.flush();assert.match(a.context.copied,/101,102/);assert.equal(a.context.copied.includes('met'),false);assert.equal(a.context.copied.split('\t').length,6);
});
test('only the selected add mode handles a map click and collapsing menu exits recording',async()=>{
 const a=app();await a.flush();a.click('btnRecord');a.click('btnAdd');a.click('btnAddApt');a.maps[0].emit('click',{latlng:{lat:34.648,lng:136.118}});assert.equal(a.data.has('terr-4'),false);assert.equal(JSON.parse(a.data.get('terr-4-apt')).length,1);
 a.click('btnRecord');assert.equal(a.context.App.mode,null);a.maps[0].emit('click',{latlng:{lat:34.648,lng:136.118}});assert.equal(JSON.parse(a.data.get('terr-4-apt')).length,1);
});
test('shared room records remain local, survive reload and do not affect a second device',async()=>{
 const a=app();await a.flush();const group=a.maps[0].items.find(g=>g.items && g.items.some(m=>m.handlers.click));group.items[0].handlers.click();assert.equal(a.document.getElementById('aptName').readOnly,true);assert.equal(a.document.querySelector('.addroom').hidden,true);
 a.document.querySelector('#roomBody button[aria-label="101 会えた"]').click();assert.equal(JSON.parse(a.data.get('terr-4-shared-records'))['building-a'][0].status,'met');
 const b=app();await b.flush();assert.equal(b.data.has('terr-4-shared-records'),false);
 const c=app('4',undefined,Object.fromEntries(a.data));await c.flush();const cg=c.maps[0].items.find(g=>g.items && g.items.some(m=>m.handlers.click));cg.items[0].handlers.click();assert.equal(c.document.querySelector('#roomBody button[aria-label="101 会えた"]').getAttribute('aria-pressed'),'true');
});
test('publishing local building identity retains prior room status without duplicate pins',async()=>{
 const saved={'terr-4-apt':JSON.stringify([{id:123,lat:34.647,lng:136.118,name:'旧名',rooms:[{no:'101',status:'revisit',date:'9/15'}]}])};const a=app('4','区域番号,建物ID,緯度,経度,建物名,部屋番号\n4,local-123,34.647,136.118,共有名,101',saved);await a.flush();const g=a.maps[0].items.find(g=>g.items && g.items.some(m=>m.handlers.click));assert.equal(g.items.length,1);g.items[0].handlers.click();assert.equal(a.document.querySelector('#roomBody button[aria-label="101 再訪問"]').getAttribute('aria-pressed'),'true');
});
test('timer start/stop and undo retain prior stored records',async()=>{
 const a=app();await a.flush();a.click('btnSvc');assert.ok(a.data.get('svc-active'));a.click('btnSvc');assert.equal(a.data.has('svc-active'),false);assert.equal(JSON.parse(a.data.get('svc-log')).length,1);
 a.click('btnAddApt');a.maps[0].emit('click',{latlng:{lat:34.648,lng:136.118}});a.click('undoBtn');assert.equal(a.data.has('terr-4-apt'),false);assert.equal(JSON.parse(a.data.get('svc-log')).length,1);assert.equal(a.context.reloaded,true);
});
test('overview exposes shared status, resolves loan labels and unknown territory offers return link',async()=>{
 const a=app('all');await a.flush();a.click('btnOvList');assert.match(a.document.getElementById('ovBody').textContent,/貸出中/);assert.notEqual(a.document.getElementById('notice').style.display,'none');
 const b=app('999');assert.match(b.document.getElementById('map').textContent,/登録されていません/);assert.equal(b.maps.length,0);
});

test('record sheet includes houses and rooms, filters and searches without changing stored data',async()=>{
 const now=new Date();const day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const saved={'terr-4':JSON.stringify([{id:11,lat:34,lng:136,status:'met',date:day,memo:'試験メモ'},{id:12,lat:34,lng:136,status:'away',date:'9/15',memo:''},{id:13,lat:34,lng:136,status:'dnc',date:day,memo:''}]),
 'terr-4-apt':JSON.stringify([{id:20,lat:34,lng:136,name:'試験棟',rooms:[{no:'201',status:'away',date:day}]}]),
 'terr-4-shared-records':JSON.stringify({'building-a':[{no:'101',status:'revisit',date:day}]})};
 const a=app('4',undefined,saved);await a.flush();const before=Object.fromEntries(a.data);a.click('btnList');
 assert.equal(a.document.getElementById('todayVisits').textContent,'3');
 assert.equal(a.document.querySelectorAll('.visit-row').length,5);
 assert.match(a.document.getElementById('listBody').textContent,/試験棟 · 201号室/);
 assert.equal(a.document.getElementById('legacyDateNote').hidden,false);
 a.document.querySelector('[data-filter="revisit"]').click();assert.equal(a.document.querySelectorAll('.visit-row').length,1);
 a.document.querySelector('.visit-row').click();assert.equal(a.document.getElementById('aptSheet').style.display,'flex');assert.match(a.document.querySelector('.room-highlight').textContent,/101/);
 a.click('aptX');a.click('btnList');a.document.querySelector('[data-filter="all"]').click();a.input('recordSearch','201');assert.equal(a.document.querySelectorAll('.visit-row').length,1);
 assert.deepEqual(Object.fromEntries(a.data),before);
 assert.equal(a.document.querySelector('.bulk-btns [data-s="dnc"]'),null);
 assert.ok(a.document.getElementById('backupAll').closest('details'));
});

test('new house is unselected until a status is recorded and later memo edits do not redate it',async()=>{
 const a=app();await a.flush();a.click('btnAdd');a.maps[0].emit('click',{latlng:{lat:34,lng:136}});
 let saved=JSON.parse(a.data.get('terr-4'))[0];assert.equal(saved.status,'');assert.equal(saved.date,'');
 a.click('btnList');assert.equal(a.document.getElementById('todayVisits').textContent,'0');
 const marker=a.maps[0].items.find(g=>g.items && g.items.some(m=>typeof m.popup==='function')).items[0];
 const popup=marker.popup();a.document.body.appendChild(popup);marker.handlers.popupopen({popup:{getElement:()=>popup}});
 popup.querySelector('[data-s="met"]').click();saved=JSON.parse(a.data.get('terr-4'))[0];assert.equal(saved.date,a.context.Records.localDay());
 const date=saved.date;popup.querySelector('textarea').oninput({target:{value:'後からメモ'}});assert.equal(JSON.parse(a.data.get('terr-4'))[0].date,date);
 a.click('btnList');assert.equal(a.document.getElementById('todayVisits').textContent,'1');
 a.click('btnSvc');a.click('btnSvc');assert.match(a.document.getElementById('doneSummary').textContent,/今日の記録 1か所/);
 a.click('doneReview');assert.equal(a.document.getElementById('done').style.display,'none');assert.equal(a.document.querySelector('[data-filter="today"]').getAttribute('aria-pressed'),'true');
 const backup=a.context.App.backup();a.context.App.restore(backup);assert.equal(JSON.parse(a.data.get('terr-4'))[0].memo,'後からメモ');
});

test('private content is rendered as text, not HTML',async()=>{
 const a=app('4',undefined,{'terr-4':JSON.stringify([{id:1,lat:34,lng:136,status:'met',date:'2026-09-16',memo:'<img src=x onerror=alert(1)>'}])});await a.flush();a.click('btnList');
 assert.match(a.document.getElementById('listBody').textContent,/<img/);assert.equal(a.document.querySelector('#listBody img'),null);
});

test('home is the default entry and empty home, overview and unknown areas do not create usage',async()=>{
 for(const t of [null,'home','all','999']){
   const a=app(t);await a.flush();assert.equal(a.data.has('map-history'),false);
   if(t===null || t==='home'){assert.equal(a.maps.length,0);assert.equal(a.document.getElementById('personalHome').hidden,false);assert.match(a.document.getElementById('homeMaps').textContent,/「区域地図」から/);}
 }
});

test('home uses the compact ministry heading and territory map label',async()=>{
 const a=app('home');await a.flush();assert.equal(a.document.querySelector('.home-intro h1').textContent,'伝道を楽しもう');
 assert.equal(a.document.querySelector('.home-browse').textContent,'区域地図');assert.equal(a.document.querySelector('.home-intro p'),null);assert.equal(a.document.querySelector('.home-encouragement'),null);
});

test('opening a map persists one entry, sorts most recently opened first, and keeps QR destinations',async()=>{
 const a=app('4');await a.flush();const initial=JSON.parse(a.data.get('map-history'));
 assert.equal(initial.length,1);assert.equal(initial[0].terr,'4');assert.ok(initial[0].lastOpened>0);assert.equal(a.document.getElementById('personalHome').hidden,true);
 const b=app('2',undefined,Object.fromEntries(a.data));await b.flush();
 const c=app('4',undefined,Object.fromEntries(b.data));await c.flush();
 assert.equal(JSON.parse(c.data.get('map-history')).length,2);
 const home=app('home',undefined,Object.fromEntries(c.data));await home.flush();
 const maps=[...home.document.querySelectorAll('.home-map')];assert.equal(maps.length,2);assert.equal(maps[0].getAttribute('href'),'?t=4');
 home.input('homeSearch','1番町B');assert.equal(home.document.querySelectorAll('.home-map').length,1);assert.equal(home.document.querySelector('.home-map').getAttribute('href'),'?t=2');
});

test('used map history can be deleted individually without deleting records and returns only when reopened',async()=>{
 const saved={
   'map-history':JSON.stringify([{terr:'4',name:'区域4',lastOpened:200},{terr:'2',name:'区域2',lastOpened:100}]),
   'terr-4':JSON.stringify([{id:1,lat:34,lng:136,status:'revisit',date:'2026-09-17',memo:'残す'}]),
   'svc-log':JSON.stringify([{id:1,start:100,end:200,min:1,date:'2026-09-17',terr:'4'}])
 };
 const a=app('home',undefined,saved);await a.flush();a.click('homeMapEdit');
 assert.equal(a.document.querySelectorAll('.home-map-remove').length,2);a.document.querySelector('[aria-label="区域 4 の使用履歴を削除"]').click();
 assert.deepEqual(JSON.parse(a.data.get('map-history')).map(x=>x.terr),['2']);assert.deepEqual(JSON.parse(a.data.get('map-history-hidden')),['4']);
 assert.equal(a.data.get('terr-4'),saved['terr-4']);assert.equal(a.data.get('svc-log'),saved['svc-log']);assert.equal(a.document.getElementById('homeRevisitCount').textContent,'1');
 const homeAgain=app('home',undefined,Object.fromEntries(a.data));await homeAgain.flush();assert.deepEqual(JSON.parse(homeAgain.data.get('map-history')).map(x=>x.terr),['2']);
 const reopened=app('4',undefined,Object.fromEntries(homeAgain.data));await reopened.flush();assert.deepEqual(JSON.parse(reopened.data.get('map-history')).map(x=>x.terr),['2','4']);assert.deepEqual(JSON.parse(reopened.data.get('map-history-hidden')),[]);
});

test('all used map history can be cleared or cancelled without changing other personal data',async()=>{
 const saved={
   'map-history':JSON.stringify([{terr:'4',name:'区域4',lastOpened:200},{terr:'2',name:'区域2',lastOpened:100}]),
   'terr-4':JSON.stringify([{id:1,lat:34,lng:136,status:'revisit',date:'2026-09-17',memo:'残す'}]),
   'svc-active':JSON.stringify({start:100,terr:'4'})
 };
 const a=app('home',undefined,saved);await a.flush();a.click('homeMapEdit');a.context.confirm=()=>false;a.click('homeMapClear');assert.deepEqual(JSON.parse(a.data.get('map-history')).map(x=>x.terr),['4','2']);
 a.context.confirm=()=>true;a.click('homeMapClear');assert.deepEqual(JSON.parse(a.data.get('map-history')),[]);assert.deepEqual(new Set(JSON.parse(a.data.get('map-history-hidden'))),new Set(['4','2']));
 assert.equal(a.data.get('terr-4'),saved['terr-4']);assert.equal(a.data.get('svc-active'),saved['svc-active']);assert.equal(a.document.getElementById('homeMapCount').textContent,'0');
 const reloaded=app('home',undefined,Object.fromEntries(a.data));await reloaded.flush();assert.deepEqual(JSON.parse(reloaded.data.get('map-history')),[]);assert.match(reloaded.document.getElementById('homeMaps').textContent,/まだ使用履歴/);
});

test('legacy records seed history without inventing dates; global revisits merge rooms and timer survives home',async()=>{
 const today=new Date(),start=today.getTime()-60000,day=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
 const saved={
   'terr-1':JSON.stringify([{id:9,lat:34,lng:136,status:'revisit',date:'9/15',memo:'<img src=x> 次のお話'}]),
   'terr-4-apt':JSON.stringify([{id:123,lat:34,lng:136,name:'旧名',rooms:[{no:'101',status:'revisit',date:day}]}]),
   'terr-4-shared-records':JSON.stringify({'local-123':[{no:'101',status:'revisit',date:day}],'missing':[{no:'201',status:'revisit',date:day}]}),
   'svc-log':JSON.stringify([{id:1,start:start-3600000,end:start,min:60,date:day,terr:'2'}]),
   'svc-active':JSON.stringify({start,terr:'4'})
 };
 const csv='区域番号,建物ID,緯度,経度,建物名,部屋番号\n4,local-123,34,136,共有名,101';
 const a=app('home',csv,saved);await a.flush();
 assert.deepEqual(JSON.parse(a.data.get('map-history')).map(x=>[x.terr,x.lastOpened]),[['1',null],['4',null],['2',null]]);
 for(const [key,value] of Object.entries(saved))assert.equal(a.data.get(key),value);
 assert.equal(a.document.getElementById('homeRevisitCount').textContent,'3');assert.equal(a.document.getElementById('homeMinutes').textContent,'1時間0分');
 assert.equal(a.document.getElementById('homeActive').getAttribute('href'),'?t=4');assert.equal(a.document.getElementById('homeActive').hidden,false);
 a.click('homeRevisitShortcut');assert.equal(a.document.getElementById('homePanel-revisits').hidden,false);assert.match(a.document.getElementById('homeRevisits').textContent,/共有名 · 101号室/);
 assert.equal(a.document.querySelector('#homeRevisits img'),null);a.input('homeSearch','次のお話');assert.equal(a.document.querySelectorAll('.home-revisit').length,1);
 const link=a.document.querySelector('.home-revisit').getAttribute('href');assert.equal(link,'?t=1#record=houses&item=9');
 a.click('homeServiceShortcut');assert.equal(a.document.querySelectorAll('.home-service-row').length,1);
 const exported=a.context.App.backup();a.data.clear();a.context.App.restore(exported);assert.equal(a.data.get('map-history'),exported.records['map-history']);assert.equal(a.data.get('svc-active'),saved['svc-active']);
});

function cleanupFixture(){
 return {
   'terr-4':JSON.stringify(['met','posted','away','revisit','dnc',''].map((status,i)=>({id:i+1,lat:34,lng:136,status,date:'2026-09-17',memo:'メモ'+i}))),
   'terr-4-apt':JSON.stringify([{id:12,lat:34,lng:136,name:'残す建物',rooms:['met','away','revisit','dnc'].map((status,i)=>({no:String(i+101),status,date:'2026-09-17'}))}]),
   'terr-4-shared-records':JSON.stringify({'building-a':[{no:'101',status:'posted',date:'2026-09-17'},{no:'102',status:'revisit',date:'2026-09-17'}],'gone':[{no:'201',status:'dnc',date:'2026-09-17'},{no:'202',status:'away',date:'2026-09-17'}]}),
   'terr-1':JSON.stringify([{id:100,lat:34,lng:136,status:'away',date:'2026-09-17',memo:'別区域'}]),
   'svc-log':JSON.stringify([{id:100,start:100,end:10000,min:1,date:'2026-09-17',terr:'4'}]),
   'svc-active':JSON.stringify({start:200,terr:'4'})
 };
}

test('area cleanup removes only temporary statuses from houses and rooms; undo restores all three keys together',async()=>{
 const saved=cleanupFixture(),a=app('4',undefined,saved);await a.flush();const before=Object.fromEntries(a.data);
 a.click('btnList');let confirmation='';a.context.confirm=text=>{confirmation=text;return true;};a.click('cleanupRecords');
 assert.match(confirmation,/会えた 2件・投函 2件・留守 3件/);
 assert.deepEqual(JSON.parse(a.data.get('terr-4')).map(x=>x.status),['revisit','dnc','']);
 const apt=JSON.parse(a.data.get('terr-4-apt'))[0];assert.equal(apt.name,'残す建物');assert.equal(apt.rooms.length,4);assert.deepEqual(apt.rooms.map(x=>x.status),['','','revisit','dnc']);assert.equal(apt.rooms[0].date,'');
 const rooms=JSON.parse(a.data.get('terr-4-shared-records'));assert.equal(rooms['building-a'][0].status,'');assert.equal(rooms['building-a'][1].status,'revisit');assert.equal(rooms.gone[0].status,'dnc');assert.equal(rooms.gone[1].date,'');
 for(const key of ['terr-1','svc-log','svc-active','map-history'])assert.equal(a.data.get(key),before[key]);
 assert.equal(a.context.Records.entries().filter(r=>['met','posted','away'].includes(r.status)).length,0);assert.match(a.document.getElementById('cleanupStatus').textContent,/7件/);
 const home=app('home',undefined,Object.fromEntries(a.data));await home.flush();assert.equal(home.document.getElementById('homeRevisitCount').textContent,'3');assert.match(home.document.getElementById('homeMaps').textContent,/桔梗が丘1番町D/);
 a.click('undoBtn');assert.deepEqual(Object.fromEntries(a.data),before);assert.equal(a.context.reloaded,true);
});

test('cleanup cancellation, quota failure and stale confirmation leave other records intact',async()=>{
 const a=app('4',undefined,cleanupFixture());await a.flush();const before=Object.fromEntries(a.data);
 a.context.confirm=()=>false;a.click('cleanupRecords');assert.deepEqual(Object.fromEntries(a.data),before);
 a.context.confirm=()=>true;a.failOnce('terr-4-shared-records');a.click('cleanupRecords');assert.deepEqual(Object.fromEntries(a.data),before);assert.match(a.alerts.at(-1),/整理できません/);
 const plan=a.context.Personal.cleanupPlan('4'),newer=JSON.parse(a.data.get('terr-4'));newer[0].status='revisit';a.data.set('terr-4',JSON.stringify(newer));
 assert.throws(()=>a.context.Personal.cleanup(plan),/更新されています/);assert.equal(JSON.parse(a.data.get('terr-4'))[0].status,'revisit');assert.equal(a.data.get('terr-4-apt'),before['terr-4-apt']);
});

test('cleanup keeps explicit cleared shared states so old local room results never reappear',async()=>{
 const saved={'terr-4-apt':JSON.stringify([{id:123,lat:34,lng:136,name:'試験棟',rooms:[{no:'101',status:'revisit',date:'2026-09-17'}]}]),'terr-4-shared-records':JSON.stringify({'local-123':[{no:'101',status:'met',date:'2026-09-17'}]})};
 const csv='区域番号,建物ID,緯度,経度,建物名,部屋番号\n4,local-123,34,136,共有名,101';
 const a=app('4',csv,saved);await a.flush();a.click('cleanupRecords');const b=app('4',csv,Object.fromEntries(a.data));await b.flush();
 assert.equal(b.context.Records.entries().length,0);const g=b.maps[0].items.find(g=>g.items && g.items.some(m=>m.handlers.click));g.items[0].handlers.click();
 assert.equal(b.document.querySelector('#roomBody [aria-pressed="true"]'),null);
});

test('revisit deep links open the right house and wait for the right shared room',async()=>{
 const house={id:42,lat:34,lng:136,status:'revisit',date:'2026-09-17',memo:''};
 const a=app('4',undefined,{'terr-4':JSON.stringify([house])},'#record=houses&item=42');await a.flush();
 const marker=a.maps[0].items.find(g=>g.items && g.items.some(m=>typeof m.popup==='function')).items[0];assert.equal(marker.opened,true);
 const b=app('4',undefined,{'terr-4-shared-records':JSON.stringify({'building-a':[{no:'102',status:'revisit',date:'2026-09-17'}]})},'#record=apartments&item=building-a%3A102');await b.flush();
 assert.equal(b.document.getElementById('aptSheet').style.display,'flex');assert.equal(b.document.querySelector('.room-highlight .rno').textContent,'102');
});

test('damaged history is never overwritten by opening a map or the home',async()=>{
 for(const t of ['4','home']){const a=app(t,undefined,{'map-history':'{broken'});await a.flush();assert.equal(a.data.get('map-history'),'{broken');assert.equal(a.document.getElementById('recordNotice').hidden,false);}
});

test('a linked local building becomes read-only shared metadata when its published row arrives',async()=>{
 const saved={'terr-4-apt':JSON.stringify([{id:123,lat:34,lng:136,name:'旧名',rooms:[{no:'101',status:'revisit',date:'2026-09-17'}]}])};
 const csv='区域番号,建物ID,緯度,経度,建物名,部屋番号\n4,local-123,34,136,共有名,101';
 const a=app('4',csv,saved,'#record=apartments&item=local-123%3A101');await a.flush();
 assert.equal(a.document.getElementById('aptName').value,'共有名');assert.equal(a.document.getElementById('aptName').readOnly,true);
 a.document.querySelector('#roomBody button[aria-label="101 会えた"]').click();
 assert.equal(JSON.parse(a.data.get('terr-4-shared-records'))['local-123'][0].status,'met');assert.equal(a.data.get('terr-4-apt'),saved['terr-4-apt']);
});
