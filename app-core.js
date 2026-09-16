/* Shared utilities. Existing localStorage keys remain compatible. */
window.App = (() => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const recordKey = k => /^terr-\d+(?:-apt|-shared-records)?$/.test(k) || ['svc-log','svc-active'].includes(k);
  const statuses = ['', 'met', 'revisit', 'posted', 'dnc', 'away'];
  const coordinate = (lat,lng) => typeof lat==='number' && typeof lng==='number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180;
  function check(ok){ if(!ok) throw Error('記録ファイルの形式が正しくありません。'); }
  function validateRooms(rows){ check(Array.isArray(rows)); const seen=new Set(); rows.forEach(r=>{check(r && typeof r.no==='string' && r.no.length>0 && !seen.has(r.no) && statuses.includes(r.status||'') && (!r.date || typeof r.date==='string')); seen.add(r.no);}); }
  function validateHouses(rows){ check(Array.isArray(rows)); rows.forEach(h=>check(h && coordinate(h.lat,h.lng) && Number.isFinite(h.id) && statuses.includes(h.status) && typeof h.memo==='string' && (!h.date || typeof h.date==='string'))); }
  function validateApartments(rows){ check(Array.isArray(rows)); const seen=new Set(); rows.forEach(a=>{check(a && coordinate(a.lat,a.lng) && Number.isFinite(a.id) && !seen.has(a.id) && typeof a.name==='string');seen.add(a.id);validateRooms(a.rooms);}); }
  function validateEntry(k,raw){
    check(recordKey(k) && typeof raw==='string'); const v=JSON.parse(raw);
    if(k==='svc-log'){ check(Array.isArray(v)); v.forEach(x=>check(x && Number.isFinite(x.id) && Number.isFinite(x.start) && Number.isFinite(x.end) && x.end>=x.start && Number.isFinite(x.min) && x.min>=0 && typeof x.date==='string' && (!x.terr || /^\d+$/.test(x.terr)))); }
    else if(k==='svc-active'){ check(v===null || (Number.isFinite(v.start) && /^\d+$/.test(v.terr))); }
    else if(k.endsWith('-shared-records')){ check(v && typeof v==='object' && !Array.isArray(v)); Object.entries(v).forEach(([id,rooms])=>{check(!['__proto__','constructor','prototype'].includes(id));validateRooms(rooms);}); }
    else if(k.endsWith('-apt')) validateApartments(v); else validateHouses(v);
  }
  function parseCSV(text){
    const rows=[]; let row=[],cell='',quoted=false;
    text=String(text).replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){ if(quoted && text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; }
      else if(!quoted && (c===',' || c==='\t')){row.push(cell);cell='';}
      else if(!quoted && (c==='\n' || c==='\r')){if(c==='\r' && text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    if(quoted) throw Error('CSVの引用符が閉じていません');
    if(cell || row.length){row.push(cell);rows.push(row);}
    return rows.map(r=>r.length===1 && r[0].includes('\t') ? r[0].split('\t') : r).filter(r=>r.some(c=>c.trim()));
  }
  const feedStates=new Map();
  function feedStatus(id,label,state,time){
    feedStates.set(id,{label,state,time});
    const details=document.getElementById('syncDetails'); if(!details)return;
    details.replaceChildren();
    feedStates.forEach(s=>{const p=document.createElement('p');p.textContent=s.label+'：'+s.state+(s.time?'（取得 '+new Date(s.time).toLocaleString('ja-JP')+'）':'');details.appendChild(p);});
    const failed=[...feedStates.values()].some(s=>s.state.includes('失敗') || s.state.includes('未確認'));
    const pending=[...feedStates.values()].some(s=>s.state==='確認中');
    document.getElementById('syncSummary').textContent=failed?'⚠ 共有情報に未確認の項目があります':pending?'共有情報を確認中…':'✓ 共有情報を取得しました';
  }
  const reloaders=[];
  function feed(id,label,url,decode,apply){
    let last=null, busy=false;
    async function refresh(){
      if(busy)return;busy=true;feedStatus(id,label,'確認中',last);
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
      try{const r=await fetch(url+(url.includes('?')?'&':'?')+'_='+Date.now(),{signal:controller.signal});if(!r.ok)throw Error(r.status);const data=decode(parseCSV(await r.text()));apply(data);last=Date.now();feedStatus(id,label,'取得済み',last);}
      catch(e){feedStatus(id,label,last?'取得失敗・前回の表示を保持':'取得失敗・未確認',last);}
      finally{clearTimeout(timer);busy=false;}
    }
    reloaders.push(refresh);refresh();
  }
  let undo=null, undoTimer=null;
  function notice(message){const n=document.getElementById('recordNotice');if(n){n.textContent=message;n.hidden=false;}}
  function store(k,v){
    let old;
    try{old=localStorage.getItem(k);localStorage.setItem(k,v);}
    catch(e){notice('保存できませんでした。端末の空き容量を確認し、再度操作してください。');throw e;}
    if(recordKey(k) && k!=='svc-active' && k!=='svc-log' && old!==v){
      // Group successive typing into a single undo, but keep distinct clicks separate.
      const typing=document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      if(!(typing && undo && undo.key===k && undo.typing && Date.now()-undo.time<1500))undo={key:k,old,typing,time:Date.now()};
      else undo.time=Date.now();
      const button=document.getElementById('undoBtn'),control=button&&button.closest('.undo-control');if(control){control.hidden=false;clearTimeout(undoTimer);undoTimer=setTimeout(()=>{control.hidden=true;undo=null;},15000);}
    }
  }
  function remove(k){try{localStorage.removeItem(k);}catch(e){notice('記録を保存できませんでした。再度操作してください。');throw e;}}
  function download(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function backup(){const records={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(recordKey(k))records[k]=localStorage.getItem(k);}return {format:'territory-backup',version:1,createdAt:new Date().toISOString(),records};}
  function validateBackup(data){check(data && data.format==='territory-backup' && data.version===1 && data.records && typeof data.records==='object' && !Array.isArray(data.records));Object.entries(data.records).forEach(([k,v])=>validateEntry(k,v));return data.records;}
  function restore(data){
    const records=validateBackup(data),before=backup().records;
    try{Object.entries(records).forEach(([k,v])=>localStorage.setItem(k,v));}
    catch(e){Object.keys(records).forEach(k=>{if(!(k in before))localStorage.removeItem(k);});Object.entries(before).forEach(([k,v])=>localStorage.setItem(k,v));throw e;}
  }
  async function copy(text){
    try{await navigator.clipboard.writeText(text);alert('コピーしました。担当者が共有シートに貼り付けると反映されます。');return true;}
    catch(e){const sheet=document.getElementById('copySheet');document.getElementById('copyText').value=text;sheet.hidden=false;document.getElementById('copyText').select();return false;}
  }
  function tsvCell(value){const s=String(value).replace(/[\t\r\n]+/g,' ');if(/^[=+@-]/.test(s))return "'"+s;return s;}
  const api={escape,coordinate,parseCSV,feed,feedStatus,store,remove,backup,restore,validateBackup,validateHouses,validateApartments,validateRooms,download,copy,tsvCell,mode:null};
  document.addEventListener('DOMContentLoaded',()=>{
    document.body.insertAdjacentHTML('beforeend','<div id="recordNotice" role="alert" hidden></div><div id="copySheet" class="copy-sheet" hidden><div><p>自動コピーできませんでした。下の内容を選択してコピーしてください。</p><textarea id="copyText" aria-label="共有用の内容" readonly></textarea><button id="copyClose">閉じる</button></div></div>');
    const zoomTools=document.querySelector('.leaflet-top.leaflet-right');if(zoomTools)zoomTools.insertAdjacentHTML('beforeend','<div class="leaflet-control undo-control" hidden><button id="undoBtn" type="button" title="直前の記録を元に戻す" aria-label="直前の記録を元に戻す">↩</button></div>');
    document.getElementById('copyClose').onclick=()=>document.getElementById('copySheet').hidden=true;
    const undoButton=document.getElementById('undoBtn');if(undoButton)undoButton.onclick=()=>{if(!undo)return;try{if(undo.old===null)localStorage.removeItem(undo.key);else localStorage.setItem(undo.key,undo.old);location.reload();}catch(e){notice('元に戻せませんでした。端末の空き容量を確認してください。');}};
    document.getElementById('syncRetry').onclick=()=>reloaders.forEach(f=>f());
    window.addEventListener('online',()=>reloaders.forEach(f=>f()));
    window.addEventListener('offline',()=>{feedStates.forEach((s,id)=>feedStatus(id,s.label,'通信なし・最新情報は未確認',s.time));});
    const toolbar=document.querySelector('.toolbar'),record=document.getElementById('btnRecord');
    record.onclick=()=>{const open=!toolbar.classList.contains('record-open');toolbar.classList.toggle('record-open',open);record.setAttribute('aria-expanded',String(open));if(!open){api.mode=null;document.querySelectorAll('.record-action').forEach(b=>b.classList.remove('active'));document.getElementById('hint').style.display='none';}};
    const names={btnAdd:'家の場所をタップ',btnAddApt:'建物の場所をタップ',btnDnc:'注意事項の場所をタップ'};
    // Capture before old handlers; one central mode prevents overlapping map actions.
    Object.keys(names).forEach(id=>{const b=document.getElementById(id);b.addEventListener('click',e=>{e.stopImmediatePropagation();api.mode=api.mode===id?null:id;Object.keys(names).forEach(k=>document.getElementById(k).classList.toggle('active',api.mode===k));const h=document.getElementById('hint');h.textContent=api.mode?names[api.mode]+'（同じボタンで終了）':'';h.style.display=api.mode?'block':'none';},true);});
    document.querySelectorAll('.toolbar button').forEach(b=>b.setAttribute('aria-label',b.title||b.textContent));
    document.getElementById('backupAll').onclick=()=>{try{download('電子区域_全記録_'+new Date().toISOString().slice(0,10)+'.json',backup());document.getElementById('backupStatus').textContent='バックアップを書き出しました。ダウンロード先を確認してください。';}catch(e){notice('バックアップを作成できませんでした。');}};
    document.getElementById('restoreAll').onclick=()=>document.getElementById('backupFile').click();
    document.getElementById('backupFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());const records=validateBackup(data);if(!Object.keys(records).length)throw Error('記録がありません');if(!confirm('ファイルに含まれる区域・奉仕記録を置き換えます。現在の記録は先にバックアップしてください。復元しますか？'))return;restore(data);location.reload();}catch(err){alert('復元できませんでした。ファイル形式と端末の空き容量を確認してください。');}finally{e.target.value='';}};
  });
  return api;
})();
