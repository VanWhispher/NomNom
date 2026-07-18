import {HPB_NAMES, SGDB, _norm} from '../data/hpb.js';
import {DB} from '../data/met-table.js';
import {ONBYEAN, ONDB, ensureONDB} from '../data/opennutrition.js';
import {el, esc, r0, r1} from '../helpers.js';
import {load, state} from '../state.js';
import {openModal} from '../ui/nav.js';
import {logPackaged, openBarcode, weighAndLog} from './barcode.js';
import {logServing} from './eat-out-helpers.js';
import {aiNutrition} from './photo.js';

/* ---------- SEARCH BY NAME ---------- */
export async function barcodeLookup(code){
  code=String(code);
  try{ await ensureONDB(); const hit=ONBYEAN&&ONBYEAN.get(code); if(hit){ const sg=(+hit[6]>0)?+hit[6]:null; return {name:hit[0],per:{calories:hit[1],protein_g:hit[2],carbs_g:hit[3],fat_g:hit[4],sugar_g:hit[5]},source:'opennutrition',servingGrams:sg,servingLabel:sg?`${r1(sg)} g`:null,packageGrams:null}; } }catch(e){}
  try{
    const res=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,nutriments,serving_size,serving_quantity,product_quantity`);
    const data=await res.json();
    if(data.product){
      const p=data.product, n=p.nutriments||{};
      const per={calories:+(n['energy-kcal_100g']||0),protein_g:+(n['proteins_100g']||0),carbs_g:+(n['carbohydrates_100g']||0),fat_g:+(n['fat_100g']||0),sugar_g:+(n['sugars_100g']||0)};
      // serving weight in grams: prefer numeric serving_quantity, else parse it out of the serving_size label
      let sg=null; const sq=parseFloat(p.serving_quantity);
      if(isFinite(sq)&&sq>0&&sq<=5000) sg=sq;
      if(sg==null && p.serving_size){ const mm=String(p.serving_size).match(/([\d.]+)\s*(g|ml)\b/i); if(mm){ const v=parseFloat(mm[1]); if(isFinite(v)&&v>0&&v<=5000) sg=v; } }
      const sLabel=(p.serving_size&&String(p.serving_size).trim())||(sg?`${r1(sg)} g`:null);
      const pq=parseFloat(p.product_quantity); const pkg=(isFinite(pq)&&pq>0&&pq<=10000)?pq:null;   // net package weight (g/ml)
      return {name:p.product_name||('Item '+code),per,source:'barcode',servingGrams:sg,servingLabel:sLabel,packageGrams:pkg};
    }
  }catch(e){}
  return null;
}
/* Open Food Facts text search.
   Uses the legacy /cgi/search.pl on world.openfoodfacts.org because it allows
   cross-origin browser requests. The newer search.openfoodfacts.org (Search-a-licious)
   does NOT send CORS headers, so a browser fetch to it fails with "Load failed".
   On-demand only — OFF rate-limits search to ~10/min and asks apps not to search-as-you-type. */
export async function offTextSearch(term){
  const url=`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,brands,quantity,product_quantity,nutriments`;
  const r=await fetch(url);
  if(!r.ok) throw new Error('Open Food Facts search is unavailable right now ('+r.status+'). Try again shortly, scan the barcode, or estimate with AI.');
  const data=await r.json();
  const list=data.products||[];
  return list.map(p=>{
    const n=p.nutriments||{}; const kcal=n['energy-kcal_100g'];
    if(!p.product_name || kcal==null) return null;
    const pq=parseFloat(p.product_quantity);                 // net package weight in grams (or ml)
    const grams=(isFinite(pq) && pq>0 && pq<=10000) ? pq : null;
    return {name:p.product_name, brands:p.brands||'', quantity:p.quantity||'', grams, per:{
      calories:+kcal||0, protein_g:+(n['proteins_100g']||0), carbs_g:+(n['carbohydrates_100g']||0),
      fat_g:+(n['fat_100g']||0), sugar_g:+(n['sugars_100g']||0)}};
  }).filter(Boolean);
}
export function openSearch(){
  const m=openModal('Search by name',`
    <div class="field"><label>Food or brand name</label>
      <input id="sf-q" placeholder="Name or barcode number" autocomplete="off"></div>
    <div class="btn-row"><button class="btn btn-primary btn-block" id="sf-go">Also search packaged foods</button></div>
    <div class="hint">Your library, the local database, and OpenNutrition (13,000+ foods with macros) match as you type — all offline. Type or paste a product’s barcode number to look it up. The button also checks Open Food Facts for packaged items.</div>
    <div id="sf-lib"></div>
    <div id="sf-results"></div>
  `);
  const q=m.querySelector('#sf-q'), libBox=m.querySelector('#sf-lib'), res=m.querySelector('#sf-results');
  let dbMatches=[], onMatches=[], hpbMatches=[];
  function pickPer(name,per,source,g){
    const stage=el('<div></div>'); m.querySelector('#m-body').innerHTML=''; m.querySelector('#m-body').appendChild(stage);
    weighAndLog(m,stage,name,per,source,g);
  }
  function pickServing(name,cal,portion,source){
    const stage=el('<div></div>'); m.querySelector('#m-body').innerHTML=''; m.querySelector('#m-body').appendChild(stage);
    logServing(m,stage,name,cal,portion,source);
  }
  async function doBarcode(code){
    const stage=el('<div></div>'); m.querySelector('#m-body').innerHTML=''; m.querySelector('#m-body').appendChild(stage);
    stage.innerHTML=`<div class="spinner">${ONDB?'Looking up product…':'Loading food database (first time only, ~10 MB)…'}</div>`;
    const r=await barcodeLookup(code);
    if(!r){ stage.innerHTML=`<div class="err">No product found for barcode ${esc(code)} in OpenNutrition or Open Food Facts.</div><div class="field"><button class="btn btn-block" id="bc-back2">Back to search</button></div>`; stage.querySelector('#bc-back2').onclick=()=>{m.remove();openSearch();}; return; }
    logPackaged(m,stage,r);
  }
  function renderLocal(){
    const term=q.value.trim().toLowerCase();
    const raw=q.value.trim(); const isBC=/^\d{8,14}$/.test(raw);
    let html='';
    if(isBC) html+=`<div class="section-label">Barcode</div><div class="row tappable" data-bc="1"><div><div class="name">Look up barcode ${esc(raw)}</div><div class="sub">Search packaged products by number</div></div></div>`;
    hpbMatches=term?(SGDB||[]).filter(f=>f[0].toLowerCase().includes(term)).slice(0,30):[];
    if(hpbMatches.length)html+=`<div class="section-label">Singapore (HPB)</div>`+hpbMatches.map((f,i)=>{const g=(+f[6]>0)?+f[6]:null; const sub=g?`${r0(f[1]*g/100)} kcal · ${esc(f[8]||(g+' g'))} · SG FoodID`:`${r0(f[1])} kcal/100g · SG FoodID`; return `<div class="row tappable" data-hpb="${i}"><div><div class="name">${esc(f[0])}</div><div class="sub">${sub}</div></div></div>`;}).join('');
    const libM=term?state.library.filter(l=>l.name.toLowerCase().includes(term)):[];
    if(libM.length)html+=`<div class="section-label">Personal library</div>`+libM.map(l=>{
      const sub=l.perServing?`${r0(l.perServing.calories)} kcal per ${esc(l.perServing.portion)}`:`${r0(l.per_100g.calories)} kcal/100g`;
      return `<div class="row tappable" data-lib="${l.id}"><div><div class="name">${esc(l.name)}</div><div class="sub">${sub} · personal library</div></div></div>`;}).join('');
    dbMatches=term?(DB||[]).filter(f=>f.name.toLowerCase().includes(term) && !HPB_NAMES.has(_norm(f.name))).slice(0,20):[];
    if(dbMatches.length)html+=`<div class="section-label">Local database</div>`+dbMatches.map((f,i)=>`<div class="row tappable" data-db="${i}"><div><div class="name">${esc(f.name)}</div><div class="sub">${r0(f.calories)} kcal per ${esc(f.portion)} · local database</div></div></div>`).join('');
    onMatches=[];
    if(term.length>=2){
      if(ONDB){
        onMatches=ONDB.filter(a=>a[0].toLowerCase().includes(term)).slice(0,30);
        if(onMatches.length)html+=`<div class="section-label">OpenNutrition</div>`+onMatches.map((f,i)=>`<div class="row tappable" data-on="${i}"><div><div class="name">${esc(f[0])}</div><div class="sub">${r0(f[1])} kcal/100g · OpenNutrition</div></div></div>`).join('');
      }else{
        html+=`<div class="section-label">OpenNutrition</div><div class="empty" id="on-load">Loading the food database (first time only, ~10 MB)…</div>`;
      }
    }
    if(term && (hpbMatches.length||libM.length||dbMatches.length||onMatches.length))
      html+=`<div class="hint" style="padding:14px 4px 0">Nutrition data from Singapore's Health Promotion Board (SG FoodID), <a href="https://www.opennutrition.app" target="_blank" rel="noopener">OpenNutrition</a> &amp; Open Food Facts contributors.</div>`;
    libBox.innerHTML=html;
    const bcRow=libBox.querySelector('[data-bc]'); if(bcRow)bcRow.onclick=()=>doBarcode(raw);
    libBox.querySelectorAll('[data-hpb]').forEach(n=>n.onclick=()=>{const f=hpbMatches[+n.dataset.hpb];pickPer(f[0],{calories:f[1],protein_g:f[2],carbs_g:f[3],fat_g:f[4],sugar_g:f[5]},'hpb',(+f[6]>0)?+f[6]:null);});
    libBox.querySelectorAll('[data-lib]').forEach(n=>n.onclick=()=>{const l=state.library.find(x=>x.id===n.dataset.lib);if(l.perServing)pickServing(l.name,l.perServing.calories,l.perServing.portion,'library');else pickPer(l.name,l.per_100g,'library',l.lastGrams);});
    libBox.querySelectorAll('[data-db]').forEach(n=>n.onclick=()=>{const f=dbMatches[+n.dataset.db];pickServing(f.name,f.calories,f.portion,'local');});
    libBox.querySelectorAll('[data-on]').forEach(n=>n.onclick=()=>{const f=onMatches[+n.dataset.on];pickPer(f[0],{calories:f[1],protein_g:f[2],carbs_g:f[3],fat_g:f[4],sugar_g:f[5]},'opennutrition',f[6]);});
    if(term.length>=2 && !ONDB){
      ensureONDB().then(()=>{ if(q.value.trim().toLowerCase()===term) renderLocal(); })
        .catch(()=>{const ld=libBox.querySelector('#on-load'); if(ld)ld.textContent='Couldn\'t load opennutrition.json — it must be uploaded next to the app (it won\'t load in the preview or a local file).';});
    }
  }
  function offerAI(term){
    const wrap=el(`<div><div class="empty">No match in your library, the local database, or Open Food Facts for "${esc(term)}".</div><div class="field"><button class="btn btn-primary btn-block" id="sf-aigo">Estimate "${esc(term)}" with AI</button></div></div>`);
    res.innerHTML=''; res.appendChild(wrap);
    wrap.querySelector('#sf-aigo').onclick=()=>runAI(term);
  }
  async function runAI(term){
    if(!state.settings.apiKey){res.innerHTML=`<div class="err">Add your Google Gemini API key in Settings to use AI lookup.</div>`;return;}
    res.innerHTML=`<div class="spinner">Asking AI…</div>`;
    try{
      const ai=await aiNutrition(term);
      if(!ai.per_100g || !ai.per_100g.calories){res.innerHTML=`<div class="err">AI couldn't estimate that. Try a different name or enter it manually.</div>`;return;}
      res.innerHTML=`<div class="section-label">AI estimate</div>`;
      const node=el(`<div class="row tappable"><div><div class="name">${esc(ai.name||term)}</div><div class="sub">${r0(ai.per_100g.calories)} kcal/100g · AI estimate</div></div></div>`);
      node.onclick=()=>pickPer(ai.name||term,ai.per_100g,'ai');
      res.appendChild(node);
    }catch(e){res.innerHTML=`<div class="err">${esc(e.message||'AI lookup failed.')}</div><button class="btn btn-block" id="sf-airt" style="margin-top:10px">Try again</button>`;const rb=res.querySelector('#sf-airt');if(rb)rb.onclick=()=>runAI(term);}
  }
  async function doSearch(){
    const term=q.value.trim(); if(!term)return;
    const localHas=state.library.some(l=>l.name.toLowerCase().includes(term.toLowerCase())) || (SGDB||[]).some(f=>f[0].toLowerCase().includes(term.toLowerCase())) || (DB||[]).some(f=>f.name.toLowerCase().includes(term.toLowerCase()));
    res.innerHTML=`<div class="spinner">Searching Open Food Facts…</div>`;
    try{
      const url=`https://search.openfoodfacts.org/search?q=${encodeURIComponent(term)}&page_size=20&fields=code,product_name,brands,nutriments`;
      const r=await fetch(url);
      if(!r.ok) throw new Error('Open Food Facts returned an error ('+r.status+').');
      const data=await r.json();
      const prods=(data.hits||[]).filter(p=>p.product_name && p.nutriments && p.nutriments['energy-kcal_100g']!=null);
      if(!prods.length){ if(localHas){res.innerHTML='';} else {offerAI(term);} return; }
      res.innerHTML=`<div class="section-label">Open Food Facts</div>`+prods.map((p,i)=>{
        const cal=r0(p.nutriments['energy-kcal_100g']);
        return `<div class="row tappable" data-off="${i}"><div><div class="name">${esc(p.product_name)}</div><div class="sub">${p.brands?esc(p.brands)+' · ':''}${cal} kcal/100g · Open Food Facts</div></div></div>`;
      }).join('')+`<div class="field"><button class="btn btn-block" id="sf-aibtn">None of these — estimate with AI</button></div>`;
      res.querySelectorAll('[data-off]').forEach(node=>node.onclick=()=>{
        const p=prods[+node.dataset.off], n=p.nutriments;
        const per={calories:+(n['energy-kcal_100g']||0),protein_g:+(n['proteins_100g']||0),carbs_g:+(n['carbohydrates_100g']||0),fat_g:+(n['fat_100g']||0),sugar_g:+(n['sugars_100g']||0)};
        pickPer(p.product_name,per,'packaged');
      });
      res.querySelector('#sf-aibtn').onclick=()=>runAI(term);
    }catch(e){
      res.innerHTML=`<div class="err">Open Food Facts name search is unavailable (their text-search service is currently down). For an exact match, scan the product barcode; otherwise estimate with AI.</div>`
        +`<div class="btn-row"><button class="btn" id="sf-bar">Scan barcode</button><button class="btn btn-primary" id="sf-aifail">Estimate with AI</button></div>`;
      res.querySelector('#sf-bar').onclick=()=>{m.remove();openBarcode();};
      res.querySelector('#sf-aifail').onclick=()=>runAI(term);
    }
  }
  renderLocal();
  q.oninput=renderLocal;
  q.onkeydown=(e)=>{if(e.key==='Enter'){e.preventDefault();doSearch();}};
  m.querySelector('#sf-go').onclick=doSearch;
}

