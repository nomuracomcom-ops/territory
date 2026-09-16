const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const {parseHTML}=require('linkedom');const root=path.join(__dirname,'..');
function app(t='4',sharedCSV='区域番号,建物ID,緯度,経度,建物名,部屋番号\n4,building-a,34.647,136.118,テスト建物,"101,102"',saved={}){
 const {document,Event}=parseHTML(fs.readFileSync(path.join(root,'index.html'),'utf8'));const data=new Map(Object.entries(saved)),maps=[],alerts=[];let domReady;
 const localStorage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const bounds={extend(){return this}};
 function obj(ll){return {ll,handlers:{},on(name,f){this.handlers[name]=f;return this},addTo(g){if(g.items)g.items.push(this);return this},getBounds:()=>bounds,getLatLng:()=>({lat:ll[0],lng:ll[1]}),setLatLng(){},setIcon(){},bindPopup(f){this.popup=f;return this},openPopup(){},getCenter:()=>({lat:34,lng:136})};}
 const L={__ap:0,map(){const m=obj([34,136]);m.handlers={};m.on=function(n,f){(this.handlers[n]||=[]).push(f);return this};m.emit=(n,e)=>{for(const f of m.handlers[n]||[])f(e)};m.setView=()=>m;m.fitBounds=()=>m;m.invalidateSize=()=>{};m.closePopup=()=>{};m.items=[];maps.push(m);return m},control:{zoom:()=>({addTo(){document.getElementById('map').insertAdjacentHTML('beforeend','<div class="leaflet-top leaflet-right"></div>');}})},tileLayer:()=>({addTo(){}}),polygon:()=>obj([34,136]),marker:obj,circleMarker:obj,divIcon:o=>o,layerGroup(){const g={items:[],addTo(m){m.items.push(this);return this},clearLayers(){this.items=[]},getLayers(){return this.items}};return g}};
 const events={};const context={document,localStorage,L,URLSearchParams,Date,Set,Map,AbortController,Blob,URL,console,navigator:{clipboard:{writeText:async s=>context.copied=s}},location:{search:'?t='+t,reload:()=>context.reloaded=true},alert:s=>alerts.push(s),confirm:()=>true,prompt:()=>null,setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},addEventListener:(n,f)=>events[n]=f};
 context.fetch=async url=>({ok:true,text:async()=>url.includes('2125994133')?sharedCSV:url.includes('852025746')?'区域番号,状態\n4,使用中':'t,lat,lng,kind,memo\n4,34.647,136.118,dnc,"注意,メモ"'});
 context.window=context;vm.createContext(context);
 const add=document.addEventListener.bind(document);document.addEventListener=(n,f)=>{if(n==='DOMContentLoaded')domReady=f;else add(n,f)};
 for(const script of document.querySelectorAll('script')){const src=script.getAttribute('src');if(src && src.startsWith('https:'))continue;vm.runInContext(src?fs.readFileSync(path.join(root,src.split('?')[0]),'utf8'):script.textContent,context);}
 domReady();
 return {context,document,maps,data,alerts,click:id=>document.getElementById(id).click(),flush:async()=>{await new Promise(r=>setImmediate(r))},input:(id,value)=>{const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input'));}};
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
 const a=app('4',undefined,saved);await a.flush();a.click('btnList');
 assert.equal(a.document.getElementById('todayVisits').textContent,'3');
 assert.equal(a.document.querySelectorAll('.visit-row').length,5);
 assert.match(a.document.getElementById('listBody').textContent,/試験棟 · 201号室/);
 assert.equal(a.document.getElementById('legacyDateNote').hidden,false);
 a.document.querySelector('[data-filter="revisit"]').click();assert.equal(a.document.querySelectorAll('.visit-row').length,1);
 a.document.querySelector('.visit-row').click();assert.equal(a.document.getElementById('aptSheet').style.display,'flex');assert.match(a.document.querySelector('.room-highlight').textContent,/101/);
 a.click('aptX');a.click('btnList');a.document.querySelector('[data-filter="all"]').click();a.input('recordSearch','201');assert.equal(a.document.querySelectorAll('.visit-row').length,1);
 assert.deepEqual(Object.fromEntries(a.data),saved);
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
