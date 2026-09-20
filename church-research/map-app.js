const COLORS = { evangelical:"#7c2d12", catholic:"#1e3a5f", mainline:"#3f6212", orthodox:"#b45309", muslim:"#0f766e", jewish:"#6b21a8" };
const FAITH_LABEL = { evangelical:"Evangelical / Protestant", catholic:"Catholic", mainline:"Mainline Protestant", orthodox:"Orthodox", muslim:"Muslim", jewish:"Jewish" };
const WEEKLY_RATE = 0.26;
const MAX_MILES = 16;
function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./,""); } catch(e) { return ""; } }
function miles(aLat,aLng,bLat,bLng) {
  const R=3958.8, toR=Math.PI/180;
  const dLat=(bLat-aLat)*toR, dLng=(bLng-aLng)*toR;
  const s=Math.sin(dLat/2)**2 + Math.cos(aLat*toR)*Math.cos(bLat*toR)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1, Math.sqrt(s)));
}
function fmt(n) { if (n==null || Number.isNaN(n)) return "\u2014"; return Math.round(n).toLocaleString(); }
function money(n) { if (n==null) return "\u2014"; return n>=1000 ? "$"+Math.round(n/1000)+"k" : "$"+Math.round(n); }
function pct(n) { if (n==null || Number.isNaN(n)) return "\u2014"; return (n*100).toFixed(1)+"%"; }
function family(c) {
  const d = (c.denom || "").toLowerCase();
  if (d.includes("greek")) return "Greek Orthodox";
  if (d.includes("antioch")) return "Antiochian Orthodox";
  if (d.includes("serbian")) return "Serbian Orthodox";
  if (d.includes("rocor")) return "ROCOR";
  if (d.includes("coptic")) return "Coptic Orthodox";
  if (d.includes("romanian") || d === "oca" || d.includes("oca (")) return "OCA";
  if (d.includes("latin mass")) return "Catholic (Latin Mass)";
  if (d.includes("catholic")) return "Catholic";
  if (d.includes("southern baptist")) return "Southern Baptist";
  if (d.includes("lcms")) return "LCMS";
  if (d.includes("united methodist")) return "United Methodist";
  if (d.includes("christian church")) return "Christian Church";
  if (d.includes("pentecostal")) return "Pentecostal";
  if (d.includes("sunni") || d.includes("islam")) return "Sunni Islam";
  if (d.includes("reform")) return "Reform Judaism";
  if (d.includes("conservative judaism")) return "Conservative Judaism";
  if (d.includes("non-denominational") || d.includes("word of faith") || d.includes("nondenom")) return "Non-denominational";
  return c.denom || "Other";
}
function sizeBucket(n) {
  n = n || 0;
  if (n < 100) return "micro";
  if (n < 400) return "small";
  if (n < 1000) return "mid";
  if (n < 2500) return "large";
  return "mega";
}
function sizeLabel(b) {
  return { micro:"Micro under 100", small:"Small 100-399", mid:"Mid 400-999", large:"Large 1,000-2,499", mega:"Mega 2,500+" }[b] || b;
}
let CAMPUSES=[], ZIPS=[], map, zipLayer, markers=[], allocations={}, zipTotals={};
function visibleCampuses() {
  const faith = document.getElementById("filterFaith").value;
  const denom = document.getElementById("filterDenom").value;
  const size = document.getElementById("filterSize").value;
  return CAMPUSES.filter(c => {
    if (faith !== "all" && c.tradition !== faith) return false;
    if (denom !== "all" && family(c) !== denom) return false;
    if (size !== "all" && sizeBucket(c.weekly) !== size) return false;
    return true;
  });
}
function buildModel() {
  allocations={}; zipTotals={};
  ZIPS.forEach(z => { allocations[z.zip]={}; z.potential=z.pop*WEEKLY_RATE; });
  CAMPUSES.forEach(c => {
    const weights=[]; let sum=0;
    ZIPS.forEach(z => {
      const d=miles(c.lat,c.lng,z.lat,z.lng);
      if (d>MAX_MILES) return;
      const w=z.pop/Math.pow(d+1.6,2);
      weights.push({zip:z.zip,w}); sum+=w;
    });
    if (!sum) return;
    weights.forEach(({zip,w}) => { allocations[zip][c.id]=(allocations[zip][c.id]||0)+c.weekly*(w/sum); });
  });
  ZIPS.forEach(z => { zipTotals[z.zip]=Object.values(allocations[z.zip]).reduce((a,b)=>a+b,0); });
}
function orgWeekly(org) { return CAMPUSES.filter(c=>c.org===org).reduce((s,c)=>s+(c.weekly||0),0); }
function orgs(list) {
  const m={};
  (list||CAMPUSES).forEach(c => {
    if (!m[c.org]) m[c.org]={org:c.org,tradition:c.tradition,weekly:0,campuses:0,website:c.website};
    m[c.org].weekly += c.weekly||0; m[c.org].campuses += 1;
  });
  return Object.values(m).sort((a,b)=>b.weekly-a.weekly);
}
function shareColor(share) {
  if (share<=0) return "#f3efe7";
  const t=Math.min(1, share/0.22);
  return "rgb("+Math.round(243-t*140)+","+Math.round(239-t*170)+","+Math.round(231-t*180)+")";
}
function popupHtml(c) {
  return "<strong>"+c.org+"</strong><span>"+c.campus+" \u00b7 "+c.denom+"</span><br>Weekly: <b>"+fmt(c.weekly)+"</b> \u00b7 "+sizeLabel(sizeBucket(c.weekly))
    +(c.members?" \u00b7 Members: <b>"+fmt(c.members)+"</b>":"")
    +(c.households?" \u00b7 Households: <b>"+fmt(c.households)+"</b>":"")
    +"<br>Est. weekly giving: <b>"+money(c.giving_weekly)+"</b><br><span style='color:#78716c'>"+c.address+"</span>"
    +(c.website?"<br><a href='"+c.website+"' target='_blank' rel='noopener'>Website</a>":"")
    +(c.notes?"<br><em style='color:#78716c'>"+c.notes+"</em>":"");
}
function renderMarkers() {
  markers.forEach(m => map.removeLayer(m)); markers=[];
  visibleCampuses().forEach(c => {
    const size=Math.max(26, Math.min(48, 18+Math.sqrt(c.weekly||50)*0.55));
    const color=COLORS[c.tradition]||"#444";
    const icon=L.divIcon({ className:"", iconSize:[size,size], iconAnchor:[size/2,size/2],
      html:"<span class='pin' style='width:"+size+"px;height:"+size+"px;background-color:"+color+";background-image:url(https://www.google.com/s2/favicons?domain="+domainOf(c.website||"")+"&sz=64)'></span>" });
    const m=L.marker([c.lat,c.lng],{icon, riseOnHover:true}).addTo(map);
    m.bindPopup(popupHtml(c));
    m.on("click", () => showCampus(c));
    markers.push(m);
  });
}
function zipShare(zip, focusOrg, list) {
  const row=allocations[zip]||{};
  const pot=(ZIPS.find(z=>z.zip===zip)||{}).potential||1;
  const pool = list || visibleCampuses();
  if (!focusOrg || focusOrg==="all") {
    const ids = new Set(pool.map(c=>c.id));
    const sum = Object.entries(row).reduce((s,[id,n]) => ids.has(id)?s+n:s, 0);
    return sum/pot;
  }
  const people=pool.filter(c=>c.org===focusOrg).reduce((s,c)=>s+(row[c.id]||0),0);
  return people/pot;
}
function renderZips() {
  if (zipLayer) map.removeLayer(zipLayer);
  const focus=document.getElementById("focus").value;
  const show=document.getElementById("toggleZips").classList.contains("active");
  const colorOn=document.getElementById("toggleShare").classList.contains("active");
  if (!show) { zipLayer=null; return; }
  const vis = visibleCampuses();
  zipLayer=L.layerGroup();
  ZIPS.forEach(z => {
    const share=zipShare(z.zip, focus, vis);
    const circle=L.circle([z.lat,z.lng], {
      radius: Math.sqrt(z.pop)*18, color: colorOn?"#7c2d12":"#a8a29e", weight:1,
      fillColor: colorOn?shareColor(share):"#e7e5e4", fillOpacity:0.45
    });
    circle.bindTooltip(z.zip+" "+z.city+"<br>"+fmt(z.pop)+" residents \u00b7 "+fmt(z.potential)+" weekly churchgoers (est.)<br>"+(focus==="all"?"Visible churches cover "+pct(share)+" of potential":focus+" share "+pct(share)));
    circle.on("click", () => showZip(z, vis));
    zipLayer.addLayer(circle);
  });
  zipLayer.addTo(map);
}
function fillFocus(keepValue) {
  const focus=document.getElementById("focus");
  const prev = keepValue ? focus.value : "all";
  const list = orgs(visibleCampuses());
  focus.innerHTML="<option value='all'>All visible churches</option>"+list.map(o=>"<option value=\""+o.org+"\">"+o.org+"</option>").join("");
  if ([].some.call(focus.options, o => o.value===prev)) focus.value=prev;
}
function applyFilters() {
  fillFocus(true);
  renderMarkers();
  renderZips();
  const org=document.getElementById("focus").value;
  if (org==="all") showOverview();
  else {
    const c=visibleCampuses().find(x=>x.org===org) || CAMPUSES.find(x=>x.org===org);
    if (c) showCampus(c); else showOverview();
  }
}
function showCampus(c) {
  const vis=visibleCampuses();
  const orgW=orgWeekly(c.org);
  const nearby=ZIPS.map(z => ({
    z, d:miles(c.lat,c.lng,z.lat,z.lng), share:zipShare(z.zip,c.org,vis),
    people:CAMPUSES.filter(x=>x.org===c.org).reduce((s,x)=>s+((allocations[z.zip]||{})[x.id]||0),0)
  })).filter(r=>r.d<=MAX_MILES).sort((a,b)=>b.share-a.share).slice(0,8);
  document.getElementById("detail").innerHTML = "<h2>"+c.org+"</h2><p>"+c.campus+" \u00b7 "+c.denom+" \u00b7 "+sizeLabel(sizeBucket(c.weekly))+"</p>"
    +"<div class='statgrid'><div class='stat'><span>Campus weekly</span><b>"+fmt(c.weekly)+"</b></div>"
    +"<div class='stat'><span>Org weekly</span><b>"+fmt(orgW)+"</b></div>"
    +"<div class='stat'><span>Members / HH</span><b>"+(c.members?fmt(c.members):(c.households?fmt(c.households)+" hh":"\u2014"))+"</b></div>"
    +"<div class='stat'><span>Weekly giving</span><b>"+money(c.giving_weekly)+"</b></div></div>"
    +(c.website?"<p><a href='"+c.website+"' target='_blank' rel='noopener'>Website</a></p>":"")
    +"<p class='note'>"+(c.notes||"")+" Geocode: "+c.geocode_quality+".</p>"
    +"<h2>Modeled zip pull</h2><table><thead><tr><th>Zip</th><th>Miles</th><th>People</th><th>Share of zip</th></tr></thead><tbody>"
    +nearby.map(r=>"<tr><td>"+r.z.zip+"<br><span style='color:#78716c'>"+r.z.city+"</span></td><td>"+r.d.toFixed(1)+"</td><td>"+fmt(r.people)+"</td><td>"+pct(r.share)+"</td></tr>").join("")
    +"</tbody></table>";
}
function showZip(z, vis) {
  vis = vis || visibleCampuses();
  const row=allocations[z.zip]||{};
  const byOrg={};
  vis.forEach(c => { if (row[c.id]) byOrg[c.org]=(byOrg[c.org]||0)+row[c.id]; });
  const ranked=Object.entries(byOrg).sort((a,b)=>b[1]-a[1]);
  const covered=ranked.reduce((s,pair)=>s+pair[1],0);
  document.getElementById("detail").innerHTML = "<h2>"+z.zip+" \u00b7 "+z.city+"</h2>"
    +"<div class='statgrid'><div class='stat'><span>Population</span><b>"+fmt(z.pop)+"</b></div>"
    +"<div class='stat'><span>Weekly potential</span><b>"+fmt(z.potential)+"</b></div>"
    +"<div class='stat'><span>Visible coverage</span><b>"+pct(covered/z.potential)+"</b></div>"
    +"<div class='stat'><span>Uncaptured / other</span><b>"+pct(Math.max(0,1-covered/z.potential))+"</b></div></div>"
    +"<p class='note'>Potential = population x 26% (Pew St. Louis weekly attendance). Coverage uses the current filters only.</p>"
    +"<table><thead><tr><th>Church</th><th>Est. from zip</th><th>Share</th></tr></thead><tbody>"
    +ranked.map(function(pair){return "<tr><td>"+pair[0]+"</td><td>"+fmt(pair[1])+"</td><td>"+pct(pair[1]/z.potential)+"</td></tr>";}).join("")
    +"</tbody></table>";
}
function showOverview() {
  const vis=visibleCampuses();
  const list=orgs(vis);
  const totalW=list.reduce((s,o)=>s+o.weekly,0);
  document.getElementById("detail").innerHTML = "<h2>Visible weekly bodies</h2>"
    +"<div class='statgrid'><div class='stat'><span>Campuses shown</span><b>"+vis.length+" / "+CAMPUSES.length+"</b></div>"
    +"<div class='stat'><span>Combined weekly</span><b>"+fmt(totalW)+"</b></div></div>"
    +"<table><thead><tr><th>Church</th><th>Weekly</th><th>Sites</th></tr></thead><tbody>"
    +list.map(o=>"<tr><td>"+o.org+"</td><td>"+fmt(o.weekly)+"</td><td>"+o.campuses+"</td></tr>").join("")
    +"</tbody></table><p class='note'>Catholic weeklies are registered members x 26.5% Archdiocese Mass rate. Orthodox weeklies are estimates from ARDA 2020 + 2025 convert reporting.</p>";
}
function populateFilterOptions() {
  const faiths = Array.from(new Set(CAMPUSES.map(c=>c.tradition))).sort();
  document.getElementById("filterFaith").innerHTML = "<option value='all'>All faiths</option>"+
    faiths.map(f=>"<option value='"+f+"'>"+(FAITH_LABEL[f]||f)+"</option>").join("");
  const denoms = Array.from(new Set(CAMPUSES.map(family))).sort();
  document.getElementById("filterDenom").innerHTML = "<option value='all'>All denominations</option>"+
    denoms.map(d=>"<option value=\""+d+"\">"+d+"</option>").join("");
}
async function boot() {
  const [churches,zips,extra]=await Promise.all([
    fetch("churches.json").then(r=>r.json()),
    fetch("zips.json").then(r=>r.json()),
    fetch("orthodox-extra.json").then(r=>r.json()).catch(function(){return {campuses:[]};})
  ]);
  const seen={};
  CAMPUSES=churches.campuses.concat(extra.campuses||[]).filter(c => {
    if (seen[c.id]) return false; seen[c.id]=true; return true;
  });
  ZIPS=zips.zips; buildModel();
  populateFilterOptions();
  fillFocus(false);
  document.getElementById("legend").innerHTML=Object.entries(COLORS).map(function(kv){return "<span class='swatch'><i style='background:"+kv[1]+"'></i>"+(FAITH_LABEL[kv[0]]||kv[0])+"</span>";}).join("");
  map=L.map("map").setView([38.68,-90.55],10);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{attribution:"&copy; OpenStreetMap &copy; CARTO",maxZoom:19}).addTo(map);
  renderMarkers(); renderZips(); showOverview();
  ["filterFaith","filterDenom","filterSize"].forEach(function(id) {
    document.getElementById(id).addEventListener("change", applyFilters);
  });
  document.getElementById("focus").addEventListener("change", function() {
    renderZips();
    const org=document.getElementById("focus").value;
    if (org==="all") showOverview();
    else { const c=visibleCampuses().find(function(x){return x.org===org;}); if (c) showCampus(c); }
  });
  document.getElementById("toggleZips").addEventListener("click", function(e) { e.target.classList.toggle("active"); renderZips(); });
  document.getElementById("toggleShare").addEventListener("click", function(e) { e.target.classList.toggle("active"); renderZips(); });
  document.getElementById("resetFilters").addEventListener("click", function() {
    document.getElementById("filterFaith").value="all";
    document.getElementById("filterDenom").value="all";
    document.getElementById("filterSize").value="all";
    document.getElementById("focus").value="all";
    applyFilters();
  });
}
boot();
