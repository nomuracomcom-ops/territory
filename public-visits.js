/* Deliberately serialize only visit status, location, room and date. Never notes. */
window.PublicVisits=(()=>{
 const allowed=['met','away','posted','revisit','clear'];
 const key=(lat,lng,room='')=>Number(lat).toFixed(5)+','+Number(lng).toFixed(5)+'|'+String(room).normalize('NFKC').trim();
 const date=t=>new Date(t+9*3600000).toISOString().slice(0,10);
 function timestamp(r){return Number.isSafeInteger(r.sharedUpdated)?r.sharedUpdated:(r.date&&Number.isFinite(Date.parse(r.date))?Date.parse(r.date+'T00:00:00+09:00'):0);}
 function publicRow(lat,lng,room,r){return {lat,lng,room,status:r.status||'clear',updated:timestamp(r)};}
 function pack(territory,houses,apartments,shared={}){
  const rows=[];
  houses.forEach(h=>{if(allowed.includes(h.status)||(h.status===''&&h.sharedUpdated>0))rows.push(publicRow(h.lat,h.lng,'',h));});
  apartments.forEach(a=>{const rooms=shared[a.id]||a.rooms;rooms.forEach(r=>{if(allowed.includes(r.status)||(r.status===''&&r.sharedUpdated>0))rows.push(publicRow(a.lat,a.lng,r.no,r));});});
  return {format:'territory-public-visits',version:1,territory,rows};
 }
 function validate(data,territory){
  if(!data||data.format!=='territory-public-visits'||data.version!==1||data.territory!==territory||!Array.isArray(data.rows)||data.rows.length>2000)throw Error('この区域の訪問記録ファイルを選んでください。');
  const t=Territory.get(territory),p=t.boundary,seen=new Set();
  data.rows.forEach(r=>{
   if(!r||Object.keys(r).some(k=>!['lat','lng','room','status','updated'].includes(k))||!Number.isFinite(r.lat)||!Number.isFinite(r.lng)||typeof r.room!=='string'||r.room.length>20||/[\x00-\x1f<>]/.test(r.room)||!allowed.includes(r.status)||!Number.isSafeInteger(r.updated)||r.updated<0||r.updated>Date.now()+60000)throw Error('訪問記録の形式を確認してください。');
   if(r.lat<Math.min(...p.map(v=>v[0]))-.002||r.lat>Math.max(...p.map(v=>v[0]))+.002||r.lng<Math.min(...p.map(v=>v[1]))-.002||r.lng>Math.max(...p.map(v=>v[1]))+.002)throw Error('区域外の記録があります。');
   const k=key(r.lat,r.lng,r.room);if(seen.has(k))throw Error('同じお宅・部屋の記録が重複しています。');seen.add(k);
  });return data.rows;
 }
 function merge(data,territory,houses,apartments,shared={}){
  const rows=validate(data,territory),h=structuredClone(houses),a=structuredClone(apartments),s=structuredClone(shared);
  let nextId=Math.max(Date.now(),...h.map(x=>x.id),...a.map(x=>x.id));
  for(const r of rows){
   if(!r.room){let old=h.find(x=>key(x.lat,x.lng)===key(r.lat,r.lng));if(old&&(old.status==='dnc'||timestamp(old)>r.updated))continue;if(!old){if(r.status==='clear')continue;old={id:++nextId,lat:r.lat,lng:r.lng,status:'',memo:'',date:''};h.push(old);}old.status=r.status==='clear'?'':r.status;old.date=r.status==='clear'?'':date(r.updated||Date.now());old.sharedUpdated=r.updated;
   }else{let building=a.find(x=>key(x.lat,x.lng)===key(r.lat,r.lng));if(!building){if(r.status==='clear')continue;building={id:++nextId,lat:r.lat,lng:r.lng,name:'共有の建物',rooms:[]};a.push(building);}const roomRows=s[building.id]||building.rooms;let old=roomRows.find(x=>String(x.no).normalize('NFKC').trim()===r.room.normalize('NFKC').trim());if(old&&(old.status==='dnc'||timestamp(old)>r.updated))continue;if(!old){if(r.status==='clear')continue;old={no:r.room,status:'',date:''};roomRows.push(old);}old.status=r.status==='clear'?'':r.status;old.date=r.status==='clear'?'':date(r.updated||Date.now());old.sharedUpdated=r.updated;}
  }return {houses:h,apartments:a,shared:s};
 }
 function download(data){const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='訪問記録_'+data.territory+'.json';link.click();URL.revokeObjectURL(url);}
 let peer=null,activeTerritory=null;
 function open(ref){const t=Territory.get(ref);if(!t)return;activeTerritory=t.id;peer=window.open('https://kikyogaoka-companions.balmy-titan-5521.chatgpt.site/?t='+encodeURIComponent(t.id),'territory-companion');}
 function mount(){
  const ref=new URLSearchParams(location.search).get('t'),territory=Territory.get(ref);if(!territory)return;
  const k=Territory.resolve(ref),hk='terr-'+k,ak=hk+'-apt',sk=hk+'-shared-records';
  const host=document.querySelector('.backup-tools');if(!host)return;
  const info=document.createElement('p');info.textContent='同行者と受け渡す訪問記録（再訪問ピンを含む）。メモ・奉仕時間は含みません。';
  const out=document.createElement('button');out.textContent='共有用の訪問記録を書き出す';const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;const into=document.createElement('button');into.textContent='共有の訪問記録を取り込む';into.onclick=()=>input.click();
  const read=()=>{const houses=JSON.parse(localStorage.getItem(hk)||'[]'),apartments=JSON.parse(localStorage.getItem(ak)||'[]'),shared=JSON.parse(localStorage.getItem(sk)||'{}');App.validateHouses(houses);App.validateApartments(apartments);Object.values(shared).forEach(App.validateRooms);return {houses,apartments,shared};};
  out.onclick=()=>{try{const v=read();download(pack(territory.id,v.houses,v.apartments,v.shared));}catch(e){alert(e.message)}};
  input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>600000)throw Error('ファイルが大きすぎます。');const data=JSON.parse(await file.text());const v=read(),result=merge(data,territory.id,v.houses,v.apartments,v.shared);App.validateHouses(result.houses);App.validateApartments(result.apartments);if(!confirm('共有の訪問状況を取り込みます。個人メモは保持し、新しい記録を優先します。'))return;App.storeBatch({[hk]:JSON.stringify(result.houses),[ak]:JSON.stringify(result.apartments),[sk]:JSON.stringify(result.shared)},{[hk]:localStorage.getItem(hk),[ak]:localStorage.getItem(ak),[sk]:localStorage.getItem(sk)});location.reload();}catch(e){alert(e.message)}finally{input.value=''}};
  host.append(info,out,into,input);
  window.addEventListener('message',e=>{
   if(e.origin!=='https://kikyogaoka-companions.balmy-titan-5521.chatgpt.site'||e.source!==peer||activeTerritory!==territory.id)return;
   if(e.data?.type==='public-visits-request'&&e.data.territory===territory.id){try{const v=read();peer.postMessage({type:'public-visits-seed',data:pack(territory.id,v.houses,v.apartments,v.shared)},e.origin)}catch(error){alert(error.message)}}
   if(e.data?.type==='public-visits-save'){try{const v=read(),result=merge(e.data.data,territory.id,v.houses,v.apartments,v.shared);App.validateHouses(result.houses);App.validateApartments(result.apartments);App.storeBatch({[hk]:JSON.stringify(result.houses),[ak]:JSON.stringify(result.apartments),[sk]:JSON.stringify(result.shared)});location.reload()}catch(error){alert('共有の記録を保存できませんでした。共有画面から書き出してください。'+error.message)}}
  });
 }
 if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();}
 return {pack,validate,merge,open};
})();
