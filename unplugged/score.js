// Shared by /unplugged/ and /unplugged/sync/. Category weighting for app rows.
const UW={cats:{},byKey:{},def:"general"};
async function loadWeights(url){const j=await (await fetch(url,{cache:"no-store"})).json();UW.def=j.default||"general";UW.list=j.categories;
 for(const c of j.categories){UW.cats[c.id]=c;for(const k of [...(c.apps||[]),...(c.packages||[])])UW.byKey[k.toLowerCase()]=c.id}return UW}
// app cell forms: "" (total row), "Instagram", "com.instagram.android", "Instagram [com.instagram.android]", "category:social"
function splitApp(a){a=String(a||"").trim();const m=a.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);return m?{label:m[1]||m[2],pkg:m[2]}:{label:a,pkg:""}}
function catOf(a){a=String(a||"").trim();if(!a)return UW.def;const lo=a.toLowerCase();
 if(lo.startsWith("category:")){const id=lo.slice(9).trim();return UW.cats[id]?id:(id=="other"?"general":UW.def)}
 const {label,pkg}=splitApp(a);return UW.byKey[pkg.toLowerCase()]||UW.byKey[label.toLowerCase()]||UW.def}
function appLabel(a){a=String(a||"").trim();if(!a)return"(total, no app split)";const lo=a.toLowerCase();if(lo.startsWith("category:")){const c=UW.cats[catOf(a)];return (c?c.label.split(" (")[0]:"Other")+" (category)"}return splitApp(a).label}
const wOf=a=>(UW.cats[catOf(a)]||{weight:1}).weight;
