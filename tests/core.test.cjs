const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
function setup(options={}){
 const data=new Map(), notices=[];let failKey=null;
 const localStorage={get length(){return data.size},key(i){return [...data.keys()][i]},getItem(k){return data.has(k)?data.get(k):null},setItem(k,v){if(k===failKey){failKey=null;throw Error('QuotaExceeded');}data.set(k,String(v))},removeItem(k){data.delete(k)}};
 const elements=new Map();function element(id){if(!elements.has(id))elements.set(id,{textContent:'',hidden:true,replaceChildren(){},appendChild(){}});return elements.get(id);}
 const context=vm.createContext({window:{},document:{getElementById:element,createElement:()=>({}),addEventListener(){},activeElement:null},localStorage,setTimeout,clearTimeout,Date,AbortController,fetch:options.fetch||(()=>Promise.reject(Error('offline'))),navigator:{clipboard:{writeText:async()=>{throw Error('denied')}}},alert:s=>notices.push(s),console});
 vm.runInContext(fs.readFileSync(path.join(root,'app-core.js'),'utf8'),context);
 return {app:context.window.App,localStorage,data,elements,context,failOnce:k=>failKey=k};
}
const house={id:1,lat:34,lng:136,status:'met',memo:'',date:'9/15'};
test('CSV accepts quoted commas, line breaks, doubled quotes, BOM and single-cell TSV',()=>{
 const {app}=setup();assert.equal(JSON.stringify(app.parseCSV('\ufefft,lat,lng,kind,memo\r\n4,34,136,note,"a,b\n""c"""')),JSON.stringify([['t','lat','lng','kind','memo'],['4','34','136','note','a,b\n"c"']]));
 assert.equal(app.parseCSV('"t\tlat\tlng\tkind\tmemo"\n"4\t34\t136\tdnc\ttest"')[1].length,5);
 assert.throws(()=>app.parseCSV('a,"unfinished'));
});
test('full backup roundtrip includes all territories, apartments, shared room results and timer',()=>{
 const {app,localStorage,data}=setup();
 localStorage.setItem('terr-4',JSON.stringify([house]));localStorage.setItem('terr-5',JSON.stringify([]));
 localStorage.setItem('terr-4-apt',JSON.stringify([{id:2,lat:34,lng:136,name:'sample',rooms:[{no:'001',status:'away',date:''}]}]));
 localStorage.setItem('terr-4-shared-records',JSON.stringify({'local-2':[{no:'001',status:'met',date:''}]}));
 localStorage.setItem('svc-log',JSON.stringify([{id:3,start:100,end:200,min:1,date:'2026-09-15',terr:'4'}]));localStorage.setItem('svc-active',JSON.stringify({start:100,terr:'4'}));localStorage.setItem('unrelated','private');
 const backup=app.backup();assert.equal(Object.keys(backup.records).length,6);assert.equal(backup.records.unrelated,undefined);
 data.clear();app.restore(backup);assert.equal(localStorage.getItem('terr-4'),backup.records['terr-4']);assert.equal(JSON.parse(localStorage.getItem('terr-4-apt'))[0].rooms[0].no,'001');
});
test('invalid restore is rejected before any data is changed',()=>{
 const {app,localStorage}=setup();localStorage.setItem('terr-4',JSON.stringify([house]));const before=localStorage.getItem('terr-4');
 assert.throws(()=>app.restore({format:'territory-backup',version:1,records:{'terr-4':'[]','unrelated':'[]'}}));assert.equal(localStorage.getItem('terr-4'),before);
 assert.throws(()=>app.validateHouses([{...house,lat:999}]));assert.throws(()=>app.validateApartments([{id:1,lat:34,lng:136,name:'',rooms:[{no:'101'},{no:'101'}]}]));
});
test('quota failure rolls back preceding writes and removes new restore keys',()=>{
 const {app,localStorage,failOnce}=setup();localStorage.setItem('terr-4',JSON.stringify([house]));const old=localStorage.getItem('terr-4');failOnce('terr-6');
 assert.throws(()=>app.restore({format:'territory-backup',version:1,records:{'terr-4':'[]','terr-5':'[]','terr-6':'[]'}}));assert.equal(localStorage.getItem('terr-4'),old);assert.equal(localStorage.getItem('terr-5'),null);
});
test('saving failure shows a visible warning and never replaces stored data',()=>{
 const {app,localStorage,failOnce,elements}=setup();localStorage.setItem('terr-4','[]');failOnce('terr-4');assert.throws(()=>app.store('terr-4',JSON.stringify([house])));assert.equal(localStorage.getItem('terr-4'),'[]');assert.equal(elements.get('recordNotice').hidden,false);
});
test('shared fetch failure is visible and never applies empty data as success',async()=>{
 const {app,elements}=setup();let applied=false;app.feed('dnc','注意','https://example.test',r=>r,()=>applied=true);await new Promise(r=>setImmediate(r));assert.equal(applied,false);assert.match(elements.get('syncSummary').textContent,/未確認/);
});
test('shared empty header-only feed is a valid successful empty list',async()=>{
 const {app,elements}=setup({fetch:async()=>({ok:true,text:async()=>'区域番号,建物ID,緯度,経度,建物名,部屋番号'})});let result;app.feed('apt','建物','https://example.test',r=>r.slice(1),r=>result=r);await new Promise(r=>setImmediate(r));assert.equal(result.length,0);assert.match(elements.get('syncSummary').textContent,/取得しました/);
});
test('shared exports flatten tabs and neutralize spreadsheet formulas',()=>{const {app}=setup();assert.equal(app.tsvCell('a\tb\nc'),'a b c');assert.equal(app.tsvCell('=HYPERLINK("x")'),'\'=HYPERLINK("x")');assert.equal(app.escape('</textarea><img>'),'&lt;/textarea&gt;&lt;img&gt;');});
test('all inline scripts compile',()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);});

test('map history is included in backups and invalid or duplicate history is rejected before restore',()=>{
 const {app,localStorage,data}=setup(),history=[{terr:'4',name:'区域4',lastOpened:1789660000000},{terr:'1',name:'区域1',lastOpened:null}];
 localStorage.setItem('map-history',JSON.stringify(history));const backup=app.backup();data.clear();app.restore(backup);assert.deepEqual(JSON.parse(localStorage.getItem('map-history')),history);
 for(const value of [[history[0],history[0]],[{...history[0],terr:'all'}],[{...history[0],lastOpened:'today'}]]){
   assert.throws(()=>app.restore({format:'territory-backup',version:1,records:{'terr-4':'[]','map-history':JSON.stringify(value)}}));assert.equal(localStorage.getItem('terr-4'),null);assert.equal(localStorage.getItem('map-history'),JSON.stringify(history));
 }
});

test('hidden map history is backed up and rejects invalid or duplicate territory numbers',()=>{
 const {app,localStorage,data}=setup();localStorage.setItem('map-history-hidden',JSON.stringify(['4','2']));const backup=app.backup();data.clear();app.restore(backup);assert.deepEqual(JSON.parse(localStorage.getItem('map-history-hidden')),['4','2']);
 for(const value of [['4','4'],['all'],[4]])assert.throws(()=>app.validateBackup({format:'territory-backup',version:1,records:{'map-history-hidden':JSON.stringify(value)}}));
});
