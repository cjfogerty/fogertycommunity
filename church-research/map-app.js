const COLORS = { evangelical:"#7c2d12", catholic:"#1e3a5f", mainline:"#3f6212", orthodox:"#b45309", muslim:"#0f766e", jewish:"#6b21a8" };
const FAITH_LABEL = { evangelical:"Evangelical", catholic:"Catholic", mainline:"Mainline", orthodox:"Orthodox", muslim:"Muslim", jewish:"Jewish" };
const WEEKLY_RATE = 0.26;
const MAX_MILES = 16;
function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./,""); } catch(e) { return ""; } }
function miles(aLat,aLng,bLat,bLng) {
  const R=3958.8, toR=Math.PI/180;
  const dLat=(bLat-aLat)*toR, dLng=(bLng-aLng)*toR;
  const s=Math.sin(dLat/2)**2 + Math.cos(aLat*toR)*Math.cos(bLat*toR)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1, Math.sqrt(s)));
}
function fmt(n) { if (n==null || Number.isNaN(n)) return "—"; return Math.round(n).toLocaleString(); }
function money(n) { if (n==null) return "—"; return n>=1000 ? "$"+Math.round(n/1000)+"k" : "$"+Math.round(n); }
function pct(n) { if (n==null || Number.isNaN(n)) return "—"; return (n*100).toFixed(0)+"%"; }
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
function densityColor(d) {
  if (d==null) return "#efe8dc";
  const t = Math.max(0, Math.min(1, (Math.log(d) - Math.log(150)) / (Math.log(5000) - Math.log(150))));
  return "rgb("+Math.round(243-t*115)+","+Math.round(239-t*155)+","+Math.round(230-t*180)+")";
}
let CAMPUSES=[], ZIPS=[], ZIPGEO=null, map, zipLayer, markers=[], allocations={}, zipTotals={};
let pinnedZip=null, hoverZip=null;
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
  ZIPS.forEach(z => { zipTotals[z.zip]=Object.values(allocations[z.zip]||{}).reduce((a,b)=>a+b,0); });
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
function popupHtml(c) {
  return "<strong>"+c.org+"</strong><span>"+c.campus+" \u00b7 "+c.denom+"</span><br>Weekly: <b>"+fmt(c.weekly)+"</b>"
    +(c.members?" \u00b7 Members: <b>"+fmt(c.members)+"</b>":"")
    +"<br><span style='color:#78716c'>"+c.address+"</span>"
    +(c.website?"<br><a href='"+c.website+"' target='_blank' rel='noopener'>Website</a>":"");
}
function renderMarkers() {
  markers.forEach(m => map.removeLayer(m)); markers=[];
  visibleCampuses().forEach(c => {
    const size=Math.max(24, Math.min(44, 16+Math.sqrt(c.weekly||50)*0.5));
    const color=COLORS[c.tradition]||"#444";
    const icon=L.divIcon({ className:"", iconSize:[size,size], iconAnchor:[size/2,size/2],
      html:"<span class='pin' style='width:"+size+"px;height:"+size+"px;background-color:"+color+";background-image:url(https://www.google.com/s2/favicons?domain="+domainOf(c.website||"")+"&sz=64)'></span>" });
    const m=L.marker([c.lat,c.lng],{icon, riseOnHover:true, zIndexOffset:600}).addTo(map);
    m.bindPopup(popupHtml(c));
    m.on("click", () => { pinnedZip=null; showCampus(c); });
    markers.push(m);
  });
}
function zipMix(zip, vis) {
  const row=allocations[zip]||{};
  const byFaith={}, byOrg={};
  vis.forEach(c => {
    const n=row[c.id]||0;
    if (!n) return;
    byFaith[c.tradition]=(byFaith[c.tradition]||0)+n;
    byOrg[c.org]=(byOrg[c.org]||0)+n;
  });
  const tracked=Object.values(byFaith).reduce((a,b)=>a+b,0);
  const top=Object.entries(byOrg).sort((a,b)=>b[1]-a[1]).slice(0,3);
  return {byFaith, byOrg, tracked, top};
}
function styleZip(feat, highlighted) {
  return {
    color: highlighted ? "#1c1917" : "#c4b8a6",
    weight: highlighted ? 2.4 : 0.8,
    fillColor: densityColor(feat.properties.density),
    fillOpacity: highlighted ? 0.72 : 0.46
  };
}
function renderZips() {
  if (zipLayer) map.removeLayer(zipLayer);
  const show=document.getElementById("toggleZips").classList.contains("active");
  if (!show || !ZIPGEO) { zipLayer=null; return; }
  zipLayer=L.geoJSON(ZIPGEO, {
    style: feat => styleZip(feat, feat.properties.zip===(pinnedZip||hoverZip)),
    onEachFeature: (feat, layer) => {
      const p=feat.properties;
      layer.on({
        mouseover: () => { hoverZip=p.zip; if (!pinnedZip) { refreshZipStyles(); showZip(p); } },
        mouseout: () => { hoverZip=null; if (!pinnedZip) { refreshZipStyles(); showOverview(); } },
        click: () => { pinnedZip = (pinnedZip===p.zip) ? null : p.zip; refreshZipStyles(); if (pinnedZip) showZip(p); else showOverview(); }
      });
    }
  }).addTo(map);
  if (zipLayer.bringToBack) zipLayer.bringToBack();
}
function refreshZipStyles() {
  if (!zipLayer) return;
  const active = pinnedZip || hoverZip;
  zipLayer.eachLayer(layer => {
    const z=layer.feature.properties.zip;
    layer.setStyle(styleZip(layer.feature, z===active));
    if (z===active) layer.bringToFront();
  });
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
  if (pinnedZip) {
    const f=(ZIPGEO.features||[]).find(x=>x.properties.zip===pinnedZip);
    if (f) showZip(f.properties); else showOverview();
  } else if (org==="all") showOverview();
  else {
    const c=visibleCampuses().find(x=>x.org===org);
    if (c) showCampus(c); else showOverview();
  }
}
function mixBar(byFaith, tracked) {
  if (!tracked) return "<div class='mix'></div><div class='mix-key'>No tracked congregations modeled into this zip.</div>";
  const order=["catholic","evangelical","mainline","orthodox","muslim","jewish"];
  const segs=order.filter(k=>byFaith[k]).map(k=>"<span style='width:"+(100*byFaith[k]/tracked)+"%;background:"+COLORS[k]+"'></span>").join("");
  const key=order.filter(k=>byFaith[k]).map(k=>"<span class='swatch'><i style='background:"+COLORS[k]+"'></i>"+(FAITH_LABEL[k]||k)+" "+pct(byFaith[k]/tracked)+"</span>").join("");
  return "<div class='mix'>"+segs+"</div><div class='mix-key'>"+key+"</div>";
}
function legendHtml() {
  return "<h2>How to read this</h2>"
    +"<p class='hint'>Fills are people per square mile. Hover a zip. Click to pin it. Markers are campuses; size is weekly attendance.</p>"
    +"<div class='ramp'></div><div class='ramp-labels'><span>Sparse</span><span>People / sq mi</span><span>Dense</span></div>"
    +"<div class='legend' style='margin-top:10px'>"+Object.entries(COLORS).map(([k,v])=>"<span class='swatch'><i style='background:"+v+"'></i>"+(FAITH_LABEL[k]||k)+"</span>").join("")+"</div>";
}
function showOverview() {
  const vis=visibleCampuses();
  const list=orgs(vis);
  const totalW=list.reduce((s,o)=>s+o.weekly,0);
  document.getElementById("panel").innerHTML = legendHtml()
    +"<h2>Visible weekly bodies</h2>"
    +"<div class='statgrid two'><div class='stat'><span>Campuses</span><b>"+vis.length+" / "+CAMPUSES.length+"</b></div>"
    +"<div class='stat'><span>Combined weekly</span><b>"+fmt(totalW)+"</b></div></div>"
    +"<table><thead><tr><th>Church</th><th>Weekly</th><th>Sites</th></tr></thead><tbody>"
    +list.slice(0,12).map(o=>"<tr><td>"+o.org+"</td><td>"+fmt(o.weekly)+"</td><td>"+o.campuses+"</td></tr>").join("")
    +"</tbody></table>"
    +"<p class='note'>Pew puts St. Louis weekly worship at about 26% of residents. Religion mix on a zip is a gravity model of the congregations on this map, not a census of the zip.</p>";
}
function showZip(p) {
  const vis=visibleCampuses();
  const z = ZIPS.find(x=>x.zip===p.zip) || p;
  const mix=zipMix(p.zip, vis);
  const potential=(z.pop||p.pop)*WEEKLY_RATE;
  const capture = potential ? mix.tracked/potential : 0;
  document.getElementById("panel").innerHTML = legendHtml()
    +"<h2>"+p.zip+" \u00b7 "+p.city+"</h2>"
    +(pinnedZip===p.zip?"<p class='hint'>Pinned. Click the zip again to release.</p>":"<p class='hint'>Hovering. Click the zip to pin.</p>")
    +"<div class='statgrid'><div class='stat'><span>Population</span><b>"+fmt(p.pop)+"</b></div>"
    +"<div class='stat'><span>Land area</span><b>"+p.sq_miles+" mi\u00b2</b></div>"
    +"<div class='stat'><span>Density</span><b>"+fmt(p.density)+"</b></div></div>"
    +"<div class='statgrid two'><div class='stat'><span>Weekly worshipers (Pew 26%)</span><b>"+fmt(potential)+"</b></div>"
    +"<div class='stat'><span>Tracked share of that</span><b>"+pct(capture)+"</b></div></div>"
    +"<h2>Modeled mix among tracked bodies</h2>"
    +mixBar(mix.byFaith, mix.tracked)
    +"<h2>Largest pull into this zip</h2>"
    +(mix.top.length
      ? "<table><thead><tr><th>Location</th><th>Est. people</th></tr></thead><tbody>"
        +mix.top.map(([org,n])=>"<tr><td>"+org+"</td><td>"+fmt(n)+"</td></tr>").join("")
        +"</tbody></table>"
      : "<p class='note'>No modeled pull from the campuses currently visible.</p>")
    +"<p class='note'>26% is the metro weekly rate, applied evenly. The bar and top three are only the churches plotted here, allocated by distance and zip population.</p>";
}
function showCampus(c) {
  const orgW=orgWeekly(c.org);
  document.getElementById("panel").innerHTML = legendHtml()
    +"<h2>"+c.org+"</h2><p class='hint'>"+c.campus+" \u00b7 "+c.denom+" \u00b7 "+sizeLabel(sizeBucket(c.weekly))+"</p>"
    +"<div class='statgrid two'><div class='stat'><span>Campus weekly</span><b>"+fmt(c.weekly)+"</b></div>"
    +"<div class='stat'><span>Org weekly</span><b>"+fmt(orgW)+"</b></div></div>"
    +(c.website?"<p><a href='"+c.website+"' target='_blank' rel='noopener'>Website</a></p>":"")
    +"<p class='note'>"+(c.notes||"")+"</p>";
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
  const [churches,zips,extra,geo]=await Promise.all([
    fetch("churches.json").then(r=>r.json()),
    fetch("zips.json").then(r=>r.json()),
    fetch("orthodox-extra.json").then(r=>r.json()).catch(()=>({campuses:[]})),
    fetch("zip-polygons.json").then(r=>r.json())
  ]);
  const seen={};
  CAMPUSES=churches.campuses.concat(extra.campuses||[]).filter(c => { if (seen[c.id]) return false; seen[c.id]=true; return true; });
  ZIPGEO=geo;
  const geoBy={};
  (geo.features||[]).forEach(f => { geoBy[f.properties.zip]=f.properties; });
  ZIPS=zips.zips.map(z => {
    const g=geoBy[z.zip]||{};
    return Object.assign({}, z, {sq_miles:g.sq_miles, density:g.density, lat:g.lat||z.lat, lng:g.lng||z.lng});
  });
  buildModel();
  populateFilterOptions();
  fillFocus(false);
  map=L.map("map").setView([38.68,-90.55],10);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{attribution:"&copy; OpenStreetMap &copy; CARTO \u00b7 ZIP boundaries U.S. Census ZCTA",maxZoom:19}).addTo(map);
  renderZips();
  renderMarkers();
  showOverview();
  ["filterFaith","filterDenom","filterSize"].forEach(id => document.getElementById(id).addEventListener("change", applyFilters));
  document.getElementById("focus").addEventListener("change", () => {
    pinnedZip=null;
    const org=document.getElementById("focus").value;
    renderZips();
    if (org==="all") showOverview();
    else { const c=visibleCampuses().find(x=>x.org===org); if (c) showCampus(c); }
  });
  document.getElementById("toggleZips").addEventListener("click", e => { e.target.classList.toggle("active"); renderZips(); });
  document.getElementById("resetFilters").addEventListener("click", () => {
    document.getElementById("filterFaith").value="all";
    document.getElementById("filterDenom").value="all";
    document.getElementById("filterSize").value="all";
    document.getElementById("focus").value="all";
    pinnedZip=null; hoverZip=null;
    applyFilters();
  });
}
boot();
