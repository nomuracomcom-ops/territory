/* Offline UI contains only map metadata and report locations. Visit notes remain in existing local storage. */
window.Offline=(()=>{
 const QUEUE='offline-report-locations-v1',service='https://kikyogaoka-companions.balmy-titan-5521.chatgpt.site/report';
 let registration=null,maps=[],current=null,panel=null,bar=null,busy=false,error='',progress=null;
 const $=id=>document.getElementById(id),online=()=>navigator.onLine!==false;
 function reports(){try{const rows=JSON.parse(localStorage.getItem(QUEUE)||'[]');if(!Array.isArray(rows)||rows.some(r=>!/^T\d{4,}$/.test(r.territory)||!Number.isFinite(r.lat)||!Number.isFinite(r.lng)||typeof r.id!=='string'))throw Error();return rows;}catch{error='報告待ちの位置を読み込めません。保存データを確認してください。';return [];}}
 function request(data,onProgress){return new Promise((resolve,reject)=>{
  const worker=navigator.serviceWorker.controller||registration?.active;if(!worker){reject(Error('準備中です。少し待ってからお試しください。'));return;}
  const ch=new MessageChannel();let timer;const timeout=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(Error('保存を確認できません。通信を確認して再度お試しください。')),45000);};
  function finish(e,result){clearTimeout(timer);ch.port1.close();e?reject(e):resolve(result);}
  ch.port1.onmessage=e=>{timeout();if(e.data.progress){onProgress?.(e.data.progress);return;}finish(e.data.error?Error(e.data.error):null,e.data.result);};timeout();worker.postMessage(data,[ch.port2]);
 });}
 function saved(){return maps.find(m=>m.id===current?.id);}
 function status(){const pending=window.InlineShare?.status?.()?.pending||0,waiting=reports().length;return (online()?'オンライン':'オフライン・記録は端末に保存')+(pending?'｜共有の未送信 '+pending+'件':'')+(waiting?'｜報告待ち '+waiting+'件':'');}
 function render(){if(!bar)return;bar.classList.toggle('is-offline',!online());$('offlineStatus').textContent=status();
  if(!panel)return;const m=saved();$('offlineCurrent').textContent=current?Territory.number(current.id)+' '+current.name:'保存した区域を選んで使えます。';
  $('offlineSave').hidden=!current;$('offlineSave').disabled=busy||!online()||!registration;$('offlineSave').textContent=busy?'保存中…':m?'この区域の地図を更新':'この区域をオフラインで使う';
  $('offlineMessage').textContent=error||(m?'保存済み：'+new Date(m.savedAt).toLocaleString('ja-JP')+'。地図の細かさ '+m.maxZoom+' まで。':'電波のある場所で区域の地図を保存してください。');
  $('offlineProgress').hidden=!progress;if(progress){$('offlineProgress').max=progress.total;$('offlineProgress').value=progress.done;$('offlineMessage').textContent='地図を保存中 '+progress.done+' / '+progress.total+'。この画面を開いたままお待ちください。';}
  const list=$('offlineMaps');list.replaceChildren();for(const row of maps){const li=document.createElement('li'),a=document.createElement('a');a.className='offline-link';a.href='?t='+encodeURIComponent(row.id);a.textContent=Territory.number(row.id)+' '+row.name;li.appendChild(a);const small=document.createElement('small');small.textContent='保存 '+new Date(row.savedAt).toLocaleString('ja-JP');li.appendChild(small);const remove=document.createElement('button');remove.textContent='保存した地図を削除';remove.disabled=busy;remove.onclick=async()=>{if(!confirm('この地図のオフライン保存を削除しますか？訪問記録は残ります。'))return;try{await request({type:'DELETE',id:row.id});await refresh();}catch(e){error=e.message;render();}};li.appendChild(remove);list.appendChild(li);}
  if(!maps.length)list.textContent='保存した区域はまだありません。';
  const queue=$('offlineReports');queue.replaceChildren();for(const r of reports()){const li=document.createElement('li'),a=document.createElement('a');a.className='offline-link';a.href=service+'?t='+encodeURIComponent(r.territory)+'&lat='+r.lat+'&lng='+r.lng;a.target='_blank';a.rel='noopener noreferrer';a.textContent=Territory.number(r.territory)+' の報告フォームを開く';a.onclick=e=>{if(!online()){e.preventDefault();error='通信が戻ってから報告フォームを開いてください。';render();}};li.appendChild(a);const small=document.createElement('small');small.textContent='位置を保存 '+new Date(r.created).toLocaleString('ja-JP')+'。まだ報告は送信されていません。';li.appendChild(small);const remove=document.createElement('button');remove.textContent='報告待ちから削除';remove.onclick=()=>{if(!confirm('この位置を報告待ちから削除しますか？'))return;try{localStorage.setItem(QUEUE,JSON.stringify(reports().filter(x=>x.id!==r.id)));render();}catch{error='保存できませんでした。';render();}};li.appendChild(remove);queue.appendChild(li);}
  $('offlineReportsSection').hidden=!reports().length;
 }
 function constrain(){const map=window.__LMAP,m=saved();if(!map)return;if(!online()&&m){map.setMinZoom?.(m.minZoom);map.setMaxZoom?.(m.maxZoom+3);map.setMaxBounds?.([[m.bounds[0],m.bounds[1]],[m.bounds[2],m.bounds[3]]]);}else{map.setMinZoom?.(0);map.setMaxZoom?.(21);map.setMaxBounds?.(null);}map.eachLayer?.(l=>{if(l instanceof L.TileLayer){l.options.maxNativeZoom=!online()&&m?m.maxZoom:18;l.redraw();}});}
 async function refresh(){maps=await request({type:'LIST'});constrain();render();}
 async function save(){if(busy||!current||!online())return;busy=true;error='';progress={done:0,total:1};render();try{await request({type:'SAVE',id:current.id,name:current.name,boundary:current.boundary},p=>{progress=p;render();});try{await navigator.storage?.persist?.();}catch{}await refresh();}catch(e){error=e.message;}finally{busy=false;progress=null;render();}}
 function open(){if(!panel)return;render();if(panel.showModal)panel.showModal();else panel.setAttribute('open','');}
 async function mount(){
  const ref=new URLSearchParams(location.search).get('t');current=Territory.get(ref);
  bar=document.createElement('div');bar.className='offline-bar';bar.innerHTML='<span id="offlineStatus" role="status"></span><button type="button" id="offlineOpen">地図の保存</button>';document.querySelector('header').after(bar);
  panel=document.createElement('dialog');panel.id='offlinePanel';panel.setAttribute('aria-labelledby','offlineTitle');panel.innerHTML='<button class="offline-close" id="offlineClose" aria-label="閉じる">×</button><h2 id="offlineTitle">オフラインで使う</h2><p id="offlineCurrent"></p><button id="offlineSave" type="button">この区域をオフラインで使う</button><progress id="offlineProgress" class="offline-progress" hidden></progress><p id="offlineMessage" role="status"></p><p>保存した区域と周辺を、通信なしで表示できます。訪問記録・メモ・奉仕時間はこの端末に保存されます。</p><p class="offline-stale">🚫の位置と共有の建物は、最後に取得した情報です。通信がない間の変更は確認できません。</p><h3>保存した区域</h3><ul id="offlineMaps"></ul><section id="offlineReportsSection" hidden><h3>報告待ちの位置</h3><p>通信が戻ったら報告フォームを開き、日付・住所を入力して送信してください。送信後にこの一覧から削除できます。</p><ul id="offlineReports"></ul></section><small>この端末・ブラウザで使えます。ブラウザの保存データを消すと地図も消えます。Googleマップの経路案内と報告フォームの送信には通信が必要です。</small>';document.body.appendChild(panel);
  $('offlineOpen').onclick=open;$('offlineClose').onclick=()=>{if(panel.close)panel.close();else panel.removeAttribute('open');};$('offlineSave').onclick=save;
  document.addEventListener('click',e=>{const a=e.target.closest?.('a');if(!a||online()||!current)return;let u;try{u=new URL(a.href,location.href);}catch{return;}if(u.origin!==new URL(service).origin||u.pathname!=='/report')return;e.preventDefault();e.stopImmediatePropagation();try{const lat=Number(u.searchParams.get('lat')),lng=Number(u.searchParams.get('lng'));if(!Number.isFinite(lat)||!Number.isFinite(lng))throw Error();const rows=reports();if(!rows.some(r=>r.territory===current.id&&Math.abs(r.lat-lat)<.00001&&Math.abs(r.lng-lng)<.00001))rows.push({id:crypto.randomUUID(),territory:current.id,lat,lng,created:Date.now()});localStorage.setItem(QUEUE,JSON.stringify(rows));error='報告待ちとして位置を端末に保存しました。通信復帰後、報告フォームから送信してください。';open();}catch{error='報告待ちを保存できませんでした。端末の空き容量を確認してください。';open();}},true);
  window.addEventListener('inline-share-status',render);window.addEventListener('storage',render);
  window.addEventListener('online',()=>{error='';constrain();render();});window.addEventListener('offline',()=>{constrain();render();});render();
  if(!('serviceWorker' in navigator)||!window.isSecureContext){error='このブラウザでは地図のオフライン保存に対応していません。';render();return;}
  try{await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});registration=await navigator.serviceWorker.ready;await refresh();}catch{error='オフラインの準備ができませんでした。通信を確認し、再読み込みしてください。';render();}
 }
 if(typeof document!=='undefined')window.addEventListener('load',mount);
 return {open};
})();
