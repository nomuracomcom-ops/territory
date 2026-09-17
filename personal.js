/* Personal home, one recent-map entry per territory, and deliberate area cleanup. */
window.Personal = (() => {
  const HISTORY='map-history', HIDDEN='map-history-hidden', disposable=['met','posted','away'];
  let shared=[], panel='maps', editingMaps=false;
  const territoryName=t=>(window.TERRITORIES||{})[t]?.name||'区域 '+t;
  const known=t=>Object.prototype.hasOwnProperty.call(window.TERRITORIES||{},t);
  function read(key,fallback) {
    const raw=localStorage.getItem(key);
    if(raw===null)return fallback;
    App.validateEntry(key,raw);return JSON.parse(raw);
  }
  function safeRead(key,fallback) {
    try{return read(key,fallback);}catch(e){App.notice('一部の保存記録を読み込めませんでした。元の記録は保持しています。バックアップを確認してください。');return fallback;}
  }
  function scan() {
    const areas=new Map();
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i),m=/^terr-(\d+)(-apt|-shared-records)?$/.exec(key);
      if(!m)continue;
      if(!areas.has(m[1]))areas.set(m[1],{houses:[],local:[],saved:{}});
      const type=m[2]==='-apt'?'local':m[2]==='-shared-records'?'saved':'houses';
      areas.get(m[1])[type]=safeRead(key,type==='saved'?{}:[]);
    }
    return areas;
  }
  function remember(openTerr) {
    // An absent date means evidence of previous use, never an invented opening date.
    const old=read(HISTORY,[]),hidden=new Set(read(HIDDEN,[])),byId=new Map(old.map(x=>[x.terr,{...x}]));
    const add=t=>{if(/^\d+$/.test(t) && !hidden.has(t) && !byId.has(t))byId.set(t,{terr:t,name:territoryName(t),lastOpened:null});};
    for(const [t,a] of scan())if(a.houses.length || a.local.length || Object.values(a.saved).some(r=>r.length))add(t);
    for(const log of safeRead('svc-log',[]))if(log.terr)add(String(log.terr));
    const active=safeRead('svc-active',null);if(active)add(String(active.terr));
    if(openTerr && known(openTerr)){hidden.delete(openTerr);byId.set(openTerr,{terr:openTerr,name:territoryName(openTerr),lastOpened:Date.now()});}
    const rows=[...byId.values()];
    if(JSON.stringify(old)!==JSON.stringify(rows))App.store(HISTORY,JSON.stringify(rows));
    if(JSON.stringify(read(HIDDEN,[]))!==JSON.stringify([...hidden]))App.store(HIDDEN,JSON.stringify([...hidden]));
    return rows;
  }
  function usedMaps() {
    return safeRead(HISTORY,[]).slice().sort((a,b)=>(b.lastOpened??-1)-(a.lastOpened??-1) || a.terr.localeCompare(b.terr,undefined,{numeric:true}));
  }
  function allRows() {
    const result=[];
    for(const [terr,a] of scan()){
      a.houses.forEach((h,i)=>result.push({...h,terr,provider:'houses',kind:'house',title:'家 '+(i+1)}));
      result.push(...Records.apartmentRows(a.local,shared.filter(b=>b.terr===terr),a.saved).map(r=>({...r,terr,provider:'apartments'})));
    }
    return result;
  }
  function cleanupPlan(terr) {
    if(!/^\d+$/.test(terr))throw Error('区域を確認してください。');
    const houseKey='terr-'+terr,aptKey=houseKey+'-apt',roomKey=houseKey+'-shared-records';
    const expected=Object.fromEntries([houseKey,aptKey,roomKey].map(k=>[k,localStorage.getItem(k)]));
    const houses=read(houseKey,[]),local=read(aptKey,[]),saved=read(roomKey,{});
    const counts=Object.fromEntries(disposable.map(s=>[s,0]));
    for(const r of [...houses,...Records.apartmentRows(local,[],saved)])if(disposable.includes(r.status))counts[r.status]++;
    const reset=r=>disposable.includes(r.status)?{...r,status:'',date:''}:r;
    const next={
      [houseKey]:houses.filter(h=>!disposable.includes(h.status)),
      [aptKey]:local.map(a=>({...a,rooms:a.rooms.map(reset)})),
      // Explicit empty room states prevent old local results reappearing after sharing.
      [roomKey]:Object.fromEntries(Object.entries(saved).map(([id,rooms])=>[id,rooms.map(reset)]))
    };
    const changes={};
    for(const [key,value] of Object.entries(next))if(expected[key]!==null && expected[key]!==JSON.stringify(value))changes[key]=JSON.stringify(value);
    return {terr,expected,changes,counts,total:Object.values(counts).reduce((n,v)=>n+v,0)};
  }
  function cleanup(plan) { App.storeBatch(plan.changes,plan.expected);Records.reload(); }
  function requestCleanup(terr) {
    try{
      const plan=cleanupPlan(terr);
      if(!plan.total){alert('整理する「会えた・投函・留守」の記録はありません。');return;}
      const detail='会えた '+plan.counts.met+'件・投函 '+plan.counts.posted+'件・留守 '+plan.counts.away+'件';
      if(!confirm('区域 '+terr+' の訪問記録を整理しますか？\n'+detail+'\n\n対象の戸建てピンとそのメモを削除し、部屋の状態・日付を消します。\n再訪問・訪問しない・建物と部屋番号・奉仕時間・使った地図は残ります。'))return;
      cleanup(plan);
      document.getElementById('cleanupStatus').textContent=plan.total+'件を整理しました。直後なら、記録画面を閉じて地図の「↩」で元に戻せます。';
    }catch(e){alert('整理できませんでした。'+e.message);}
  }
  function el(tag,cls,text) {const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
  function duration(min) {const h=Math.floor(min/60),m=Math.round(min%60);return (h?h+'時間':'')+m+'分';}
  function mapLink(terr) {return '?t='+encodeURIComponent(terr);}
  function recordLink(row) {return mapLink(row.terr)+'#'+new URLSearchParams({record:row.provider,item:String(row.id)});}
  function empty(host,message) {host.appendChild(el('p','home-empty',message));}
  function removeMaps(territories) {
    const targets=new Set(territories),history=read(HISTORY,[]),hidden=new Set(read(HIDDEN,[]));
    history.filter(x=>targets.has(x.terr)).forEach(x=>hidden.add(x.terr));
    const expected={[HISTORY]:localStorage.getItem(HISTORY),[HIDDEN]:localStorage.getItem(HIDDEN)};
    const changes={[HISTORY]:JSON.stringify(history.filter(x=>!targets.has(x.terr))),[HIDDEN]:JSON.stringify([...hidden])};
    App.storeBatch(changes,expected);
  }
  function requestRemoveMap(terr) {
    const entry=usedMaps().find(x=>x.terr===terr);if(!entry)return;
    if(!confirm('区域 '+terr+'「'+(known(terr)?territoryName(terr):entry.name)+'」を使った地図から消しますか？\n\n再訪問・訪問記録・奉仕時間は消えません。もう一度この地図を開くと、履歴に戻ります。'))return;
    try{removeMaps([terr]);render();}catch(e){alert('履歴を消せませんでした。端末の空き容量を確認してください。');}
  }
  function requestClearMaps() {
    const history=usedMaps();if(!history.length)return;
    if(!confirm('使った地図の履歴 '+history.length+'件をすべて消しますか？\n\n再訪問・訪問記録・奉仕時間は消えません。地図を開くと、その区域は再び履歴に追加されます。'))return;
    try{removeMaps(history.map(x=>x.terr));editingMaps=false;render();}catch(e){alert('履歴を消せませんでした。端末の空き容量を確認してください。');}
  }
  function renderMaps(rows,query) {
    const host=document.getElementById('homeMaps');host.replaceChildren();
    const history=usedMaps(),list=history.filter(x=>(x.terr+' '+(known(x.terr)?territoryName(x.terr):x.name)).toLocaleLowerCase().includes(query));
    document.getElementById('homeMapCount').textContent=history.length;
    document.getElementById('homeMapEdit').hidden=!history.length;
    document.getElementById('homeMapEdit').textContent=editingMaps?'編集を終了':'履歴を編集';
    document.getElementById('homeMapClear').hidden=!editingMaps || !history.length;
    if(!list.length){empty(host,history.length?'該当する地図はありません。':'まだ使用履歴はありません。「区域を探す」から地図を開くと、ここに残ります。');return;}
    for(const entry of list){
      const available=known(entry.terr),row=el('div','home-map-row'),link=el(available?'a':'div','home-map');if(available)link.href=mapLink(entry.terr);
      link.appendChild(el('span','home-map-number',entry.terr));
      const text=el('span','home-map-text');text.appendChild(el('strong','',available?territoryName(entry.terr):entry.name));
      const date=entry.lastOpened===null?'以前の記録から追加':'最終表示 '+Records.displayDate(Records.localDay(entry.lastOpened));
      text.appendChild(el('small','',available?date:date+' · 地図は現在未登録'));
      link.appendChild(text);
      const count=rows.filter(r=>r.terr===entry.terr && r.status==='revisit').length;
      if(count)link.appendChild(el('span','home-revisit-count','再訪問 '+count));
      if(available)link.appendChild(el('span','home-arrow','›'));
      row.appendChild(link);
      if(editingMaps){const remove=el('button','home-map-remove','削除');remove.type='button';remove.setAttribute('aria-label','区域 '+entry.terr+' の使用履歴を削除');remove.onclick=()=>requestRemoveMap(entry.terr);row.appendChild(remove);}
      host.appendChild(row);
    }
  }
  function renderRevisits(rows,query) {
    const host=document.getElementById('homeRevisits');host.replaceChildren();
    const list=rows.filter(r=>r.status==='revisit').sort((a,b)=>(Records.dayKey(b.date)||'').localeCompare(Records.dayKey(a.date)||''));
    document.getElementById('homeRevisitCount').textContent=list.length;
    const filtered=list.filter(r=>(r.terr+' '+territoryName(r.terr)+' '+r.title+' '+(r.memo||'')).toLocaleLowerCase().includes(query));
    if(!filtered.length){empty(host,list.length?'該当する再訪問はありません。':'地図で「再訪問」にした家や部屋が、区域をまたいでここに集まります。');return;}
    for(const row of filtered){
      const available=known(row.terr),link=el(available?'a':'div','home-revisit');if(available)link.href=recordLink(row);
      const text=el('span','home-map-text');text.appendChild(el('small','home-area-label','区域 '+row.terr+' · '+territoryName(row.terr)));
      text.appendChild(el('strong','',row.title));if(row.memo)text.appendChild(el('span','home-memo',row.memo));
      let note=Records.displayDate(row.date);if(!available)note+=' · 地図は現在未登録';else if(row.available===false)note+=' · 地図で建物情報を確認';
      text.appendChild(el('small','',note));link.appendChild(text);if(available)link.appendChild(el('span','home-arrow','›'));host.appendChild(link);
    }
  }
  function renderService() {
    const log=safeRead('svc-log',[]),month=document.getElementById('homeMonth').value||Records.localDay().slice(0,7);
    const monthly=log.filter(x=>x.date.slice(0,7)===month).sort((a,b)=>b.start-a.start);
    const current=log.filter(x=>x.date.slice(0,7)===Records.localDay().slice(0,7));
    document.getElementById('homeMinutes').textContent=duration(current.reduce((sum,x)=>sum+x.min,0));
    document.getElementById('homeDays').textContent=new Set(current.map(x=>x.date)).size+'日';
    document.getElementById('homeMonthSummary').textContent=new Set(monthly.map(x=>x.date)).size+'日 · 合計 '+duration(monthly.reduce((sum,x)=>sum+x.min,0));
    const host=document.getElementById('homeService');host.replaceChildren();
    if(!monthly.length)empty(host,'この月の奉仕時間はまだありません。地図の「伝道スタート」から記録できます。');
    for(const x of monthly){
      const row=el('div','home-service-row');
      const text=el('span','home-map-text');text.appendChild(el('strong','',Records.displayDate(x.date)));
      const time=ms=>{const d=new Date(ms);return d.getHours()+':'+String(d.getMinutes()).padStart(2,'0');};
      text.appendChild(el('small','',time(x.start)+'〜'+time(x.end)+(x.terr?' · 区域 '+x.terr:'')));row.appendChild(text);row.appendChild(el('strong','',duration(x.min)));host.appendChild(row);
    }
    const active=safeRead('svc-active',null),resume=document.getElementById('homeActive');resume.hidden=!active;
    if(active){resume.href=mapLink(active.terr);resume.textContent='● 区域 '+active.terr+' で伝道中 · 地図に戻る →';}
  }
  function render() {
    if(document.getElementById('personalHome').hidden)return;
    const query=document.getElementById('homeSearch').value.trim().toLocaleLowerCase(),rows=allRows();
    renderMaps(rows,query);renderRevisits(rows,query);renderService();
  }
  function select(next) {
    panel=next;document.getElementById('homeSearch').value='';
    document.querySelectorAll('[data-home-panel]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.homePanel===panel)));
    for(const key of ['maps','revisits','service'])document.getElementById('homePanel-'+key).hidden=key!==panel;
    document.getElementById('homeSearchLabel').hidden=panel==='service';
    document.getElementById('homeSearch').placeholder=panel==='maps'?'区域番号・地名で探す':'区域番号・メモ・部屋番号で探す';
    render();
  }
  function mount() {
    document.body.classList.add('home-view');document.title='わたしの記録 | 桔梗が丘 電子区域地図';
    document.querySelector('header .no').textContent='ホーム';document.querySelector('header .name').textContent='わたしの記録';
    document.getElementById('count').hidden=true;document.getElementById('btnHome').hidden=true;
    document.getElementById('personalHome').hidden=false;
    document.getElementById('homeBackupTools').appendChild(document.querySelector('.backup-tools'));
    document.getElementById('homeSync').appendChild(document.querySelector('.sync-panel'));
    document.getElementById('homeMonth').value=Records.localDay().slice(0,7);
    document.getElementById('homeMonth').onchange=renderService;
    document.getElementById('homeSearch').oninput=render;
    document.getElementById('homeMapEdit').onclick=()=>{editingMaps=!editingMaps;render();};
    document.getElementById('homeMapClear').onclick=requestClearMaps;
    document.querySelectorAll('[data-home-panel]').forEach(b=>b.onclick=()=>select(b.dataset.homePanel));
    document.getElementById('homeRevisitShortcut').onclick=()=>select('revisits');
    document.getElementById('homeServiceShortcut').onclick=()=>select('service');
    select('maps');
    App.feed('apartments','共有の建物・部屋番号',Records.sharedURL,Records.decodeBuildings,data=>{shared=data;render();});
    window.addEventListener('storage',()=>{try{remember();}catch(e){App.notice('地図の履歴を更新できませんでした。元の履歴は保持しています。');}render();});
  }
  function start() {
    const t=new URLSearchParams(location.search).get('t');
    try{remember(window.__LMAP && t && known(t)?t:null);}catch(e){App.notice('地図の履歴を保存できませんでした。元の履歴は保持しています。');}
    render();
  }
  return {mount,start,remember,usedMaps,removeMaps,allRows,cleanupPlan,cleanup,requestCleanup,recordLink};
})();
