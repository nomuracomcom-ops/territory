/* Current visit record presentation. Persistent personal navigation lives in personal.js. */
window.Records = (() => {
  const states = {
    met: { label: '会えた', symbol: '●' }, revisit: { label: '再訪問', symbol: '↗' },
    posted: { label: '投函', symbol: '▣' }, away: { label: '留守', symbol: '○' },
    dnc: { label: '訪問しない', symbol: '−' }, '': { label: '未選択', symbol: '・' }
  };
  const activity = ['met', 'revisit', 'posted', 'away'];
  const providers = new Map();
  let selected = 'all';
  function localDay(value = new Date()) {
    const d = value instanceof Date ? value : new Date(value);
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  }
  function dayKey(value) {
    // Never guess a year for legacy M/D dates or a timezone for invalid dates.
    const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(String(value || ''));
    if (!match) return null;
    const y=Number(match[1]), m=Number(match[2]), d=Number(match[3]);
    const date=new Date(y,m-1,d);
    return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d ? localDay(date) : null;
  }
  function summarize(rows, day=localDay()) {
    const counts=Object.fromEntries(activity.map(s=>[s,0]));
    for (const row of rows) if (activity.includes(row.status) && dayKey(row.date)===day) counts[row.status]++;
    return {counts,total:Object.values(counts).reduce((n,x)=>n+x,0),undated:rows.filter(r=>r.status && !dayKey(r.date)).length};
  }
  function encouragement(summary) {
    if (!summary.total) return '一つずつ、自分のペースで。記録は次の訪問の助けになります。';
    if (summary.counts.away===summary.total) return '会えなかった訪問も、次につながる大切な記録です。';
    return '今日の一歩を残せました。一人一人を大切に、無理のないペースで。';
  }
  function apartmentRows(local, shared, saved) {
    // Merge by stable building ID and room number, including retained/offline records.
    const buildings=new Map();
    for (const a of local) buildings.set('local-'+a.id,{...a,identity:'local-'+a.id,roomMap:new Map(a.rooms.map(r=>[r.no,{...r}]))});
    for (const a of shared) {
      const previous=buildings.get(a.id);
      const roomMap=previous ? previous.roomMap : new Map();
      for (const r of a.rooms) if (!roomMap.has(r.no)) roomMap.set(r.no,{...r});
      buildings.set(a.id,{...a,identity:a.id,roomMap});
    }
    for (const [id, rooms] of Object.entries(saved)) {
      if (!buildings.has(id)) buildings.set(id,{id,identity:id,shared:true,name:'共有建物（情報未取得）',rooms:[],roomMap:new Map()});
      const a=buildings.get(id);
      for (const r of rooms) a.roomMap.set(r.no,{...r});
    }
    const result=[];
    for (const a of buildings.values()) for (const r of a.roomMap.values()) {
      if (!r.status) continue;
      const pendingShared=Object.prototype.hasOwnProperty.call(saved,a.identity) && !shared.some(x=>x.id===a.identity);
      const available=!pendingShared && a.rooms.some(x=>x.no===r.no);
      result.push({...r,id:a.identity+':'+r.no,buildingId:a.id,buildingShared:!!a.shared,
        kind:'room',title:(a.name||'アパート／マンション')+' · '+r.no+'号室',memo:'',lat:a.lat,lng:a.lng,available});
    }
    return result;
  }
  function register(name, read, open, reload) { providers.set(name,{read,open,reload}); }
  function reload() { for(const p of providers.values())if(p.reload)p.reload(); }
  function entries() { return [...providers.entries()].flatMap(([provider,p])=>p.read().map(r=>({...r,provider}))); }
  let linkedOpened=false;
  function openLinked() {
    if(linkedOpened)return;
    const target=new URLSearchParams((location.hash||'').replace(/^#/,'')),provider=target.get('record'),id=target.get('item');
    if(!provider || !id || !providers.has(provider))return;
    const row=entries().find(r=>r.provider===provider && String(r.id)===id);
    if(row && row.available!==false && App.coordinate(row.lat,row.lng)){
      linkedOpened=true;document.getElementById('sheet').style.display='none';providers.get(provider).open(row);
    }else{render('revisit');document.getElementById('sheet').style.display='flex';}
  }
  const sharedURL='https://docs.google.com/spreadsheets/d/e/2PACX-1vTFG_HRV9mGFPmgw66mr3qBNkfpctHi6PMcHGss8NAq7AbTWmE_mjr2LvytJKJ9cHaI2IWm8bcmnQPP/pub?gid=2125994133&single=true&output=csv';
  function decodeBuildings(rows) {
    if(!rows.length || rows[0].slice(0,6).join(',')!=='区域番号,建物ID,緯度,経度,建物名,部屋番号')throw Error('共有建物の見出しが不正です');
    const seen=new Set();
    return rows.slice(1).map(c=>{
      if(c.length!==6 || !/^\d+$/.test(c[0].trim()) || !/^[a-zA-Z0-9_-]+$/.test(c[1]) || ['__proto__','constructor','prototype'].includes(c[1]) || !c[2].trim() || !c[3].trim() || !App.coordinate(Number(c[2]),Number(c[3])))throw Error('建物情報の形式が不正です');
      const identity=c[0].trim()+':'+c[1];if(seen.has(identity))throw Error('建物IDが重複しています');seen.add(identity);
      return {terr:c[0].trim(),shared:true,id:c[1],lat:Number(c[2]),lng:Number(c[3]),name:c[4],rooms:[...new Set(c[5].split(/[,、\s]+/).filter(Boolean))].map(no=>({no,status:'',date:''}))};
    });
  }
  function matches(row, filter, day=localDay()) {
    return filter==='all' || (filter==='today' ? activity.includes(row.status) && dayKey(row.date)===day : row.status===filter);
  }
  function displayDate(value) {
    const key=dayKey(value);
    if (key) return key.replace(/-/g,'/');
    return value ? String(value)+'（年不明）' : '日付なし';
  }
  function controls() {
    const container=document.getElementById('recordFilters');
    if (!container || container.children.length) return;
    for (const [key,label] of [['all','すべて'],['today','今日'],['revisit','再訪問'],['away','留守'],['met','会えた'],['posted','投函'],['dnc','訪問しない']]) {
      const b=document.createElement('button');b.type='button';b.dataset.filter=key;b.dataset.label=label;
      b.onclick=()=>render(key);container.appendChild(b);
    }
    document.getElementById('recordSearch').oninput=()=>render();
  }
  function render(filter) {
    const host=document.getElementById('listBody');if (!host) return;
    if (filter) { selected=filter; document.getElementById('recordSearch').value=''; }
    controls();
    const rows=entries(), today=localDay(), summary=summarize(rows,today);
    const territory=new URLSearchParams(location.search).get('t')||'1';
    document.getElementById('recordsScope').textContent='区域 '+territory+' · この端末の家・部屋の記録';
    document.getElementById('todayVisits').textContent=summary.total;
    const stats=document.getElementById('visitStats');stats.replaceChildren();
    for (const key of activity) {
      const item=document.createElement('div');item.className='visit-stat status-'+key;
      const label=document.createElement('span');label.textContent=states[key].symbol+' '+states[key].label;
      const count=document.createElement('strong');count.textContent=summary.counts[key];item.appendChild(label);item.appendChild(count);stats.appendChild(item);
    }
    document.getElementById('visitEncouragement').textContent=encouragement(summary);
    const legacy=document.getElementById('legacyDateNote');legacy.hidden=!summary.undated;
    legacy.textContent='年・日付を確認できない記録が '+summary.undated+' 件あります。「すべて」に残し、今日の件数には含めていません。';
    const next=document.getElementById('recordNext');next.replaceChildren();
    const heading=document.createElement('p');heading.textContent='次につなげる · この区域の記録';next.appendChild(heading);
    for (const key of ['revisit','away']) {
      const n=rows.filter(r=>r.status===key).length;
      const b=document.createElement('button');b.type='button';b.className='next-'+key;b.textContent=states[key].label+' '+n+'件を見る →';b.onclick=()=>render(key);next.appendChild(b);
    }
    document.querySelectorAll('#recordFilters button').forEach(b=>{
      b.textContent=b.dataset.label+' '+rows.filter(r=>matches(r,b.dataset.filter,today)).length;
      b.setAttribute('aria-pressed',String(selected===b.dataset.filter));
    });
    const query=document.getElementById('recordSearch').value.trim().toLocaleLowerCase();
    const list=rows.filter(r=>matches(r,selected,today) && (r.title+' '+(r.memo||'')).toLocaleLowerCase().includes(query))
      .sort((a,b)=>(dayKey(b.date)||'').localeCompare(dayKey(a.date)||'') || String(b.id).localeCompare(String(a.id),undefined,{numeric:true}));
    document.getElementById('recordResultCount').textContent='表示 '+list.length+'件 / 保存された家・部屋 '+rows.length+'件';
    host.replaceChildren();
    if (!list.length) {
      const empty=document.createElement('div');empty.className='empty';
      empty.textContent=rows.length?'該当する記録はありません。「すべて」や検索条件を確認してください。':'まだ訪問記録はありません。地図のメニュー → ＋で家を追加し、訪問の状態を選べます。';
      host.appendChild(empty);return;
    }
    for (const row of list) {
      const state=states[row.status]||states[''];
      const item=document.createElement('button');item.type='button';item.className='visit-row';
      item.disabled=row.available===false || !App.coordinate(row.lat,row.lng);
      const text=document.createElement('span');text.className='visit-row-text';
      const title=document.createElement('strong');title.textContent=row.title;text.appendChild(title);
      if (row.memo) {const memo=document.createElement('span');memo.className='visit-row-memo';memo.textContent=row.memo;text.appendChild(memo);}
      const date=document.createElement('small');date.textContent=displayDate(row.date)+(item.disabled?' · 建物情報を確認してください':' · タップで地図へ');text.appendChild(date);
      const badge=document.createElement('span');badge.className='visit-status status-'+(row.status||'empty');badge.textContent=state.symbol+' '+state.label;
      item.appendChild(text);item.appendChild(badge);
      item.onclick=()=>{document.getElementById('sheet').style.display='none';providers.get(row.provider).open(row);};host.appendChild(item);
    }
  }
  return {localDay,dayKey,summarize,encouragement,apartmentRows,register,reload,entries,render,openLinked,sharedURL,decodeBuildings,displayDate};
})();
