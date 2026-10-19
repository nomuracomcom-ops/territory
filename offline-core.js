/* Shared tile planning; coordinates are [latitude, longitude]. */
(function(root){
 const tileOrigin='https://cyberjapandata.gsi.go.jp/xyz/std/';
 function plan(boundary){
  if(!Array.isArray(boundary)||boundary.length<3||boundary.length>5000||boundary.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||p[0]<20||p[0]>46||p[1]<122||p[1]>154))throw Error('区域の境界を確認できません。');
  const lat=boundary.map(p=>p[0]),lng=boundary.map(p=>p[1]);
  const bounds=[Math.min(...lat)-.0008,Math.min(...lng)-.001,Math.max(...lat)+.0008,Math.max(...lng)+.001];
  function tiles(maxZoom){const urls=[];for(let z=13;z<=maxZoom;z++){
   const n=2**z,x=l=>Math.floor((l+180)/360*n),y=l=>Math.floor((1-Math.asinh(Math.tan(l*Math.PI/180))/Math.PI)/2*n);
   const west=x(bounds[1]),east=x(bounds[3]),north=y(bounds[2]),south=y(bounds[0]);
   if((east-west+1)*(south-north+1)+urls.length>600)return null;
   for(let a=west;a<=east;a++)for(let b=north;b<=south;b++)urls.push(tileOrigin+z+'/'+a+'/'+b+'.png');
  }return urls;}
  for(let zoom=18;zoom>=13;zoom--){const urls=tiles(zoom);if(urls)return {bounds,minZoom:13,maxZoom:zoom,urls};}
  throw Error('区域が広すぎるため保存できません。');
 }
 root.OfflineCore={plan,tileOrigin};
})(typeof self!=='undefined'?self:globalThis);
