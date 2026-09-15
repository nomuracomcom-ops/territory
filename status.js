// No assumed availability when a shared status could not be verified.
window.TERR_STATUS = {};
window.TERR_STATUS_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSMy3oCdp3soYGtLFCECaGpJ4Q8ODCMOD6qL5x1FYzWxUFjqc_jhYahmkjEIkPdklF9yjMby8QCzBqi/pub?gid=852025746&single=true&output=csv';
App.feed('status','区域の貸出状況',window.TERR_STATUS_CSV,rows=>{
  if(!rows.length || rows[0].length<2 || !/区域|territory|number|^t$|番号/i.test(rows[0][0]))throw Error('区域状況の見出しを確認してください');
  const result={};
  rows.slice(1).forEach(c=>{const n=c[0].trim(),s=(c[1]||'').trim();if(!/^\d+$/.test(n) || !['空き','使用中','貸出中'].includes(s))throw Error('区域状況の形式が不正です');result[n]=s==='使用中'?'貸出中':s;});
  return result;
},data=>{window.TERR_STATUS=data;if(typeof window.refreshOverviewStatus==='function')window.refreshOverviewStatus();});
