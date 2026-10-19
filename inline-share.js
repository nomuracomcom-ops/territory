/* Sharing uses only whitelisted visit fields; private notes and service time never leave this origin. */
window.InlineShare=(()=>{
 const service='https://kikyogaoka-companions.balmy-titan-5521.chatgpt.site';
 const statuses=['met','away','posted','revisit','clear'];
 const key=r=>Number(r.lat).toFixed(5)+','+Number(r.lng).toFixed(5)+'|'+String(r.room||'').normalize('NFKC').trim();
 const publicRow=r=>({lat:r.lat,lng:r.lng,room:r.room,status:r.status,updated:r.updated});
 function changes(before,current,remote,queue){
  const old=new Map(before.map(r=>[key(r),r])),now=new Map(current.map(r=>[key(r),r])),versions=new Map(remote.map(r=>[key(r),r.version]));
  const result=[];
  for(const k of new Set([...old.keys(),...now.keys()])){
   const a=old.get(k),b=now.get(k);if(a?.status===b?.status||(a?.status==='clear'&&!b))continue;
   const r=b||{...a,status:'clear'};if(!a&&r.status==='clear')continue;
   const last=[...queue,...result].filter(e=>key(e)===k).at(-1);
   result.push({lat:r.lat,lng:r.lng,room:r.room,status:r.status,version:last?last.version+1:(versions.get(k)||0),operation:crypto.randomUUID()});
  }return result;
 }
 let territory=null,storage='',houseKey='',aptKey='',roomKey='',state=null,panel=null,badge=null,popup=null,nonce=null,seedRows=null,busy=false,applying=false,conflict=null,message='';
 const $=id=>document.getElementById(id);
 function read(){const h=JSON.parse(localStorage.getItem(houseKey)||'[]'),a=JSON.parse(localStorage.getItem(aptKey)||'[]'),r=JSON.parse(localStorage.getItem(roomKey)||'{}');App.validateHouses(h);App.validateApartments(a);Object.values(r).forEach(App.validateRooms);return {h,a,r};}
 function snapshot(){const v=read();const buildings=window.inlineApartmentSnapshot?window.inlineApartmentSnapshot():v.a;return PublicVisits.pack(territory.id,v.h,buildings).rows;}
 function persist(){if(state)localStorage.setItem(storage,JSON.stringify(state));}
 function capture(){if(!state||state.ended||applying)return;const rows=snapshot(),delta=changes(state.baseline||[],rows,state.rows||[],state.queue||[]);if(state.queue.length+delta.length>2000)throw Error('未送信の記録が多いため、通信を確認してください。');state.queue.push(...delta);state.baseline=rows;persist();}
 function render(){if(!panel)return;
  const live=state&&!state.ended;badge.hidden=!live;$('inlineShareStatus').textContent=message||(live?(state.queue.length?'未送信 '+state.queue.length+'件':'共有中・同期済み'):'この地図で同行者と共有できます。');
  window.dispatchEvent?.(new window.CustomEvent('inline-share-status',{detail:{pending:state?.queue?.length||0}}));
  badge.textContent=state?.queue?.length?'👥 共有中・未送信 '+state.queue.length+'件':'👥 共有中';
  $('inlineShareStart').hidden=!!live;$('inlineShareInvite').hidden=!live;$('inlineShareClose').hidden=!live||!state.ownerKey;$('inlineShareLeave').hidden=!live||!!state.ownerKey;
  $('inlineShareConflict').hidden=!conflict;$('btnCompanion')?.classList.toggle('active',!!live);if($('restoreAll'))$('restoreAll').disabled=!!live;if($('cleanupRecords')){$('cleanupRecords').disabled=!!live;$('cleanupRecords').title=live?'共有を終了してから記録を整理してください。':'';}
  if(live){const url=location.origin+location.pathname+'?t='+encodeURIComponent(territory.id)+'&s='+encodeURIComponent(state.id)+'&k='+encodeURIComponent(state.token);$('inlineShareLink').value=url;const qr=service+'/api/map-share-qr?id='+encodeURIComponent(state.id)+'&k='+encodeURIComponent(state.token);if($('inlineShareQR').getAttribute('src')!==qr)$('inlineShareQR').src=qr;}
 }
 function notice(text){message=text;render();}
 async function api(body){const response=await fetch(service+'/api/map-share?id='+encodeURIComponent(state.id),{method:body?'POST':'GET',headers:{'x-invite-token':state.token,...(state.ownerKey?{'x-owner-key':state.ownerKey}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(12000)});let data;try{data=await response.json()}catch{throw Error('共有に接続できません。訪問記録は端末に残っています。');}if(!response.ok)throw Object.assign(Error(data.error||'共有に接続できません。'),{status:response.status,row:data.row});return data;}
 function checkedRows(rows){if(!Array.isArray(rows)||rows.length>2000)throw Error('共有記録を確認できません。');const data={format:'territory-public-visits',version:1,territory:territory.id,rows:rows.map(publicRow)};PublicVisits.validate(data,territory.id);for(const r of rows)if(!Number.isSafeInteger(r.version)||r.version<0)throw Error('共有記録を確認できません。');return data.rows;}
 function apply(rows){
  const clean=checkedRows(rows),dirty=new Set(state.queue.map(key));const incoming=clean.filter(r=>!dirty.has(key(r)));
  // Do not disturb the private memo currently being typed. The next poll applies it after blur.
  if(document.activeElement?.matches('input,textarea,[contenteditable="true"]'))return false;
  const v=read(),shared=window.inlineSharedBuildings?window.inlineSharedBuildings():[],r=structuredClone(v.r),localRows=[];
  for(const row of incoming){const building=row.room&&shared.find(a=>key({...a,room:''})===key({...row,room:''}));if(!building){localRows.push(row);continue;}const roomRows=r[building.id]||(r[building.id]=[]);let old=roomRows.find(x=>String(x.no).normalize('NFKC').trim()===row.room);if(old?.status==='dnc')continue;if(!old){if(row.status==='clear')continue;old={no:row.room,status:'',date:''};roomRows.push(old);}old.status=row.status==='clear'?'':row.status;old.date=row.status==='clear'?'':new Date((row.updated||Date.now())+9*3600000).toISOString().slice(0,10);old.sharedUpdated=row.updated;}
  const merged=PublicVisits.merge({format:'territory-public-visits',version:1,territory:territory.id,rows:localRows},territory.id,v.h,v.a,r,true);
  const values={[houseKey]:JSON.stringify(merged.houses),[aptKey]:JSON.stringify(merged.apartments),[roomKey]:JSON.stringify(merged.shared)},updates={};for(const [k,value] of Object.entries(values))if(value!==localStorage.getItem(k))updates[k]=value;
  if(Object.keys(updates).length){applying=true;try{App.storeBatch(updates);window.dispatchEvent(new Event('inline-visits-updated'));}finally{applying=false;}}
  state.baseline=snapshot();persist();return true;
 }
 async function tick(){
  if(!state||state.ended||busy)return;busy=true;
  try{capture();if(navigator.onLine===false){message=state.queue.length?'オフライン・未送信 '+state.queue.length+'件（端末に保存済み）':'オフライン・訪問記録は端末に保存されます。';return;}let data=await api();if(data.territory!==territory.id)throw Error('区域が一致しません。');checkedRows(data.rows);state.rows=data.rows;state.expires=data.expires;if(data.ended){capture();state.finalRows=data.rows;if(apply(data.rows))delete state.finalRows;state.ended=true;persist();message=state.queue.length?'共有は終了しました。未送信の変更は自分の端末に残っています。':'最後の共有記録を保存しました。共有は終了しています。';return;}
   if(!conflict){while(state.queue.length){const e=state.queue[0];try{await api({action:'write',entry:e});}catch(error){if(error.status===409){conflict={entry:e,row:error.row};notice(error.message);break;}throw error;}state.queue.shift();persist();capture();}data=await api();}
   capture();state.rows=data.rows;apply(data.rows);if(!conflict)message=state.queue.length?'未送信の記録を送信中です。':'共有中・訪問状況を自動で保存しています。';persist();
  }catch(error){if(error.status===410){state.ended=true;message='共有は終了しました。訪問記録はこの端末に残っています。';persist();}else message=error.message||'接続待ち・記録は端末に保持しています。';}
  finally{busy=false;render();}
 }
 function recordCleanup(ref){const t=Territory.get(ref);if(!t)return;const k='inline-clear-before:'+t.id,old=localStorage.getItem(k);localStorage.setItem(k,String(Date.now()));return ()=>{if(old===null)localStorage.removeItem(k);else localStorage.setItem(k,old);};}
 function seed(){const rows=snapshot(),seen=new Set(rows.map(key));for(const r of state?.baseline||[]){if(!seen.has(key(r))&&r.status!=='clear')rows.push({...publicRow(r),status:'clear',updated:Date.now()});}return rows;}
 function start(){if(navigator.onLine===false){notice('共有の開始には通信が必要です。訪問記録はこの端末に保存されます。');return;}if(busy)return;nonce=crypto.randomUUID();popup=window.open(service+'/connect?t='+encodeURIComponent(territory.id)+'&n='+nonce,'territory-sharing-connect','width=500,height=650');if(!popup){notice('ポップアップを許可して、もう一度「共有を始める」を押してください。');return;}notice('接続確認の画面でサインインしてください。地図はこのまま使えます。');}
 async function close(){document.activeElement?.blur();if(!state||busy){notice('同期が終わってから、もう一度操作してください。');return;}await tick();if(state.ended)return;if(state.queue.length||conflict){notice('未送信の記録を確認してから共有を終了してください。');return;}if(!confirm('今日の共有を終了しますか？全員の訪問状況と再訪問ピンは、それぞれの地図に残ります。'))return;busy=true;
  try{capture();if(state.queue.length)throw Error('新しい記録があります。同期してから終了してください。');const data=await api({action:'close'});capture();state.rows=data.rows;state.finalRows=data.rows;if(apply(data.rows))delete state.finalRows;state.ended=true;persist();notice(state.queue.length?'共有終了。終了中に付けた未送信の記録は自分の地図に残っています。':'共有を終了しました。記録はこの端末に保存済みです。');}catch(error){notice(error.message);}finally{busy=false;render();}
 }
 async function leave(){document.activeElement?.blur();if(busy)return;await tick();if(state?.queue.length||conflict){notice('未送信の記録を確認してから共有を離れてください。');return;}if(!confirm('自分だけ共有から離れますか？記録はこの端末に残り、同行者の共有は続きます。'))return;state.ended=true;persist();notice('共有から離れました。訪問記録は保存済みです。');}
 function resolve(useMine){if(!conflict)return;const k=key(conflict.entry),version=conflict.row?.version||0;if(useMine){let next=version;state.queue=state.queue.map(e=>key(e)===k?{...e,version:next++,operation:crypto.randomUUID()}:e);}else{state.queue=state.queue.filter(e=>key(e)!==k);const row=conflict.row||{...conflict.entry,status:'clear',version:0,updated:Date.now()};apply([row]);}conflict=null;persist();void tick();}
 function open(){if(!panel){alert('区域地図を開いてから共有してください。');return;}panel.hidden=!panel.hidden;render();}
 function mount(){
  const q=new URLSearchParams(location.search);territory=Territory.get(q.get('t'));if(!territory||!window.__LMAP)return;
  const k=Territory.resolve(q.get('t'));houseKey='terr-'+k;aptKey=houseKey+'-apt';roomKey=houseKey+'-shared-records';storage='inline-share:'+territory.id;
  const style=document.createElement('style');style.textContent='.inline-share-panel{position:fixed;right:12px;top:55px;width:min(350px,calc(100vw - 24px));max-height:80dvh;overflow:auto;background:#fff;padding:20px;border-radius:16px;box-shadow:0 8px 40px #0004;z-index:2500;font-size:14px;color:#234136}.inline-share-panel[hidden],.inline-share-badge[hidden]{display:none}.inline-share-panel h3{margin:0 0 14px}.inline-share-panel button{padding:10px;margin:4px 4px 4px 0;border:1px solid #c7d8cd;border-radius:9px;background:#edf5ee;color:#234136;cursor:pointer}.inline-share-panel p{line-height:1.7;margin:10px 0}.inline-share-panel small{display:block;color:#617267;line-height:1.6}.inline-share-panel input{width:100%;padding:8px;box-sizing:border-box}.inline-share-panel img{display:block;max-width:220px;width:75%;margin:8px auto}.inline-share-badge{position:absolute;bottom:82px;left:50%;transform:translateX(-50%);border:0;border-radius:20px;padding:8px 14px;background:#285b48;color:white;z-index:1100;white-space:nowrap;font-size:12px}';document.head.appendChild(style);
  panel=document.createElement('section');panel.className='inline-share-panel';panel.hidden=true;panel.setAttribute('aria-label','同行者と共有');panel.innerHTML='<button id="inlineShareHide" style="float:right" aria-label="共有パネルを閉じる">×</button><h3>👥 同行者と共有</h3><p id="inlineShareStatus" role="status"></p><small>会えた・留守・投函・再訪問ピン・部屋番号を共有します。メモと奉仕時間は自分だけに残ります。</small><button id="inlineShareStart">この地図で共有を始める</button><div id="inlineShareInvite" hidden><img id="inlineShareQR" alt="この地図の共有に参加するQRコード"><input id="inlineShareLink" readonly aria-label="共有の招待リンク"><button id="inlineShareCopy">招待リンクをコピー</button><small>この組の同行者だけに渡してください。招待は当日24時まで有効です。</small></div><div id="inlineShareConflict" hidden><p>同じお宅を同行者が更新しました。どちらを使いますか？</p><button id="inlineShareLatest">共有の最新を使う</button><button id="inlineShareMine">自分の変更を反映</button></div><button id="inlineShareClose" hidden>今日の共有を終了</button><button id="inlineShareLeave" hidden>自分だけ共有から離れる</button>';
  document.body.appendChild(panel);badge=document.createElement('button');badge.className='inline-share-badge';badge.hidden=true;badge.onclick=open;document.body.appendChild(badge);
  $('inlineShareHide').onclick=()=>panel.hidden=true;$('inlineShareStart').onclick=start;$('inlineShareClose').onclick=close;$('inlineShareLeave').onclick=leave;$('inlineShareLatest').onclick=()=>resolve(false);$('inlineShareMine').onclick=()=>resolve(true);
  $('inlineShareCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('inlineShareLink').value);notice('招待リンクをコピーしました。');}catch{$('inlineShareLink').select();notice('招待リンクを選択してコピーしてください。');}};
  try{const saved=JSON.parse(localStorage.getItem(storage)||'null');if(saved&&saved.territory===territory.id)state=saved;const id=q.get('s'),token=q.get('k');if(id&&token&&/^[a-f0-9-]{36}$/i.test(id)&&token.length===72&&(!state||state.id!==id)){state={id,token,territory:territory.id,queue:[],baseline:snapshot(),rows:[],ended:false};persist();panel.hidden=false;}if(state){if(!Array.isArray(state.queue)||!Array.isArray(state.baseline)||!Array.isArray(state.rows))throw Error();for(const e of state.queue)if(Object.keys(e).some(k=>!['lat','lng','room','status','version','operation'].includes(k))||!statuses.includes(e.status))throw Error();}}
  catch{state=null;notice('共有の接続情報を読み込めませんでした。訪問記録は保持しています。');}
  window.addEventListener('message',e=>{if(e.origin!==service||e.source!==popup||e.data?.nonce!==nonce)return;
   if(e.data.type==='inline-share-ready'&&e.data.territory===territory.id){try{const rows=seed();seedRows=rows;PublicVisits.validate({format:'territory-public-visits',version:1,territory:territory.id,rows},territory.id);popup.postMessage({type:'inline-share-create',nonce,territory:territory.id,rows,clearBefore:Number(localStorage.getItem('inline-clear-before:'+territory.id)||0)},service);}catch(error){notice(error.message);}}
   if(e.data.type==='inline-share-created'){const d=e.data.data;if(d?.territory!==territory.id||typeof d.id!=='string'||typeof d.token!=='string'||typeof d.ownerKey!=='string')return;try{state={...d,queue:[],rows:[],baseline:seedRows||snapshot(),ended:false};persist();popup.close();nonce=null;notice('この地図で共有を開始しました。');void tick();}catch{notice('接続情報を保存できません。端末の空き容量を確認してください。');}}
  });
  const finishPending=()=>{if(state?.finalRows){try{if(apply(state.finalRows)){delete state.finalRows;persist();notice('最後の共有記録を保存しました。メモは自分だけに残っています。');}}catch(error){notice(error.message);}}};
  document.addEventListener('focusout',()=>setTimeout(finishPending,0));finishPending();
  const check=()=>{if(!document.hidden)void tick();};setInterval(check,5000);window.addEventListener('online',check);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);window.addEventListener('beforeunload',()=>{try{capture()}catch{}});render();void tick();
 }
 if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();}
 return {open,changes,key,recordCleanup,status:()=>({pending:state?.queue?.length||0,active:!!state&&!state.ended})};
})();
