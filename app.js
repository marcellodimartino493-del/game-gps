(() => {
'use strict';
const $ = id => document.getElementById(id);
const styles = {
  gta: 'https://tiles.openfreemap.org/styles/dark',
  minecraft: 'https://tiles.openfreemap.org/styles/bright',
  fortnite: 'https://tiles.openfreemap.org/styles/liberty'
};
const themeAccents = { gta: '#4ce7dd', minecraft: '#96f26c', fortnite: '#e5a7ff' };
const serviceProfiles = {car:'routed-car',bike:'routed-bike',foot:'routed-foot'};
const transportNames = {car:'Auto',bike:'Rad',foot:'Fußweg'};
const fmtDistance = n => n >= 1000 ? (n/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km' : Math.round(n)+' m';
const shortLabel = s => (s || '').split(',').slice(0,2).join(',').trim();
const safeCoord = p => p && Number.isFinite(p.lng) && Number.isFinite(p.lat) && Math.abs(p.lng)<=180 && Math.abs(p.lat)<=90;
const emptyGeo = () => ({type:'FeatureCollection',features:[]});
const shape = coords => ({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
function notice(s,error=false){$('notice').textContent=s;$('notice').classList.toggle('error',error);}
function errorBox(s){$('appError').textContent=s;$('appError').hidden=false;notice(s,true);}
if(typeof maplibregl === 'undefined') {errorBox('Die Kartenbibliothek konnte nicht geladen werden. Prüfe die Internetverbindung.');return;}

let skin = 'gta', transport = 'car', selection = null, is3d=false, following=false;
let start=null, end=null, gps=null, startMarker=null, endMarker=null, gpsMarker=null;
let activeRoute=null, choices=[], choiceIndex=0, stepData=[], pending=false, gpsWatch=null, navIndex=1;
let recent=[], routeGeo=null, lastSearch=0, lastRoute=0, searchQueue=Promise.resolve(), routeQueue=Promise.resolve();
let map, radarMap;
try {recent = JSON.parse(localStorage.getItem('gamegps-recent') || '[]');if(!Array.isArray(recent))recent=[];} catch {recent=[];}
try {const stored=localStorage.getItem('gamegps-skin');if(styles[stored])skin=stored;}catch{}
document.body.dataset.theme=skin;
try {
 map=new maplibregl.Map({container:'map',style:styles[skin],center:[8.6821,50.1109],zoom:13.4,pitch:0,bearing:0,attributionControl:false,canvasContextAttributes:{antialias:true}});
 map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
 radarMap=new maplibregl.Map({container:'radarMap',style:styles[skin],center:[8.6821,50.1109],zoom:10.2,interactive:false,attributionControl:false,fadeDuration:0});
} catch(e){errorBox('Die Karte konnte nicht gestartet werden. Eventuell unterstützt der Browser kein WebGL.');return;}
map.on('style.load',() => {putRouteLayers();if(is3d)putBuildings();});
map.on('load',() => {putRouteLayers();updateLayerData();if(is3d)putBuildings();});
radarMap.on('style.load',() => putRadarRoute());
radarMap.on('load',() => {putRadarRoute();updateLayerData();});
map.on('error',e => {if(e.error && !document.querySelector('#appError:not([hidden])')) notice('Kartendaten konnten teilweise nicht geladen werden. Internetverbindung prüfen.',true);});
radarMap.on('error',()=>{});
map.on('moveend',updateRadar);
map.on('rotate',()=>{$('compassNeedle').style.transform=`rotate(${-map.getBearing()}deg)`;});
function updateRadar(){if(!radarMap.loaded())return;radarMap.jumpTo({center:map.getCenter(),zoom:Math.max(6,map.getZoom()-3),bearing:0,pitch:0});}
function pointObj(coord,label){return {point:{lng:coord.lng,lat:coord.lat},label};}
function marker(type,coord){const div=document.createElement('div');div.className='gg-marker';const inside=document.createElement('div');inside.className='gg-marker-'+type;div.appendChild(inside);return new maplibregl.Marker({element:div,anchor:'center'}).setLngLat([coord.lng,coord.lat]).addTo(map);}
function removeMarker(m){if(m)m.remove();}
function putPoint(type,coord,label){if(!safeCoord(coord))return;
 if(type==='start'){start=pointObj(coord,label);removeMarker(startMarker);startMarker=marker('origin',coord);$('from').value=label;}
 else{end=pointObj(coord,label);removeMarker(endMarker);endMarker=marker('dest',coord);$('to').value=label;}
 clearRoute();
}
function clearRoute(){activeRoute=null;choices=[];stepData=[];choiceIndex=0;following=false;routeGeo=null;
 $('result').hidden=true;$('navHud').hidden=true;$('startNav').classList.remove('active');$('startNavLabel').textContent='▶ GPS-FOLGEMODUS';$('steps').hidden=true;$('stepsToggle').setAttribute('aria-expanded','false');$('stepsChevron').textContent='＋';
 updateLayerData();
}
function chooseOnMap(type){selection=type;$('tapKind').textContent=type==='start'?'den Startpunkt':'das Ziel';$('mapTip').hidden=false;notice('Tippe auf den gewünschten Punkt auf der Karte.');}
$('pickStart').onclick=()=>chooseOnMap('start');
$('pickDest').onclick=()=>chooseOnMap('end');
$('cancelPick').onclick=()=>{selection=null;$('mapTip').hidden=true;};
map.on('click',e=>{
 const chosen=selection || 'end';putPoint(chosen,e.lngLat,chosen==='start'?'Startpunkt auf der Karte':'Zielpunkt auf der Karte');
 selection=null;$('mapTip').hidden=true;notice(chosen==='start'?'Start gesetzt. Jetzt ein Ziel wählen.':'Ziel gesetzt. Klicke auf „Route finden“.');
});
document.addEventListener('keydown',e=>{if(e.key==='Escape' && selection){selection=null;$('mapTip').hidden=true;}});
$('from').addEventListener('input',()=>{start=null;removeMarker(startMarker);startMarker=null;clearRoute();});
$('to').addEventListener('input',()=>{end=null;removeMarker(endMarker);endMarker=null;clearRoute();});

function updateGPS(position){
 const {latitude,longitude,speed,heading}=position.coords;
 const p={lng:longitude,lat:latitude};if(!safeCoord(p))return;
 gps=p;if(!gpsMarker)gpsMarker=marker('user',p);else gpsMarker.setLngLat([p.lng,p.lat]);
 const kph=typeof speed==='number'&&speed>=0?Math.round(speed*3.6):null;
 $('speedMetric').textContent=kph===null?'GPS AKTIV':`${kph} KM/H`;
 $('signalText').textContent='GPS CONNECTED';
 $('radarZone').textContent=`${latitude.toFixed(2)}° N`;
 if(following){map.easeTo({center:[p.lng,p.lat],zoom:Math.max(map.getZoom(),15.5),bearing:typeof heading==='number'&&heading>=0?heading:map.getBearing(),duration:650});refreshHUD();}
}
function getGPS(){return new Promise((resolve,reject)=>{
 if(!navigator.geolocation){reject(new Error('Dein Browser bietet keinen GPS-Zugriff.'));return;}
 if(!window.isSecureContext){reject(new Error('GPS benötigt HTTPS oder localhost. Bitte die Web-App über einen sicheren Link öffnen.'));return;}
 navigator.geolocation.getCurrentPosition(pos=>{
  updateGPS(pos);
  if(gpsWatch===null){gpsWatch=navigator.geolocation.watchPosition(updateGPS,()=>{}, {enableHighAccuracy:true,timeout:18000,maximumAge:5000});}
  resolve(gps);
 },err=>reject(new Error(err.code===1?'Standortfreigabe abgelehnt. Du kannst den Startpunkt auch per Adresse festlegen.':'GPS gerade nicht erreichbar. Bitte versuche es erneut.')),
 {enableHighAccuracy:true,timeout:17000,maximumAge:3000});
});}
$('locate').onclick=async()=>{notice('GPS-Position wird ermittelt …');try{const p=await getGPS();map.flyTo({center:[p.lng,p.lat],zoom:16});notice('GPS-Standort gefunden.');}catch(e){notice(e.message,true);}};
$('zoomIn').onclick=()=>map.zoomIn();$('zoomOut').onclick=()=>map.zoomOut();
$('resetNorth').onclick=()=>map.easeTo({bearing:0,pitch:is3d?55:0});
$('fitRoute').onclick=()=>{if(activeRoute)fitRoute();else if(end)map.flyTo({center:[end.point.lng,end.point.lat],zoom:15});else if(gps)map.flyTo({center:[gps.lng,gps.lat],zoom:15});else notice('Noch keine Route oder GPS-Position vorhanden.');};
$('tilt').onclick=()=>{is3d=!is3d;$('tilt').setAttribute('aria-pressed',String(is3d));map.easeTo({pitch:is3d?55:0,duration:700});if(is3d)putBuildings();};
function putBuildings(){if(!is3d||!map.isStyleLoaded()||map.getLayer('ggps-buildings'))return;
 try{
  if(!map.getSource('ggps-building-source'))map.addSource('ggps-building-source',{type:'vector',url:'https://tiles.openfreemap.org/planet'});
  const firstSymbol=(map.getStyle().layers||[]).find(l=>l.type==='symbol')?.id;
  map.addLayer({id:'ggps-buildings',type:'fill-extrusion',source:'ggps-building-source','source-layer':'building',minzoom:14.5,filter:['!=',['get','hide_3d'],true],paint:{'fill-extrusion-color':skin==='gta'?'#477485':skin==='minecraft'?'#729d56':'#c088e7','fill-extrusion-opacity':.67,'fill-extrusion-height':['interpolate',['linear'],['zoom'],14.5,0,16,['coalesce',['to-number',['get','render_height']],['to-number',['get','height']],0]],'fill-extrusion-base':0}},firstSymbol);
 }catch(e){console.warn('3D building rendering not available:',e);}
}
function pace(which,func){
 const isSearch=which==='search',queue=isSearch?searchQueue:routeQueue;
 const task=queue.then(async()=>{
   const last=isSearch?lastSearch:lastRoute;
   const delay=Math.max(0,1200-(Date.now()-last));
   if(delay)await new Promise(r=>setTimeout(r,delay));
   if(isSearch)lastSearch=Date.now();else lastRoute=Date.now();
   return func();
 });
 if(isSearch)searchQueue=task.catch(()=>{});else routeQueue=task.catch(()=>{});
 return task;
}
async function geocode(q){
 const match=q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
 if(match){const p={lat:Number(match[1]),lng:Number(match[2])};if(safeCoord(p))return pointObj(p,q);}
 const results=await pace('search',async()=>{
  const res=await fetch('https://nominatim.openstreetmap.org/search?'+new URLSearchParams({q,format:'jsonv2',limit:'1',accept_language:'de'}),{headers:{Accept:'application/json'}});
  if(!res.ok)throw new Error('Die Adresssuche ist momentan nicht erreichbar.');return res.json();
 });
 if(!Array.isArray(results)||!results.length)throw new Error('Kein Ort gefunden: '+q);
 const p={lat:Number(results[0].lat),lng:Number(results[0].lon)};
 if(!safeCoord(p))throw new Error('Ungültige Koordinaten erhalten.');
 return pointObj(p,shortLabel(results[0].display_name));
}
async function resolveStart(){
 const q=$('from').value.trim();if(start && start.label===q)return start;
 if(!q||/^mein standort$/i.test(q)){
  notice('Benötige GPS für den Start …');const p=gps||await getGPS();putPoint('start',p,'Mein Standort');return start;
 }
 notice('Suche Startadresse …');const found=await geocode(q);putPoint('start',found.point,found.label);return start;
}
async function resolveEnd(){
 const q=$('to').value.trim();if(end && end.label===q)return end;
 if(!q)throw new Error('Bitte zuerst einen Zielort eingeben oder auf der Karte auswählen.');
 notice('Suche Zieladresse …');const found=await geocode(q);putPoint('end',found.point,found.label);return end;
}
function putRouteLayers(){if(!map.isStyleLoaded()||map.getSource('ggps-route'))return;
 map.addSource('ggps-route',{type:'geojson',data:routeGeo||emptyGeo()});
 map.addLayer({id:'ggps-route-shadow',type:'line',source:'ggps-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#061015','line-width':14,'line-opacity':.85}});
 map.addLayer({id:'ggps-route-halo',type:'line',source:'ggps-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':themeAccents[skin],'line-width':9,'line-opacity':.24}});
 map.addLayer({id:'ggps-route-color',type:'line',source:'ggps-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':themeAccents[skin],'line-width':5,'line-opacity':1}});
}
function putRadarRoute(){if(!radarMap.isStyleLoaded()||radarMap.getSource('ggps-mini-route'))return;
 radarMap.addSource('ggps-mini-route',{type:'geojson',data:routeGeo||emptyGeo()});
 radarMap.addLayer({id:'ggps-mini-line',source:'ggps-mini-route',type:'line',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':themeAccents[skin],'line-width':3}});
}
function updateLayerData(){const geo=routeGeo||emptyGeo();if(map?.getSource('ggps-route'))map.getSource('ggps-route').setData(geo);if(radarMap?.getSource('ggps-mini-route'))radarMap.getSource('ggps-mini-route').setData(geo);}
function fitRoute(){const co=activeRoute?.geometry?.coordinates;if(!co?.length)return;
 const bounds=co.reduce((b,p)=>b.extend(p),new maplibregl.LngLatBounds(co[0],co[0]));
 const mobile=innerWidth<750;
 const padding=mobile?{top:Math.round(Math.min(innerHeight*.48,350)),bottom:175,left:22,right:20}:{top:105,bottom:150,left:445,right:80};
 map.fitBounds(bounds,{padding,maxZoom:16.2,duration:900});
}
function setRoute(index){choiceIndex=index;activeRoute=choices[index];routeGeo=shape(activeRoute.geometry.coordinates);stepData=activeRoute.legs.flatMap(leg=>leg.steps||[]);navIndex=1;updateLayerData();fitRoute();renderResult();refreshHUD();}
async function calculateRoute(){if(pending)return;pending=true;$('calculate').disabled=true;$('calcLabel').textContent='ROUTE WIRD GESUCHT…';
 try{
  const a=await resolveStart(),b=await resolveEnd();
  if(new maplibregl.LngLat(a.point.lng,a.point.lat).distanceTo([b.point.lng,b.point.lat])<12)throw new Error('Start und Ziel sind fast identisch.');
  notice(`${transportNames[transport]}-Route wird berechnet …`);
  const url=`https://routing.openstreetmap.de/${serviceProfiles[transport]}/route/v1/driving/${a.point.lng},${a.point.lat};${b.point.lng},${b.point.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  const data=await pace('route',async()=>{const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Der Routenserver ist momentan nicht erreichbar.');return r.json();});
  if(data.code!=='Ok'||!Array.isArray(data.routes)||!data.routes.length)throw new Error('Für diese Verbindung wurde keine Route gefunden.');
  choices=data.routes.filter(r=>r?.geometry?.coordinates?.length && Array.isArray(r.legs));
  if(!choices.length)throw new Error('Unvollständige Routeninformationen erhalten.');
  setRoute(0);addRecent(end);notice('Route bereit – Design, 3D und Minimap lassen sich umschalten.');
  $('signalText').textContent='ROUTE READY';
 }catch(e){notice(e.message||'Route konnte nicht berechnet werden.',true);}
 finally{pending=false;$('calculate').disabled=false;$('calcLabel').textContent='ROUTE FINDEN';}
}
$('calculate').onclick=calculateRoute;
for(const id of ['from','to'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();calculateRoute();}});
function renderResult(){
 if(!activeRoute)return;
 $('result').hidden=false;$('routeTitle').textContent=end?.label || 'Markiertes Ziel';
 $('timeMetric').textContent=Math.max(1,Math.round(activeRoute.duration/60)).toLocaleString('de-DE');
 $('distanceMetric').textContent=(activeRoute.distance/1000).toLocaleString('de-DE',{maximumFractionDigits:1});
 $('arrivalMetric').textContent=new Date(Date.now()+activeRoute.duration*1000).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
 $('stepCount').textContent=`(${stepData.length})`;
 $('alternatives').replaceChildren();$('alternatives').hidden=choices.length<2;
 choices.forEach((r,i)=>{const btn=document.createElement('button');btn.className='alt-btn'+(i===choiceIndex?' active':'');btn.type='button';btn.textContent=`Route ${i+1} · ${Math.round(r.duration/60)} Min.`;btn.setAttribute('aria-pressed',String(i===choiceIndex));btn.onclick=()=>{setRoute(i);notice('Alternative Route ausgewählt.');};$('alternatives').appendChild(btn);});
 $('steps').replaceChildren();for(const [i,s] of stepData.entries()){
  const el=document.createElement('div');el.className='step';el.dataset.step=String(i);
  const symbol=document.createElement('span');symbol.className='step-symbol';symbol.textContent=turnArrow(s);
  const msg=document.createElement('span');msg.className='step-message';msg.textContent=instruction(s);
  const dist=document.createElement('small');dist.textContent=s.maneuver?.type==='arrive'?'Ankunft':fmtDistance(s.distance||0);msg.appendChild(dist);el.append(symbol,msg);$('steps').appendChild(el);
 }
}
function instruction(s){const m=s.maneuver||{},road=s.name?.trim(),on=road?' auf '+road:'';
 const moves={left:'links',right:'rechts',straight:'geradeaus','slight left':'leicht links','slight right':'leicht rechts','sharp left':'scharf links','sharp right':'scharf rechts',uturn:'wenden'};
 const dir=moves[m.modifier]||'';
 switch(m.type){
  case 'depart':return 'Starten'+on;
  case 'arrive':return 'Du hast das Ziel erreicht';
  case 'turn':return (dir?dir[0].toUpperCase()+dir.slice(1):'Hier')+' abbiegen'+on;
  case 'continue':return 'Weiter '+(dir||'geradeaus')+on;
  case 'new name':return 'Weiterfahren'+on;
  case 'merge':return 'Einfädeln'+on;
  case 'on ramp':return 'Auffahrt nehmen'+on;
  case 'off ramp':return 'Abfahrt nehmen'+on;
  case 'fork':return 'An der Gabelung '+dir+' halten'+on;
  case 'end of road':return 'Am Straßenende '+dir+' abbiegen'+on;
  case 'roundabout':case 'rotary':return 'Im Kreisverkehr Ausfahrt '+(m.exit||'')+' nehmen'+on;
  default:return 'Weiterfahren'+on;
 }
}
function turnArrow(s){const m=s.maneuver||{},dir=m.modifier||'';
 if(m.type==='arrive')return '⚑';if(m.type==='roundabout'||m.type==='rotary')return '⟳';
 if(dir.includes('left'))return '↰';if(dir.includes('right'))return '↱';if(dir==='uturn')return '↶';return '↑';
}
$('stepsToggle').onclick=()=>{const show=$('steps').hidden;$('steps').hidden=!show;$('stepsToggle').setAttribute('aria-expanded',String(show));$('stepsChevron').textContent=show?'−':'＋';};
function refreshHUD(){if(!activeRoute||!following||!gps||!stepData.length)return;
 let nearest=0,nearestMeters=Infinity;
 stepData.forEach((s,i)=>{const c=s.maneuver?.location;if(!c)return;const d=new maplibregl.LngLat(gps.lng,gps.lat).distanceTo([c[0],c[1]]);if(d<nearestMeters){nearest=i;nearestMeters=d;}});
 navIndex=Math.min(stepData.length-1,Math.max(navIndex,nearest+1));
 const target=stepData[navIndex];const co=target.maneuver?.location;
 const delta=co?new maplibregl.LngLat(gps.lng,gps.lat).distanceTo([co[0],co[1]]):0;
 $('hudArrow').textContent=turnArrow(target);$('hudInstruction').textContent=instruction(target);
 $('hudDistance').textContent=`Nächster Hinweis: ca. ${fmtDistance(delta)} Luftlinie`;
 Array.from($('steps').children).forEach((el,i)=>el.classList.toggle('active',i===navIndex));
}
async function toggleFollow(){if(!activeRoute)return;
 if(following){stopFollow();notice('GPS-Folgemodus beendet.');return;}
 try{notice('Verbinde GPS …');const p=await getGPS();following=true;$('navHud').hidden=false;$('startNav').classList.add('active');$('startNavLabel').textContent='■ FOLGEN BEENDEN';
  if(innerWidth<751)setPanel(false);
  map.easeTo({center:[p.lng,p.lat],zoom:16,pitch:is3d?55:0,duration:800});
  refreshHUD();notice('GPS-Folgemodus aktiv. Hinweise sind nur eine Vorschau, keine vollwertige Navigation.');
 }catch(e){notice(e.message,true);}
}
function stopFollow(){following=false;$('navHud').hidden=true;$('startNav').classList.remove('active');$('startNavLabel').textContent='▶ GPS-FOLGEMODUS';}
$('startNav').onclick=toggleFollow;$('endNav').onclick=()=>{stopFollow();setPanel(true);};
$('clearRoute').onclick=()=>{clearRoute();notice('Route entfernt. Start und Ziel bleiben markiert.');};
function setPanel(open){$('panel').classList.toggle('panel-closed',!open);$('togglePanel').setAttribute('aria-expanded',String(open));$('togglePanel').textContent=open?'☰':'▤';}
$('togglePanel').onclick=()=>setPanel($('panel').classList.contains('panel-closed'));
$('toggleRadar').onclick=()=>{const hide=$('radar').classList.toggle('collapsed');$('toggleRadar').textContent=hide?'＋':'−';if(!hide)setTimeout(()=>radarMap.resize(),250);};
function addRecent(p){if(!p||p.label==='Mein Standort')return;
 recent=[p,...recent.filter(x=>x.label!==p.label)].slice(0,5);
 try{localStorage.setItem('gamegps-recent',JSON.stringify(recent));}catch{}
 renderRecent();
}
function renderRecent(){
 $('recentList').replaceChildren();$('recentSection').hidden=recent.length===0;
 recent.forEach(p=>{if(!safeCoord(p.point))return;
  const b=document.createElement('button');b.type='button';b.className='recent-chip';b.textContent='⌁ '+p.label;
  b.title=p.label;b.onclick=()=>{putPoint('end',p.point,p.label);map.flyTo({center:[p.point.lng,p.point.lat],zoom:14});notice('Ziel geladen. Route finden drücken.');};$('recentList').appendChild(b);
 });
}
renderRecent();
for(const btn of document.querySelectorAll('[data-transport]'))btn.onclick=()=>{
 const next=btn.dataset.transport;if(transport===next)return;transport=next;
 document.querySelectorAll('[data-transport]').forEach(el=>{const on=el===btn;el.classList.toggle('active',on);el.setAttribute('aria-pressed',String(on));});
 if(activeRoute){clearRoute();notice('Verkehrsmittel geändert. Route bitte neu berechnen.');}
};
function applySkin(name){if(!styles[name])return;skin=name;document.body.dataset.theme=name;
 document.querySelectorAll('[data-skin]').forEach(btn=>{const on=btn.dataset.skin===name;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));});
 $('signalDot').style.background=themeAccents[name];
 try{localStorage.setItem('gamegps-skin',name);}catch{}
 if(map.getStyle() && (name !== map.__ggpsCurrentStyle)){map.__ggpsCurrentStyle=name;map.setStyle(styles[name]);}
 if(radarMap.getStyle() && (name !== radarMap.__ggpsCurrentStyle)){radarMap.__ggpsCurrentStyle=name;radarMap.setStyle(styles[name]);}
 $('radarZone').textContent=gps?`${gps.lat.toFixed(2)}° N`:'FRANKFURT';
}
// Local helper with no dependency on a framework.
for(const b of document.querySelectorAll('[data-skin]'))b.onclick=()=>{applySkin(b.dataset.skin);notice('Map Style auf '+b.textContent.trim()+' gewechselt.');};
// Map and radar were created with the stored skin already: avoid reloading identical styles.
map.__ggpsCurrentStyle=skin;radarMap.__ggpsCurrentStyle=skin;
document.querySelectorAll('[data-skin]').forEach(b=>{const yes=b.dataset.skin===skin;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});
const styleOrd=['minecraft','gta','fortnite'];
function reflectStyleIndex(){const node=document.querySelector('.dock-label small');if(node)node.textContent=String(styleOrd.indexOf(skin)+1).padStart(2,'0')+' / 03';}
reflectStyleIndex();
// Patch the skin event to update the style indicator as well.
document.querySelectorAll('[data-skin]').forEach(b=>b.addEventListener('click',reflectStyleIndex));
$('shareRoute').onclick=async()=>{
 if(!start||!end){notice('Bitte zuerst eine Route berechnen.',true);return;}
 const uri=new URL(window.location.href);uri.search='';uri.searchParams.set('a',`${start.point.lat.toFixed(6)},${start.point.lng.toFixed(6)}`);uri.searchParams.set('b',`${end.point.lat.toFixed(6)},${end.point.lng.toFixed(6)}`);uri.searchParams.set('from',start.label);uri.searchParams.set('to',end.label);uri.searchParams.set('skin',skin);uri.searchParams.set('mode',transport);
 try{await navigator.clipboard.writeText(uri.toString());notice('Routenlink in die Zwischenablage kopiert.');}
 catch{window.prompt('Diesen Routenlink kopieren:',uri.toString());}
};
function readCoordinate(s){const m=s?.split(',').map(Number);if(!m||m.length!==2)return null;const p={lat:m[0],lng:m[1]};return safeCoord(p)?p:null;}
const urlArgs=new URLSearchParams(location.search);
const uSkin=urlArgs.get('skin'),uMode=urlArgs.get('mode');
if(styles[uSkin] && skin!==uSkin){applySkin(uSkin);reflectStyleIndex();}
if(serviceProfiles[uMode] && transport!==uMode){transport=uMode;document.querySelectorAll('[data-transport]').forEach(b=>{const on=b.dataset.transport===uMode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});}
const linkedA=readCoordinate(urlArgs.get('a')),linkedB=readCoordinate(urlArgs.get('b'));
if(linkedA&&linkedB){
 putPoint('start',linkedA,urlArgs.get('from')||'Geteilter Start');putPoint('end',linkedB,urlArgs.get('to')||'Geteiltes Ziel');
 map.once('load',()=>{calculateRoute();});
}
window.addEventListener('resize',()=>{map.resize();radarMap.resize();});
})();
