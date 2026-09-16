const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){const context={window:{},Date,URLSearchParams,Map,Set};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../records.js'),'utf8'),context);return context.window.Records;}
test('dates retain the local day and reject missing years and impossible dates',()=>{
 const r=setup();assert.equal(r.localDay(new Date(2026,8,16,0,5)),'2026-09-16');assert.equal(r.localDay(new Date(2026,8,16,23,55)),'2026-09-16');
 assert.equal(r.dayKey('2026/9/16'),'2026-09-16');assert.equal(r.dayKey('2024-02-29'),'2024-02-29');
 for(const x of ['9/16','2026-02-30','2026-13-01','2026-02-29','','not-a-date'])assert.equal(r.dayKey(x),null);
});
test('daily numbers use latest full-date statuses, exclude do-not-visit and do not count legacy years',()=>{
 const r=setup(),s=r.summarize([{status:'met',date:'2026/9/16'},{status:'away',date:'2026-09-16'},{status:'revisit',date:'2025-09-16'},{status:'met',date:'9/16'},{status:'dnc',date:'2026-09-16'},{status:'',date:''}],'2026-09-16');
 assert.equal(s.total,2);assert.equal(s.counts.met,1);assert.equal(s.counts.away,1);assert.equal(s.undated,1);
 assert.match(r.encouragement(r.summarize([{status:'away',date:'2026-09-16'}],'2026-09-16')),/会えなかった/);
});
test('publishing apartments merges identities once, retains removed rooms and explicit cleared statuses',()=>{
 const r=setup(),local=[{id:20,name:'旧名',lat:34,lng:136,rooms:[{no:'101',status:'met',date:'2026-09-16'},{no:'102',status:'revisit',date:'2026-09-16'},{no:'103',status:'away',date:'2026-09-16'}]}];
 const shared=[{id:'local-20',shared:true,name:'共有名',lat:34,lng:136,rooms:[{no:'101',status:''},{no:'102',status:''}]}];
 const stored={'local-20':[{no:'101',status:'posted',date:'2026-09-16'},{no:'102',status:'',date:''}],'missing-building':[{no:'201',status:'away',date:'2026-09-16'}]};
 const before=JSON.stringify({local,shared,stored}),rows=r.apartmentRows(local,shared,stored);
 assert.equal(rows.length,3);assert.equal(rows.find(x=>x.no==='101').status,'posted');assert.equal(rows.find(x=>x.no==='101').available,true);
 assert.equal(rows.find(x=>x.no==='103').available,false);assert.equal(rows.find(x=>x.no==='201').available,false);
 assert.equal(rows.filter(x=>x.no==='102').length,0);assert.equal(JSON.stringify({local,shared,stored}),before);
 const offline=r.apartmentRows(local,[],stored);assert.equal(offline.filter(x=>x.no==='101').length,1);
});
