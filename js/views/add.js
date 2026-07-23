import {aiSportMET} from '../ai/met-ai.js';
import {costRecipe, detectIngredients, lookupPer100} from '../ai/recipe.js';
import {HPB_NAMES, SGDB, _norm, ensureSGDB} from '../data/hpb.js';
import {DB, MET, QUICK} from '../data/met-table.js';
import {ONDB, ensureONDB} from '../data/opennutrition.js';
import {$, el, esc, latestWeightKg, r0, r1, rCal, sum, todayEx, todayFood, uid} from '../helpers.js';
import {MEALS, UNITS, defaultMeal, mealChips, mealFraction, save, state, tab, viewDate, wireMealChips} from '../state.js';
import {makeSheet} from '../ui/bottom-sheet.js';
import {navClose, navOpen} from '../ui/nav.js';
import {render} from '../ui/router.js';
import {IC_BACK, IC_BARCODE, IC_BOOK, IC_CAMERA, IC_CHECK, IC_CHEV, IC_CHEVR, IC_FOLDER, IC_FOLDERADD, IC_FORK, IC_MINUS, IC_PEN, IC_PENCIL, IC_PIN, IC_PLUS, IC_RECIPE, IC_REFRESH, IC_SEARCH, IC_TRASH, IC_UPLOAD, IC_X, actMeta, libToMealItem, mealItemKcal, mealSummary, mealTotal, recentFoods, relogFood} from './add-shared.js';
import {logPackaged, openWeighPer, weighAndLog} from './barcode.js';
import {addToLibrary, detectMenuDishes, generateRecipes, getLocation, haversine, logServing, nearbyPlaces, showConfirm, suggestDishesForPlaces} from './eat-out-helpers.js';
import {_camStream, aiNutrition, analyzePhoto, camCapture, camStart, camStop, toJpegBase64} from './photo.js';
import {barcodeLookup, offTextSearch} from './search.js';
import {openSettings} from './settings.js';
import {IC_SPARK} from './today.js';

/* ---------- ADD sheet (Food / Exercise tabs) ---------- */
$('fab').onclick=()=>openAdd();
export function openAdd(){
  const sh=makeSheet(`
    <div class="seg addtabs" id="add-tabs">
      <button data-tab="food" class="on">Food</button>
      <button data-tab="exercise">Exercise</button>
    </div>
    <div id="add-body"></div>`);
  const body=sh.overlay.querySelector('#add-body');
  const tabs=sh.overlay.querySelectorAll('#add-tabs button');
  const tabBar=sh.overlay.querySelector('#add-tabs');
  const setTabs=(v)=>{tabBar.style.display=v?'':'none';};
  const go=(fn)=>{sh.close();setTimeout(fn,200);};

  function addItemView(run){
    setTabs(false);
    body.innerHTML=`<div class="sub-head"><button class="circ-back" id="ai-back">${IC_BACK}</button><h3>Add item</h3></div><div id="ai-stage"></div>`;
    body.querySelector('#ai-back').onclick=renderFood;
    run(body.querySelector('#ai-stage'));
  }

  function renderFood(){
    camStop(); setTabs(true);
    body.innerHTML=`
      <div class="add-search"><span class="as-ic">${IC_SEARCH}</span><input id="af-q" placeholder="Search for a food…" autocomplete="off"></div>
      <div id="af-main"></div>`;
    const qEl=body.querySelector('#af-q'), main=body.querySelector('#af-main');
    let _searchSeq=0, _offT=null, _aiT=null;   // debounce + staleness guard for online avenues
    const rowHtml=(name,sub,attr,ic)=>`<div class="recent-row" ${attr}><span class="recent-ic">${ic||IC_FORK}</span><div class="recent-main"><div class="rn">${esc(name)}</div><div class="rs">${esc(sub)}</div></div><button class="recent-add" tabindex="-1" aria-label="Add">${IC_PLUS}</button></div>`;
    function showHome(){
      const recents=recentFoods(8);
      main.innerHTML=`
        <div class="tiles">
          <button class="tile" id="af-scan"><span class="tile-ic">${IC_CAMERA}</span><span>Scan food</span></button>
          <button class="tile" id="af-recipe"><span class="tile-ic">${IC_RECIPE}</span><span>Recipe</span></button>
          <button class="tile" id="af-eatout"><span class="tile-ic">${IC_PIN}</span><span>Eat out</span></button>
          <button class="tile" id="af-bar"><span class="tile-ic">${IC_BARCODE}</span><span>Barcode</span></button>
          <button class="tile" id="af-lib"><span class="tile-ic">${IC_BOOK}</span><span>Library</span></button>
          <button class="tile" id="af-man"><span class="tile-ic">${IC_PEN}</span><span>Manual</span></button>
        </div>
        ${recents.length?`<div class="add-label">Recent</div><div>${recents.map((r,i)=>`<div class="recent-row"><span class="recent-ic">${IC_FORK}</span><div class="recent-main"><div class="rn">${esc(r.name)}</div><div class="rs">${esc(r.sub)}</div></div><button class="recent-add" data-rl="${i}" aria-label="Re-log">${IC_PLUS}</button></div>`).join('')}</div>`:''}`;
      main.querySelector('#af-scan').onclick=()=>renderScan();
      main.querySelector('#af-recipe').onclick=()=>renderRecipe();
      main.querySelector('#af-eatout').onclick=()=>eatOutView();
      main.querySelector('#af-bar').onclick=()=>renderBarcode();
      main.querySelector('#af-lib').onclick=()=>renderLibrary();
      main.querySelector('#af-man').onclick=()=>renderManual();
      main.querySelectorAll('[data-rl]').forEach(b=>b.onclick=()=>{relogFood(recents[+b.dataset.rl]);sh.close();});
    }
    function showResults(term){
      const low=term.toLowerCase(), isBC=/^\d{8,14}$/.test(term);
      const seq=++_searchSeq;                       // invalidate any in-flight online lookups
      clearTimeout(_offT); clearTimeout(_aiT);
      const sections=[];
      if(isBC) sections.push(`<div class="add-label">Barcode</div>`+rowHtml('Look up barcode '+term,'Search packaged products','data-bc="1"',IC_BARCODE));
      const hpbM=(SGDB||[]).filter(f=>f[0].toLowerCase().includes(low)).slice(0,20);
      if(hpbM.length) sections.push(`<div class="add-label">Singapore (HPB)</div>`+hpbM.map((f,i)=>{const g=(+f[6]>0)?+f[6]:null; const sub=g?`${rCal(f[1]*g/100)} kcal · ${esc(f[8]||(g+' g'))}`:`${rCal(f[1])} kcal/100g`; return rowHtml(f[0],sub,`data-hpb="${i}"`);}).join(''));
      const libM=state.library.filter(l=>l.name.toLowerCase().includes(low)).slice(0,8);
      if(libM.length) sections.push(`<div class="add-label">Saved</div>`+libM.map(l=>{const sub=l.perServing?`${rCal(l.perServing.calories)} kcal per ${esc(l.perServing.portion)}`:`${rCal(l.per_100g.calories)} kcal/100g`;return rowHtml(l.name,sub,`data-lib="${l.id}"`);}).join(''));
      const dbM=(DB||[]).filter(f=>f.name.toLowerCase().includes(low) && !(HPB_NAMES&&HPB_NAMES.has(_norm(f.name)))).slice(0,12);
      if(dbM.length) sections.push(`<div class="add-label">Local database</div>`+dbM.map((f,i)=>rowHtml(f.name,`${rCal(f.calories)} kcal · ${esc(f.portion)}`,`data-db="${i}"`)).join(''));
      let onM=[];
      if(low.length>=2){
        if(ONDB){ onM=ONDB.filter(a=>a[0].toLowerCase().includes(low)).slice(0,25); if(onM.length) sections.push(`<div class="add-label">OpenNutrition</div>`+onM.map((f,i)=>rowHtml(f[0],`${rCal(f[1])} kcal/100g`,`data-on="${i}"`)).join('')); }
        else sections.push(`<div class="add-label">OpenNutrition</div><div class="empty" style="border:none" id="af-onload">Loading food database (first time, ~10 MB)…</div>`);
      }
      // AI search sits right after the first results section (2nd choice), not buried at the bottom
      const aiSecHtml=(!isBC && low.length>=1) ? `<div id="af-aisec"></div>` : '';
      let html=sections.length?sections[0]:'';
      if(aiSecHtml) html+=aiSecHtml;
      if(sections.length>1) html+=sections.slice(1).join('');
      // online avenues fill in here after a short debounce — no buttons
      if(!isBC && low.length>=2) html+=`<div id="af-offsec"></div>`;
      if(!html) html=`<div class="empty" style="border:none">Type a food name to search or estimate with AI.</div>`;
      main.innerHTML=html;

      const bc=main.querySelector('[data-bc]'); if(bc)bc.onclick=()=>addItemView(async st=>{ st.innerHTML=`<div class="spinner">Looking up…</div>`; const r=await barcodeLookup(term); if(!r){st.innerHTML=`<div class="err">No product found for barcode ${esc(term)}.</div>`;return;} logPackaged(null,st,r,()=>sh.close()); });
      main.querySelectorAll('[data-lib]').forEach(n=>n.onclick=()=>{const l=state.library.find(x=>x.id===n.dataset.lib);addItemView(st=>{ if(l.perServing)logServing(null,st,l.name,l.perServing.calories,l.perServing.portion,'library',()=>sh.close()); else weighAndLog(null,st,l.name,l.per_100g,'library',l.lastGrams,()=>sh.close()); });});
      main.querySelectorAll('[data-hpb]').forEach(n=>n.onclick=()=>{const f=hpbM[+n.dataset.hpb];addItemView(st=>openWeighPer(st,f[0],{calories:f[1],protein_g:f[2],carbs_g:f[3],fat_g:f[4],sugar_g:f[5]},'hpb',(+f[6]>0)?+f[6]:null,()=>sh.close()));});
      main.querySelectorAll('[data-db]').forEach(n=>n.onclick=()=>{const f=dbM[+n.dataset.db];addItemView(st=>logServing(null,st,f.name,f.calories,f.portion,'local',()=>sh.close()));});
      main.querySelectorAll('[data-on]').forEach(n=>n.onclick=()=>{const f=onM[+n.dataset.on];addItemView(st=>openWeighPer(st,f[0],{calories:f[1],protein_g:f[2],carbs_g:f[3],fat_g:f[4],sugar_g:f[5]},'opennutrition',(+f[6]>0)?+f[6]:null,()=>sh.close()));});

      if(low.length>=2 && !ONDB) ensureONDB().then(()=>{ if(qEl.value.trim()===term) showResults(term); }).catch(()=>{const ld=main.querySelector('#af-onload'); if(ld)ld.textContent='Offline database unavailable here — Open Food Facts and AI below still work, or check it’s deployed next to the app over https.';});
      if(!SGDB) ensureSGDB().then(()=>{ if(qEl.value.trim()===term) showResults(term); }).catch(()=>{});

      // debounced online lookups (Open Food Facts always; AI as a smart fallback)
      if(!isBC && low.length>=3) _offT=setTimeout(()=>runOff(term,seq),450);
      if(!isBC && low.length>=2) _aiT=setTimeout(()=>runAI(term,seq),780);
    }

    async function runOff(term,seq){
      if(seq!==_searchSeq) return;
      const sec=main.querySelector('#af-offsec'); if(!sec) return;
      sec.innerHTML=`<div class="add-label">Packaged &amp; branded</div><div class="empty" style="border:none">Searching Open Food Facts…</div>`;
      try{
        const items=await offTextSearch(term);
        if(seq!==_searchSeq || qEl.value.trim()!==term) return;
        const box=main.querySelector('#af-offsec'); if(!box) return;
        if(!items.length){ box.innerHTML=''; return; }        // quietly omit when nothing found
        box.innerHTML=`<div class="add-label">Packaged &amp; branded</div>`+items.map((it,i)=>{
          const sub=it.grams
            ? `${it.brands?esc(it.brands)+' · ':''}${r0(it.grams)} g · ${rCal(it.per.calories*it.grams/100)} kcal · Open Food Facts`
            : `${it.brands?esc(it.brands)+' · ':''}${rCal(it.per.calories)} kcal/100g · Open Food Facts`;
          return rowHtml(it.name,sub,`data-off="${i}"`);
        }).join('');
        box.querySelectorAll('[data-off]').forEach(n=>n.onclick=()=>{const it=items[+n.dataset.off];addItemView(st=>weighAndLog(null,st,it.name,it.per,'packaged',it.grams||null,()=>sh.close()));});
      }catch(e){ const box=main.querySelector('#af-offsec'); if(box&&seq===_searchSeq) box.innerHTML=''; }   // quiet fail
    }

    function aiEstimate(term){
      addItemView(st=>{
        const run=async()=>{
          if(!state.settings.apiKey){ st.innerHTML=`<div class="err">Add your Google Gemini API key in Settings to estimate foods with AI.</div><button class="btn btn-block" id="af-aiset" style="margin-top:10px">Open Settings</button>`; const b=st.querySelector('#af-aiset'); if(b)b.onclick=()=>{sh.close();setTimeout(openSettings,200);}; return; }
          st.innerHTML=`<div class="spinner">Estimating “${esc(term)}” with AI…</div>`;
          try{ const ai=await aiNutrition(term); if(!ai||!ai.per_100g||!(+ai.per_100g.calories)){ st.innerHTML=`<div class="err">AI couldn’t estimate that. Try a different name, or enter it manually.</div>`; return; } weighAndLog(null,st,ai.name||term,ai.per_100g,'ai',null,()=>sh.close(),ai.portion||null); }
          catch(e){ st.innerHTML=`<div class="err">${esc(e.message||'AI lookup failed.')}</div><button class="btn btn-block" id="af-airt" style="margin-top:10px">Try again</button>`; const rb=st.querySelector('#af-airt'); if(rb)rb.onclick=run; }
        };
        run();
      });
    }

    async function runAI(term,seq){
      if(seq!==_searchSeq) return;
      const sec=main.querySelector('#af-aisec'); if(!sec) return;
      const low=term.toLowerCase();
      const localCount=state.library.filter(l=>l.name.toLowerCase().includes(low)).length
        + (SGDB?SGDB.filter(a=>a[0].toLowerCase().includes(low)).length:0)
        + (DB||[]).filter(f=>f.name.toLowerCase().includes(low)).length
        + (ONDB?ONDB.filter(a=>a[0].toLowerCase().includes(low)).length:0);
      // plenty of results already, or no key -> offer AI as a single one-tap row (don't spend a call)
      if(localCount>=3 || !state.settings.apiKey){
        sec.innerHTML=`<div class="add-label">AI search</div>`+rowHtml(`Estimate “${term}” with AI`,'AI nutrition estimate','data-aigo="1"',IC_SPARK);
        const g=sec.querySelector('[data-aigo]'); if(g)g.onclick=()=>aiEstimate(term);
        return;
      }
      // thin results -> auto-estimate
      sec.innerHTML=`<div class="add-label">AI estimate</div><div class="empty" style="border:none">Estimating “${esc(term)}” with AI…</div>`;
      try{
        const ai=await aiNutrition(term);
        if(seq!==_searchSeq || qEl.value.trim()!==term) return;
        const box=main.querySelector('#af-aisec'); if(!box) return;
        if(!ai||!ai.per_100g||!(+ai.per_100g.calories)){ box.innerHTML=''; return; }
        box.innerHTML=`<div class="add-label">AI estimate</div>`+rowHtml(ai.name||term,`${rCal(ai.per_100g.calories)} kcal/100g · AI estimate`,'data-aihit="1"',IC_SPARK);
        const row=box.querySelector('[data-aihit]');
        if(row)row.onclick=()=>addItemView(st=>weighAndLog(null,st,ai.name||term,ai.per_100g,'ai',null,()=>sh.close(),ai.portion||null));
      }catch(e){
        if(seq!==_searchSeq) return;
        const box=main.querySelector('#af-aisec'); if(!box) return;
        box.innerHTML=`<div class="add-label">AI estimate</div>`+rowHtml('Couldn’t reach AI — tap to retry',esc(term),'data-airetry="1"',IC_SPARK);
        const rt=box.querySelector('[data-airetry]'); if(rt)rt.onclick=()=>runAI(term,_searchSeq);
      }
    }
    qEl.oninput=()=>{ const t=qEl.value.trim(); t?showResults(t):showHome(); };
    showHome();
  }

  function renderScan(){
    camStop(); setTabs(false);
    if(!state.settings.apiKey){
      body.innerHTML=`<div class="sub-head"><button class="circ-back" id="sc-back">${IC_BACK}</button><h3>Scan food</h3></div>
        <div class="note">Add your Google Gemini API key in Settings to identify food from photos.</div>
        <button class="btn btn-primary btn-block" id="sc-set" style="margin-top:12px">Open Settings</button>`;
      body.querySelector('#sc-back').onclick=renderFood;
      body.querySelector('#sc-set').onclick=()=>{sh.close();setTimeout(openSettings,200);};
      return;
    }
    body.innerHTML=`
      <div class="sub-head"><button class="circ-back" id="sc-back">${IC_BACK}</button><h3>Scan food</h3></div>
      <div class="scan-frame" id="sc-frame"><video id="sc-video" playsinline muted></video><div class="corners"><span></span><span></span><span></span><span></span></div><div class="scan-line"></div><div class="scan-hint" id="sc-hint">Starting camera…</div></div>
      <button class="btn btn-primary btn-block" id="sc-shot" style="margin-top:14px">Capture photo</button>
      <button class="dashed-btn" id="sc-up">${IC_UPLOAD} Upload a photo instead</button>
      <input type="file" accept="image/*" id="sc-file" style="display:none">
      <div id="sc-stage"></div>`;
    const video=body.querySelector('#sc-video'), hint=body.querySelector('#sc-hint'), file=body.querySelector('#sc-file');
    body.querySelector('#sc-back').onclick=()=>{camStop();renderFood();};
    let live=false;
    camStart(video).then(ok=>{ live=ok; hint.textContent=ok?'Point your camera at your meal':'Camera unavailable — tap Capture to use your camera'; });
    async function analyze(b64){
      camStop();
      body.innerHTML=`<div class="sub-head"><button class="circ-back" id="sc-b2">${IC_BACK}</button><h3>Review &amp; add</h3></div><div id="sc-stage"><div class="spinner">Analyzing photo…</div></div>`;
      body.querySelector('#sc-b2').onclick=renderScan;
      const stage=body.querySelector('#sc-stage');
      try{
        const result=await analyzePhoto(b64);
        if(!result.items||!result.items.length){ stage.innerHTML=`<div class="err">No food detected. ${esc(result.assumptions||'')}</div><button class="btn btn-block" id="sc-rt" style="margin-top:10px">Try again</button>`; stage.querySelector('#sc-rt').onclick=renderScan; return; }
        showConfirm(null,stage,result,()=>sh.close());
      }catch(e){ stage.innerHTML=`<div class="err">${esc(e.message||'Request failed.')}</div><button class="btn btn-block" id="sc-rt" style="margin-top:10px">Try again</button>`; stage.querySelector('#sc-rt').onclick=()=>analyze(b64); }
    }
    const nativeShot=()=>{ file.setAttribute('capture','environment'); file.click(); };
    body.querySelector('#sc-shot').onclick=()=>{ if(live&&_camStream){ analyze(camCapture(video)); } else { nativeShot(); } };
    body.querySelector('#sc-up').onclick=()=>{ file.removeAttribute('capture'); file.click(); };
    file.onchange=async(ev)=>{ const f=ev.target.files[0]; if(!f)return; camStop(); try{ analyze(await toJpegBase64(f)); }catch(e){ body.querySelector('#sc-stage').innerHTML=`<div class="err">Could not read that image.</div>`; } };
  }

  /* ---------- EAT OUT: scan a menu (A) + find food near me (B) ---------- */
  const EO_FALLBACK={Breakfast:400,Lunch:600,Dinner:600,Snack:200};
  const eoOpts={meal:null, target:null};
  function eoRemaining(){ return state.settings.dailyTarget ? Math.round(state.settings.dailyTarget - sum(todayFood(),'calories') + sum(todayEx(),'caloriesBurned')) : null; }
  function eoMealTarget(meal){
    const dt=state.settings.dailyTarget;
    const t = dt ? Math.round(dt*mealFraction(meal)) : (EO_FALLBACK[meal]||500);
    return Math.max(150,t);
  }
  function eoFit(kcal,budget){ if(budget==null) return 'var(--accent-strong)'; if(kcal<=budget) return '#3FB27F'; if(kcal<=budget*1.1) return '#E5A23D'; return '#E5484D'; }
  // build a dish object straight from Gemini's estimate (no OpenNutrition anchor for Eat out)
  function eoDish(d){
    const grams=Math.max(1,Math.round(+d.grams||300));
    let per;
    if(d.per100 && +d.per100.calories){ per={calories:+d.per100.calories||0,protein_g:+d.per100.protein_g||0,carbs_g:+d.per100.carbs_g||0,fat_g:+d.per100.fat_g||0,sugar_g:+d.per100.sugar_g||0}; }
    else { const c=(+d.kcal>0&&grams>0)?(+d.kcal*100/grams):0; per={calories:c,protein_g:0,carbs_g:0,fat_g:0,sugar_g:0}; }
    let kcal=Math.round(per.calories*grams/100); if(!kcal && +d.kcal>0) kcal=Math.round(+d.kcal);
    return {name:d.name, grams, per, kcal};
  }

  function eatOutView(){
    camStop(); setTabs(false);
    if(!eoOpts.meal){ eoOpts.meal=defaultMeal(); eoOpts.target=eoMealTarget(eoOpts.meal); }
    const MEALS_EO=['Breakfast','Lunch','Dinner','Snack'];
    body.innerHTML=`
      <div class="sub-head"><button class="circ-back" id="eo-back">${IC_BACK}</button><h3>Eat out</h3></div>
      <div class="scard">
        <div class="scard-h">What can I eat around me?</div>
        <div class="field"><label>Meal</label><div class="chips" id="eo-meal">${MEALS_EO.map(m=>`<button class="chip${m===eoOpts.meal?' sel':''}" data-m="${m}">${m}</button>`).join('')}</div></div>
        <div class="field"><label>Calories for this meal</label><input type="number" inputmode="numeric" id="eo-budget" value="${eoOpts.target!=null?eoOpts.target:''}" placeholder="optional"><div class="hint" id="eo-remwarn" style="display:none;margin-top:6px;color:var(--text-soft)"></div></div>
        <button class="dashed-btn" id="eo-menu">${IC_CAMERA} Scan a menu or food court</button>
        <button class="dashed-btn" id="eo-near" style="margin-top:10px">${IC_PIN} Find food places near me</button>
        <div class="hint">Calorie figures are AI estimates.</div>
      </div>`;
    body.querySelector('#eo-back').onclick=renderFood;
    const budEl=body.querySelector('#eo-budget');
    const remWarn=body.querySelector('#eo-remwarn');
    function syncRemWarn(){
      const rem=eoRemaining();
      if(rem!=null && eoOpts.target!=null && eoOpts.target>rem){
        remWarn.style.display=''; remWarn.textContent=`Above your ~${Math.max(0,rem)} kcal left today.`;
      } else { remWarn.style.display='none'; }
    }
    body.querySelectorAll('#eo-meal .chip').forEach(c=>c.onclick=()=>{
      eoOpts.meal=c.dataset.m;
      body.querySelectorAll('#eo-meal .chip').forEach(x=>x.classList.toggle('sel',x===c));
      eoOpts.target=eoMealTarget(eoOpts.meal);
      budEl.value=eoOpts.target!=null?eoOpts.target:'';
      syncRemWarn();
    });
    budEl.oninput=(e)=>{ eoOpts.target=+e.target.value||null; syncRemWarn(); };
    syncRemWarn();
    body.querySelector('#eo-menu').onclick=menuScanView;
    body.querySelector('#eo-near').onclick=nearbyView;
  }

  // hand a single chosen dish to the standard confirm/log step (pre-selecting the chosen meal)
  function openDish(dish, backFn){
    setTabs(false);
    body.innerHTML=`<div class="sub-head"><button class="circ-back" id="eo-b3">${IC_BACK}</button><h3>Review &amp; add</h3></div><div id="eo-stage"></div>`;
    body.querySelector('#eo-b3').onclick=backFn;
    const result={assumptions:'Estimated portion — adjust the weight to match what you’re eating.',
      items:[{name:dish.name, per_100g:dish.per, estimated_grams:dish.grams}]};
    showConfirm(null, body.querySelector('#eo-stage'), result, ()=>sh.close(), eoOpts.meal);
  }
  const eoDishRow=(d,budget,attr)=>`<div class="recent-row eo-dish" ${attr} style="cursor:pointer">
      <span class="recent-ic">${IC_FORK}</span>
      <div class="recent-main"><div class="rn">${esc(d.name)}</div><div class="rs">~${d.grams} g · est</div></div>
      <span style="font-weight:700;color:${eoFit(d.kcal,budget)}">${d.kcal}<small style="font-weight:500;color:var(--text-soft)"> kcal</small></span>
    </div>`;

  // Path A — menu / food-court photo
  function menuScanView(){
    camStop(); setTabs(false);
    if(!state.settings.apiKey){
      body.innerHTML=`<div class="sub-head"><button class="circ-back" id="ms-back">${IC_BACK}</button><h3>Scan a menu</h3></div>
        <div class="note">Add your Google Gemini API key in Settings to read menus.</div>
        <button class="btn btn-primary btn-block" id="ms-set" style="margin-top:12px">Open Settings</button>`;
      body.querySelector('#ms-back').onclick=eatOutView;
      body.querySelector('#ms-set').onclick=()=>{sh.close();setTimeout(openSettings,200);};
      return;
    }
    body.innerHTML=`
      <div class="sub-head"><button class="circ-back" id="ms-back">${IC_BACK}</button><h3>Scan a menu</h3></div>
      <div class="scan-frame" id="ms-frame"><video id="ms-video" playsinline muted></video><div class="corners"><span></span><span></span><span></span><span></span></div><div class="scan-line"></div><div class="scan-hint" id="ms-hint">Starting camera…</div></div>
      <button class="btn btn-primary btn-block" id="ms-shot" style="margin-top:14px">Capture photo</button>
      <button class="dashed-btn" id="ms-up">${IC_UPLOAD} Upload a photo instead</button>
      <input type="file" accept="image/*" id="ms-file" style="display:none">
      <div id="ms-stage"></div>`;
    const video=body.querySelector('#ms-video'), hint=body.querySelector('#ms-hint'), file=body.querySelector('#ms-file');
    body.querySelector('#ms-back').onclick=()=>{camStop();eatOutView();};
    let live=false;
    camStart(video).then(ok=>{ live=ok; hint.textContent=ok?'Point at a menu, signboard, or the food on offer':'Camera unavailable — tap Capture to use your camera'; });
    async function analyze(b64){
      camStop();
      body.innerHTML=`<div class="sub-head"><button class="circ-back" id="ms-b2">${IC_BACK}</button><h3>Reading the menu</h3></div><div id="ms-stage"><div class="spinner">Reading the menu…</div></div>`;
      body.querySelector('#ms-b2').onclick=menuScanView;
      const stage=body.querySelector('#ms-stage');
      try{
        const raw=await detectMenuDishes(b64,{meal:eoOpts.meal,target:eoOpts.target});
        if(!raw.length){ stage.innerHTML=`<div class="err">No dishes spotted. Try a clearer photo of the menu or the food.</div><button class="btn btn-block" id="ms-rt" style="margin-top:10px">Try again</button>`; stage.querySelector('#ms-rt').onclick=menuScanView; return; }
        const dishes=raw.map(eoDish);
        renderMenuList(dishes);
      }catch(e){ stage.innerHTML=`<div class="err">${esc(e.message||'Request failed.')}</div><button class="btn btn-block" id="ms-rt" style="margin-top:10px">Try again</button>`; stage.querySelector('#ms-rt').onclick=()=>analyze(b64); }
    }
    const nativeShot=()=>{ file.setAttribute('capture','environment'); file.click(); };
    body.querySelector('#ms-shot').onclick=()=>{ if(live&&_camStream){ analyze(camCapture(video)); } else { nativeShot(); } };
    body.querySelector('#ms-up').onclick=()=>{ file.removeAttribute('capture'); file.click(); };
    file.onchange=async(ev)=>{ const f=ev.target.files[0]; if(!f)return; camStop(); try{ analyze(await toJpegBase64(f)); }catch(e){ body.querySelector('#ms-stage').innerHTML=`<div class="err">Could not read that image.</div>`; } };

    function renderMenuList(dishes){
      setTabs(false);
      const budget=eoOpts.target;
      const sorted=dishes.slice().sort((a,b)=>{ const af=budget==null?0:(a.kcal<=budget?0:1), bf=budget==null?0:(b.kcal<=budget?0:1); return af-bf || a.kcal-b.kcal; });
      body.innerHTML=`<div class="sub-head"><button class="circ-back" id="ms-b3">${IC_BACK}</button><h3>What you can eat</h3></div>
        ${budget!=null?`<div class="hint" style="margin-top:0">${eoOpts.meal} target ~${budget} kcal — green fits, amber is close.</div>`:''}
        <div>${sorted.map((d,i)=>eoDishRow(d,budget,`data-i="${i}"`)).join('')}</div>`;
      body.querySelector('#ms-b3').onclick=menuScanView;
      body.querySelectorAll('.eo-dish').forEach(b=>b.onclick=()=>openDish(sorted[+b.dataset.i], renderMenuList.bind(null,dishes)));
    }
  }

  // Path B — places near me (key stays server-side in the Netlify function)
  function nearbyView(){
    camStop(); setTabs(false);
    if(!state.settings.apiKey){
      body.innerHTML=`<div class="sub-head"><button class="circ-back" id="nb-back">${IC_BACK}</button><h3>Find food near me</h3></div>
        <div class="note">Add your Google Gemini API key in Settings — it’s used to suggest dishes for each place.</div>
        <button class="btn btn-primary btn-block" id="nb-set" style="margin-top:12px">Open Settings</button>`;
      body.querySelector('#nb-back').onclick=eatOutView;
      body.querySelector('#nb-set').onclick=()=>{sh.close();setTimeout(openSettings,200);};
      return;
    }
    body.innerHTML=`<div class="sub-head"><button class="circ-back" id="nb-back">${IC_BACK}</button><h3>Find food near me</h3></div><div id="nb-stage"><div class="spinner">Getting your location…</div></div>`;
    body.querySelector('#nb-back').onclick=eatOutView;
    const stage=body.querySelector('#nb-stage');
    const fail=(msg)=>{ stage.innerHTML=`<div class="err">${esc(msg)}</div><button class="btn btn-block" id="nb-rt" style="margin-top:10px">Try again</button><button class="dashed-btn" id="nb-menu">${IC_CAMERA} Scan a menu instead</button>`; stage.querySelector('#nb-rt').onclick=nearbyView; stage.querySelector('#nb-menu').onclick=menuScanView; };
    (async()=>{
      let loc;
      try{ loc=await getLocation(); }catch(e){ return fail(e.message); }
      stage.innerHTML=`<div class="spinner">Looking for places within 600 m…</div>`;
      let places;
      try{ places=await nearbyPlaces(loc.lat,loc.lng); }catch(e){ return fail(e.message); }
      if(!places.length){ return fail('No food places found within 600 m. Try the menu scanner instead.'); }
      places.forEach(p=>{ p._dist=haversine(loc.lat,loc.lng,+p.lat,+p.lng); });
      places.sort((a,b)=>a._dist-b._dist); places=places.slice(0,8);
      stage.innerHTML=`<div class="spinner">Finding ${eoOpts.meal.toLowerCase()} picks near you…</div>`;
      const budget=eoOpts.target;
      let withDishes;
      try{ withDishes=await suggestDishesForPlaces(places,{meal:eoOpts.meal,target:eoOpts.target}); }catch(e){ return fail(e.message); }
      for(const p of withDishes){ p._dishes=(p.dishes||[]).map(eoDish); }
      renderPlaceList(withDishes,budget);
    })();

    function renderPlaceList(places,budget){
      setTabs(false);
      const fmtDist=(m)=>m<1000?`${m} m`:`${(m/1000).toFixed(1)} km`;
      const price=(n)=> (n>0?'$'.repeat(Math.min(4,n)):'');
      body.innerHTML=`<div class="sub-head"><button class="circ-back" id="nb-b2">${IC_BACK}</button><h3>Places near you</h3></div>
        ${budget!=null?`<div class="hint" style="margin-top:0">${eoOpts.meal} target ~${budget} kcal — green fits, amber is close.</div>`:''}
        <div>${places.map((p,pi)=>`
          <div class="scard" style="padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
              <div class="scard-h" style="margin:0">${esc(p.name)}</div>
              <div class="rs" style="white-space:nowrap;color:var(--text-soft)">${fmtDist(p._dist)}${price(p.priceLevel)?' · '+price(p.priceLevel):''}</div>
            </div>
            ${(p._dishes&&p._dishes.length)?p._dishes.map((d,di)=>eoDishRow(d,budget,`data-p="${pi}" data-d="${di}"`)).join(''):`<div class="hint" style="margin-top:6px">No dish suggestions for this place.</div>`}
          </div>`).join('')}</div>`;
      body.querySelector('#nb-b2').onclick=nearbyView;
      body.querySelectorAll('.eo-dish').forEach(b=>b.onclick=()=>{ const d=places[+b.dataset.p]._dishes[+b.dataset.d]; openDish(d, renderPlaceList.bind(null,places,budget)); });
    }
  }

  function editRecipeView(rec, backFn){
    camStop(); setTabs(false);
    const work=JSON.parse(JSON.stringify(rec));
    if(!Array.isArray(work.ingredients))work.ingredients=[];
    let adding=false;
    const oCal=(work.total&&work.total.calories)||0, oP=(work.total&&work.total.protein_g)||0, oC=(work.total&&work.total.carbs_g)||0, oF=(work.total&&work.total.fat_g)||0;
    work.ingredients.forEach(ing=>{ const g=+ing.grams||0;
      ing._rk=g>0?(+ing.kcal||0)/g:0;
      ing._rp=(g>0&&ing.protein_g!=null)?(+ing.protein_g)/g:null;
      ing._rc=(g>0&&ing.carbs_g!=null)?(+ing.carbs_g)/g:null;
      ing._rf=(g>0&&ing.fat_g!=null)?(+ing.fat_g)/g:null; });
    // work.total/work.per/ing.kcal etc are kept RAW (unrounded) here; every read-site below
    // rounds with r0() at display time so scaled totals and ingredient sums stay consistent.
    function recompute(){
      let tk=0,tp=0,tc=0,tf=0,allMac=work.ingredients.length>0;
      work.ingredients.forEach(ing=>{ const g=+ing.grams||0; ing.kcal=ing._rk*g; tk+=ing._rk*g;
        if(ing._rp!=null)tp+=ing._rp*g; else allMac=false;
        if(ing._rc!=null)tc+=ing._rc*g; if(ing._rf!=null)tf+=ing._rf*g; });
      const sv=Math.max(1,Math.round(+work.servings||1));
      let TP,TC,TF;
      if(allMac){TP=tp;TC=tc;TF=tf;} else { const r=oCal>0?tk/oCal:0; TP=oP*r;TC=oC*r;TF=oF*r; }
      work.total={calories:tk,protein_g:TP,carbs_g:TC,fat_g:TF};
      work.per={calories:tk/sv,protein_g:TP/sv,carbs_g:TC/sv,fat_g:TF/sv};
    }
    function preview(){ const per=work.per||{calories:0}, tot=work.total||{calories:0}, sv=Math.max(1,Math.round(+work.servings||1));
      return `<div class="rc-top"><div><div class="rc-meta">makes ${sv} serving${sv===1?'':'s'} · ${rCal(tot.calories)} kcal total</div></div><div class="rc-kcal"><b>${rCal(per.calories)}</b><span>kcal/serving</span></div></div><div class="fitlabel" style="margin-top:6px">${r0(per.protein_g||0)} g protein/serving</div>`; }
    function refreshNums(){ recompute();
      work.ingredients.forEach((ing,i)=>{ const k=body.querySelector('.ei-k[data-i="'+i+'"]'); if(k)k.textContent=rCal(ing.kcal)+' kcal'; });
      const pv=body.querySelector('#re-prev'); if(pv)pv.innerHTML=preview(); }
    function draw(){
      recompute();
      const sv=Math.max(1,Math.round(+work.servings||1));
      body.innerHTML=`
        <div class="sub-head"><button class="circ-back" id="re-back">${IC_BACK}</button><h3>Edit recipe</h3></div>
        <div class="scard">
          <div class="field"><label>Recipe name</label><input id="re-name" value="${esc(work.name||'')}" autocomplete="off"></div>
          <div class="prow" style="margin-top:8px"><span class="lab">Makes (servings)</span><div class="pstep"><button id="re-svdn">${IC_MINUS}</button><span class="val" id="re-sv">${sv}</span><button id="re-svup">${IC_PLUS}</button></div></div>
        </div>
        <div class="scard">
          <div class="scard-h">Ingredients</div>
          <div id="re-ings">${work.ingredients.map((ing,i)=>`
            <div class="edit-ing">
              <div class="ei-name">${esc(ing.name)}</div>
              <div class="ei-right">
                <input class="ei-g" type="number" inputmode="decimal" min="0" data-i="${i}" value="${r0(ing.grams)}"><span class="ei-u">g</span>
                <span class="ei-k" data-i="${i}">${rCal(ing.kcal)} kcal</span>
                <button class="ei-rm" data-rm="${i}" aria-label="Remove">${IC_X}</button>
              </div>
            </div>`).join('')}</div>
          ${work.ingredients.length?'':`<div class="rc-empty">No ingredients left — cancel to keep the original.</div>`}
          ${adding?`<div class="add-ing-form">
            <div class="field"><label>Ingredient</label><input id="re-aname" placeholder="e.g. cooked rice" autocomplete="off"></div>
            <div style="display:flex;gap:10px;margin-top:10px">
              <div class="field" style="flex:1;margin:0"><label>Amount (g)</label><input id="re-ag" type="number" inputmode="decimal" min="0" placeholder="100"></div>
              <div class="field" style="flex:1;margin:0"><label>kcal / 100g</label><input id="re-a100" type="number" inputmode="decimal" min="0" placeholder="auto"></div>
            </div>
            <div id="re-astat" class="hint" style="margin-top:8px"></div>
            <div class="rc-acts" style="margin-top:10px"><button class="btn" id="re-addx">Cancel</button><button class="btn btn-primary" id="re-addgo">Add</button></div>
          </div>`:`<button class="dashed-btn" id="re-add" style="margin-top:12px">${IC_PLUS} Add ingredient</button>`}
        </div>
        <div class="rc-card" id="re-prev">${preview()}</div>
        <div class="rc-acts"><button class="btn" id="re-cancel">Cancel</button><button class="btn btn-primary" id="re-save">Save changes</button></div>`;
      body.querySelector('#re-back').onclick=()=>openRecipeDetail(rec,backFn);
      body.querySelector('#re-cancel').onclick=()=>openRecipeDetail(rec,backFn);
      body.querySelector('#re-name').oninput=(e)=>{work.name=e.target.value;};
      body.querySelector('#re-svup').onclick=()=>{work.servings=Math.min(20,sv+1);body.querySelector('#re-sv').textContent=work.servings;refreshNums();};
      body.querySelector('#re-svdn').onclick=()=>{work.servings=Math.max(1,sv-1);body.querySelector('#re-sv').textContent=work.servings;refreshNums();};
      body.querySelectorAll('.ei-g').forEach(inp=>inp.oninput=(e)=>{ const i=+e.target.dataset.i; if(work.ingredients[i]){work.ingredients[i].grams=+e.target.value||0; refreshNums();} });
      body.querySelectorAll('[data-rm]').forEach(btn=>btn.onclick=()=>{ work.ingredients.splice(+btn.dataset.rm,1); draw(); });
      if(adding){
        const an=body.querySelector('#re-aname'); if(an)an.focus();
        body.querySelector('#re-addx').onclick=()=>{adding=false;draw();};
        body.querySelector('#re-addgo').onclick=async()=>{
          const nameEl=body.querySelector('#re-aname'),gEl=body.querySelector('#re-ag'),mEl=body.querySelector('#re-a100'),stat=body.querySelector('#re-astat'),go=body.querySelector('#re-addgo');
          const name=(nameEl.value||'').trim(),g=+gEl.value||0,man=+mEl.value||0;
          if(!name){stat.textContent='Enter an ingredient name.';return;}
          if(!g){stat.textContent='Enter an amount in grams.';return;}
          let per100;
          if(man>0){ per100={cal:man,prot:0,carb:0,fat:0}; }
          else { stat.textContent='Estimating calories…'; go.disabled=true; per100=await lookupPer100(name); go.disabled=false;
            if(!per100){ stat.textContent='Couldn’t estimate — enter a kcal/100g value above, or add a Gemini API key in Settings.'; return; } }
          work.ingredients.push({name,grams:g,have:true,
            kcal:(per100.cal||0)*g/100,protein_g:(per100.prot||0)*g/100,carbs_g:(per100.carb||0)*g/100,fat_g:(per100.fat||0)*g/100,
            _rk:(per100.cal||0)/100,_rp:(per100.prot||0)/100,_rc:(per100.carb||0)/100,_rf:(per100.fat||0)/100});
          adding=false; draw();
        };
      } else { const ab=body.querySelector('#re-add'); if(ab)ab.onclick=()=>{adding=true;draw();}; }
      body.querySelector('#re-save').onclick=()=>{
        recompute();
        const name=(work.name||'').trim()||rec.name, svv=Math.max(1,Math.round(+work.servings||1));
        const clean=JSON.parse(JSON.stringify(rec));
        clean.name=name; clean.servings=svv;
        clean.ingredients=work.ingredients.map(ing=>{ const g=+ing.grams||0; return {name:ing.name,grams:g,have:!!ing.have,kcal:ing._rk*g,
          protein_g:ing._rp!=null?ing._rp*g:(ing.protein_g||0),
          carbs_g:ing._rc!=null?ing._rc*g:(ing.carbs_g||0),
          fat_g:ing._rf!=null?ing._rf*g:(ing.fat_g||0)}; });
        clean.total=work.total; clean.per=work.per;
        const idx=state.recipes.findIndex(x=>x.id===rec.id); if(idx>=0)state.recipes[idx]=clean; else state.recipes.push(clean);
        save();
        openRecipeDetail(clean,backFn);
      };
    }
    draw();
  }
  function openRecipeDetail(rec, backFn){
    camStop(); setTabs(false);
    const base=Math.max(1,Math.round(rec.servings||1));
    let cur=base, meal=rec.meal||defaultMeal();
    function draw(){
      const f=cur/base, ings=rec.ingredients||[];
      const have=ings.filter(x=>x.have), buy=ings.filter(x=>!x.have);
      const row=(ing)=>`<div class="rc-ing"><div><span class="nm">${esc(ing.name)}</span> <span class="g">${ing.grams?r0(ing.grams*f)+' g':''}</span></div><span class="kc">${ing.kcal?rCal(ing.kcal*f)+' kcal':''}</span></div>`;
      const totCal=rCal(((rec.total&&rec.total.calories)||0)*f);
      const per=rec.per||{calories:0,protein_g:0};
      body.innerHTML=`
        <div class="sub-head"><button class="circ-back" id="rd-back">${IC_BACK}</button><h3>${esc(rec.name)}</h3></div>
        <div class="rc-card">
          <div class="rc-top">
            <div><div class="rc-meta">${rec.time_min?r0(rec.time_min)+' min · ':''}makes ${cur} serving${cur===1?'':'s'} · ${totCal} kcal total</div></div>
            <div class="rc-kcal"><b>${rCal(per.calories)}</b><span>kcal/serving</span></div>
          </div>
          <div class="fitlabel" style="margin-top:6px">${r0(per.protein_g||0)} g protein/serving</div>
          <div class="prow" style="margin-top:14px"><span class="lab">Scale recipe</span><div class="pstep"><button id="rd-dn">${IC_MINUS}</button><span class="val" id="rd-sv">${cur}</span><button id="rd-up">${IC_PLUS}</button></div></div>
          <div class="rc-sec">You have</div>${have.length?have.map(row).join(''):`<div class="rc-empty">—</div>`}
          ${buy.length?`<div class="rc-sec">Shopping list</div>`+buy.map(row).join(''):''}
          <div class="rc-sec">Method</div><ol class="steps">${(rec.steps||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ol>
          ${rec.note?`<div class="hint" style="margin-top:8px">${esc(rec.note)}</div>`:''}
        </div>
        <div class="scard">
          <div class="field"><label>Log to</label><div class="chips" id="rd-meal">${MEALS.map(m=>`<button class="chip${m===meal?' sel':''}" data-m="${m}">${m}</button>`).join('')}</div></div>
          <div class="rc-acts"><button class="btn" id="rd-edit">Edit</button><button class="btn" id="rd-del">Delete</button></div>
          <button class="btn btn-primary btn-block" id="rd-log" style="margin-top:8px">Log 1 serving</button>
          <div id="rd-msg"></div>
        </div>`;
      body.querySelector('#rd-back').onclick=backFn;
      body.querySelector('#rd-edit').onclick=()=>editRecipeView(rec,backFn);
      body.querySelector('#rd-up').onclick=()=>{cur=Math.min(20,cur+1);draw();};
      body.querySelector('#rd-dn').onclick=()=>{cur=Math.max(1,cur-1);draw();};
      body.querySelectorAll('#rd-meal .chip').forEach(c=>c.onclick=()=>{meal=c.dataset.m;body.querySelectorAll('#rd-meal .chip').forEach(x=>x.classList.toggle('sel',x===c));});
      body.querySelector('#rd-log').onclick=()=>{ state.entries.push({id:uid(),date:viewDate,meal,name:rec.name,grams:0,portion:'serving',unitCal:per.calories,servingLabel:'1 serving',calories:per.calories,protein_g:per.protein_g||0,carbs_g:per.carbs_g||0,fat_g:per.fat_g||0,sugar_g:0,source:'recipe'}); save(); sh.close(); };
      body.querySelector('#rd-del').onclick=()=>{ if(confirm('Delete this saved recipe?')){ state.recipes=state.recipes.filter(x=>x.id!==rec.id); save(); backFn(); } };
    }
    draw();
  }
  function recipeList(backFn){
    camStop(); setTabs(false);
    const recs=state.recipes||[];
    body.innerHTML=`<div class="sub-head"><button class="circ-back" id="rl-back">${IC_BACK}</button><h3>Saved recipes</h3></div><div id="rl-body" style="margin-top:6px"></div>`;
    body.querySelector('#rl-back').onclick=backFn;
    const lb=body.querySelector('#rl-body');
    if(!recs.length){ lb.innerHTML=`<div class="empty" style="border:none">No saved recipes yet. Generate a recipe and tap Save to keep it here.</div>`; return; }
    lb.innerHTML=recs.map(r=>`<button class="meal-folder" data-rec="${r.id}"><span class="mf-ic">${IC_RECIPE}</span><span class="mf-main"><span class="mf-name">${esc(r.name)}</span><span class="mf-sum">${r0(r.servings||1)} servings · ${r.per?rCal(r.per.calories):rCal(0)} kcal/serving</span></span><span class="mf-chev">${IC_CHEVR}</span></button>`).join('');
    lb.querySelectorAll('[data-rec]').forEach(b=>b.onclick=()=>{ const r=state.recipes.find(x=>x.id===b.dataset.rec); if(r)openRecipeDetail(r,()=>recipeList(backFn)); });
  }

  function renderRecipe(){
    camStop(); setTabs(false);
    if(!state.settings.apiKey){
      body.innerHTML=`<div class="sub-head"><button class="circ-back" id="rc-back">${IC_BACK}</button><h3>Recipe</h3></div>
        <div class="note">Add your Google Gemini API key in Settings to create recipes from your ingredients.</div>
        <button class="btn btn-primary btn-block" id="rc-set" style="margin-top:12px">Open Settings</button>`;
      body.querySelector('#rc-back').onclick=renderFood;
      body.querySelector('#rc-set').onclick=()=>{sh.close();setTimeout(openSettings,200);};
      return;
    }
    const remaining = state.settings.dailyTarget ? Math.round(state.settings.dailyTarget - sum(todayFood(),'calories') + sum(todayEx(),'caloriesBurned')) : null;
    const rc={ings:[], servings:2, meal:defaultMeal(), extras:3, diet:[], budget:(remaining!=null?Math.max(250,remaining):null)};
    const DIETS=['Vegetarian','Halal','No dairy','No nuts'];

    function inputView(){
      camStop(); setTabs(false);
      body.innerHTML=`
        <div class="sub-head"><button class="circ-back" id="rc-back">${IC_BACK}</button><h3>Cook with what I have</h3></div>
        ${(state.recipes&&state.recipes.length)?`<button class="dashed-btn" id="rc-saved" style="margin-top:12px">${IC_BOOK} Saved recipes (${state.recipes.length})</button>`:''}
        <div class="scard">
          <div class="scard-h">Your ingredients</div>
          <div class="add-search"><span class="as-ic">${IC_SEARCH}</span><input id="rc-in" placeholder="Type an ingredient, then Enter" autocomplete="off"></div>
          <button class="dashed-btn" id="rc-shot" style="margin-top:10px">${IC_CAMERA} Scan ingredients from a photo</button>
          <input type="file" accept="image/*" id="rc-file" style="display:none">
          <div class="ingchips" id="rc-chips"></div>
          <div id="rc-detect"></div>
        </div>
        <div class="scard">
          <div class="scard-h">Preferences</div>
          <div class="prow"><span class="lab">Servings</span>
            <div class="pstep"><button id="rc-svdn">${IC_MINUS}</button><span class="val" id="rc-svv">${rc.servings}</span><button id="rc-svup">${IC_PLUS}</button></div></div>
          <div class="field"><label>Meal</label><div class="chips" id="rc-meal">${MEALS.map(m=>`<button class="chip${m===rc.meal?' sel':''}" data-m="${m}">${m}</button>`).join('')}</div></div>
          <div class="field"><label>Extra ingredients I'd buy</label><div class="chips" id="rc-extras">
            <button class="chip${rc.extras===0?' sel':''}" data-x="0">Only what I have</button>
            <button class="chip${rc.extras===3?' sel':''}" data-x="3">A few</button>
            <button class="chip${rc.extras===99?' sel':''}" data-x="99">Best recipe</button></div></div>
          <div class="field"><label>Dietary</label><div class="chips" id="rc-diet">${DIETS.map(d=>`<button class="chip" data-d="${d}">${d}</button>`).join('')}</div></div>
          <div class="field"><label>Calorie budget per serving${remaining!=null?' · your remaining today':''}</label>
            <input type="number" inputmode="numeric" id="rc-budget" value="${rc.budget!=null?rc.budget:''}" placeholder="optional"></div>
        </div>
        <button class="btn btn-primary btn-block" id="rc-go" ${rc.ings.length?'':'disabled'}>Suggest recipes</button>`;
      body.querySelector('#rc-back').onclick=()=>{camStop();renderFood();};
      const savedBtn=body.querySelector('#rc-saved'); if(savedBtn)savedBtn.onclick=()=>recipeList(inputView);
      const chips=body.querySelector('#rc-chips'), goBtn=body.querySelector('#rc-go');
      const refresh=()=>{ goBtn.disabled=!rc.ings.length; };
      const drawChips=()=>{ chips.innerHTML=rc.ings.map((g,i)=>`<span class="ingchip">${esc(g)}<button data-rm="${i}" aria-label="Remove">${IC_X}</button></span>`).join('');
        chips.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{rc.ings.splice(+b.dataset.rm,1);drawChips();refresh();}); };
      const addIng=(v)=>{ (v||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(x=>{ if(!rc.ings.some(g=>g.toLowerCase()===x.toLowerCase())) rc.ings.push(x); }); drawChips(); refresh(); };
      drawChips();
      const inEl=body.querySelector('#rc-in');
      inEl.onkeydown=(e)=>{ if(e.key==='Enter'){e.preventDefault();addIng(inEl.value);inEl.value='';} };
      const file=body.querySelector('#rc-file');
      body.querySelector('#rc-shot').onclick=()=>{ file.removeAttribute('capture'); file.click(); };
      file.onchange=async(ev)=>{ const f=ev.target.files[0]; if(!f)return; const box=body.querySelector('#rc-detect'); box.innerHTML=`<div class="spinner">Spotting ingredients…</div>`;
        try{ const b64=await toJpegBase64(f); const found=await detectIngredients(b64);
          if(!found.length){ box.innerHTML=`<div class="hint">No ingredients spotted — add them by typing above.</div>`; }
          else { found.forEach(x=>{ if(!rc.ings.some(g=>g.toLowerCase()===x.toLowerCase())) rc.ings.push(x); }); drawChips(); refresh(); box.innerHTML=`<div class="hint">Added ${found.length} item${found.length===1?'':'s'} — edit or remove any above.</div>`; }
        }catch(e){ box.innerHTML=`<div class="err">${esc(e.message||'Could not read that photo.')}</div>`; } file.value=''; };
      body.querySelector('#rc-svup').onclick=()=>{rc.servings=Math.min(12,rc.servings+1);body.querySelector('#rc-svv').textContent=rc.servings;};
      body.querySelector('#rc-svdn').onclick=()=>{rc.servings=Math.max(1,rc.servings-1);body.querySelector('#rc-svv').textContent=rc.servings;};
      body.querySelectorAll('#rc-meal .chip').forEach(c=>c.onclick=()=>{rc.meal=c.dataset.m;body.querySelectorAll('#rc-meal .chip').forEach(x=>x.classList.toggle('sel',x===c));});
      body.querySelectorAll('#rc-extras .chip').forEach(c=>c.onclick=()=>{rc.extras=+c.dataset.x;body.querySelectorAll('#rc-extras .chip').forEach(x=>x.classList.toggle('sel',x===c));});
      body.querySelectorAll('#rc-diet .chip').forEach(c=>c.onclick=()=>{const d=c.dataset.d,i=rc.diet.indexOf(d);if(i>=0)rc.diet.splice(i,1);else rc.diet.push(d);c.classList.toggle('sel');});
      body.querySelector('#rc-budget').oninput=(e)=>{rc.budget=+e.target.value||null;};
      goBtn.onclick=()=>generate();
    }

    async function generate(){
      setTabs(false);
      body.innerHTML=`<div class="sub-head"><button class="circ-back" id="rc-b2">${IC_BACK}</button><h3>Recipes</h3></div><div id="rc-out"><div class="spinner">Cooking up ideas…</div></div>`;
      body.querySelector('#rc-b2').onclick=inputView;
      const out=body.querySelector('#rc-out');
      try{
        const recipes=await generateRecipes(rc.ings,{servings:rc.servings,meal:rc.meal,extras:rc.extras,diet:rc.diet,budget:rc.budget});
        if(!recipes.length){ out.innerHTML=`<div class="err">No recipes came back. Try adding an ingredient or loosening the extras.</div><button class="btn btn-block" id="rc-rt" style="margin-top:10px">Back</button>`; out.querySelector('#rc-rt').onclick=inputView; return; }
        for(const r of recipes){ try{ await costRecipe(r); }catch(_){ } }
        renderResults(recipes);
      }catch(e){ out.innerHTML=`<div class="err">${esc(e.message||'Request failed.')}</div><button class="btn btn-block" id="rc-rt" style="margin-top:10px">Try again</button>`; out.querySelector('#rc-rt').onclick=()=>generate(); }
    }

    const fitColor=(per)=>{ if(rc.budget==null) return 'var(--accent)'; if(per<=rc.budget) return '#3FB27F'; if(per<=rc.budget*1.1) return '#E5A23D'; return '#E5484D'; };
    function ingRow(ing,i,gi){
      const swaps=(ing.alts||[]).filter(a=>a&&a.name).slice(0,3);
      return `<div class="rc-ing">
        <div><span class="nm">${esc(ing.name)}</span> <span class="g">${ing.grams?r0(ing.grams)+' g':''}</span></div>
        <div style="display:flex;align-items:center;gap:8px">${ing._kcal?`<span class="kc">${rCal(ing._kcal)} kcal${ing._matched?'':' ≈'}</span>`:''}${swaps.length?`<button class="swapbtn" data-sw="${i}:${gi}">swap</button>`:''}</div>
      </div>${swaps.length?`<div class="swaps" id="sw-${i}-${gi}" style="display:none">${swaps.map((a,ai)=>`<div class="swaprow"><span class="jb">${a.job==='cut'?'lighter':a.job==='diet'?'dietary':'on hand'}</span><span>${esc(a.name)}</span>${a.kcalDelta?`<span class="dl">${a.kcalDelta>0?'+':''}${rCal(a.kcalDelta)} kcal</span>`:''}<button data-apply="${i}:${gi}:${ai}">Use</button></div>`).join('')}</div>`:''}`;
    }
    function recipeCard(r,i){
      const per=r._per?r._per.calories:0, prot=r._per?r._per.protein_g:0, ings=r.ingredients||[];
      const have=ings.filter(x=>x.have), buy=ings.filter(x=>!x.have);
      const pct=rc.budget?Math.min(100,Math.round(per/rc.budget*100)):Math.min(100,Math.round(per/800*100));
      const fitTxt=rc.budget?(per<=rc.budget?`Fits your ${rc.budget} kcal budget`:`${rCal(per-rc.budget)} kcal over budget`):'';
      return `<div class="rc-card">
        <div class="rc-top">
          <div><div class="rc-name">${esc(r.name)}</div><div class="rc-meta">${r0(r.servings||rc.servings)} servings${r.time_min?' · '+r0(r.time_min)+' min':''}${r._estimated?' · some values estimated':''}</div></div>
          <div class="rc-kcal"><b>${rCal(per)}</b><span>kcal/serving</span></div>
        </div>
        <div class="fitbar"><div style="width:${pct}%;background:${fitColor(per)}"></div></div>
        <div class="fitlabel">${fitTxt}${fitTxt?' · ':''}${r0(prot)} g protein/serving</div>
        <div class="rc-sec">You have</div>${have.length?have.map(ing=>ingRow(ing,i,ings.indexOf(ing))).join(''):`<div class="rc-empty">—</div>`}
        ${buy.length?`<div class="rc-sec">Add to make it</div>`+buy.map(ing=>ingRow(ing,i,ings.indexOf(ing))).join(''):''}
        <div class="rc-sec">Method</div><ol class="steps">${(r.steps||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ol>
        ${r.note?`<div class="hint" style="margin-top:8px">${esc(r.note)}</div>`:''}
        <div class="rc-acts"><button class="btn" data-save="${i}">Save</button><button class="btn btn-primary" data-log="${i}">Log to ${esc(rc.meal)}</button></div>
        <div data-msg="${i}"></div>
      </div>`;
    }
    function renderResults(recipes){
      const out=body.querySelector('#rc-out');
      out.innerHTML=recipes.map((r,i)=>recipeCard(r,i)).join('')+`<button class="dashed-btn" id="rc-more">${IC_REFRESH} Suggest different recipes</button>`;
      out.querySelectorAll('[data-sw]').forEach(b=>b.onclick=()=>{ const [i,gi]=b.dataset.sw.split(':'); const box=out.querySelector('#sw-'+i+'-'+gi); if(box)box.style.display=box.style.display==='none'?'':'none'; });
      out.querySelectorAll('[data-apply]').forEach(b=>b.onclick=async()=>{ const [i,gi,ai]=b.dataset.apply.split(':').map(Number); const r=recipes[i],ing=r.ingredients[gi],alt=(ing.alts||[])[ai]; if(!alt)return; ing.name=alt.name; if(alt.job==='have')ing.have=true; ing.alts=[]; b.textContent='…'; try{ await costRecipe(r); }catch(_){ } renderResults(recipes); });
      out.querySelectorAll('[data-log]').forEach(b=>b.onclick=()=>{ const r=recipes[+b.dataset.log],per=r._per||{calories:0}; state.entries.push({id:uid(),date:viewDate,meal:rc.meal,name:r.name,grams:0,portion:'serving',unitCal:per.calories,servingLabel:'1 serving',calories:per.calories,protein_g:per.protein_g||0,carbs_g:per.carbs_g||0,fat_g:per.fat_g||0,sugar_g:0,source:'recipe'}); save(); sh.close(); });
      out.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>{ const r=recipes[+b.dataset.save],per=r._per||{calories:0},tot=r._total||{calories:0}; state.recipes.push({id:uid(),name:r.name,servings:Math.max(1,Math.round(+r.servings||rc.servings)),meal:rc.meal,note:r.note||'',time_min:r.time_min||null,per:{calories:per.calories,protein_g:per.protein_g||0,carbs_g:per.carbs_g||0,fat_g:per.fat_g||0},total:{calories:tot.calories,protein_g:tot.protein_g||0,carbs_g:tot.carbs_g||0,fat_g:tot.fat_g||0},ingredients:(r.ingredients||[]).map(x=>({name:x.name,grams:+x.grams||0,have:!!x.have,kcal:x._kcal||0,protein_g:x._prot||0,carbs_g:x._carb||0,fat_g:x._fat||0})),steps:(r.steps||[]).slice(),createdAt:Date.now()}); save(); const m=out.querySelector('[data-msg="'+b.dataset.save+'"]'); if(m)m.innerHTML=`<div class="saved-note" style="margin-top:8px">Saved to Recipes ✓</div>`; b.disabled=true; });
      out.querySelector('#rc-more').onclick=()=>generate();
    }

    inputView();
  }

  function renderBarcode(){
    camStop(); setTabs(false);
    let scanner=null, running=false;
    const stopScanner=()=>{ if(scanner&&running){ running=false; try{ return scanner.stop().then(()=>{try{scanner.clear();}catch(_){}}).catch(()=>{}); }catch(_){} } return Promise.resolve(); };
    body.innerHTML=`
      <div class="sub-head"><button class="circ-back" id="bc-back">${IC_BACK}</button><h3>Scan a barcode</h3></div>
      <div id="reader"></div>
      <div class="bc-hint" id="bc-hint">Point your camera at a product barcode</div>
      <div id="bc-stage"></div>`;
    const stage=body.querySelector('#bc-stage'), hint=body.querySelector('#bc-hint');
    body.querySelector('#bc-back').onclick=()=>{stopScanner();renderFood();};
    const onDetect=(txt)=>{ if(!running)return; stopScanner(); doLookup(txt); };
    const startScan=async()=>{
      if(typeof Html5Qrcode==='undefined'){ hint.textContent='Camera scanning isn’t available here — you can also type the barcode number into “Search for a food”.'; return; }
      await stopScanner();
      const opts={};
      if(typeof Html5QrcodeSupportedFormats!=='undefined'){
        opts.formatsToSupport=[Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E,Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39,Html5QrcodeSupportedFormats.ITF,Html5QrcodeSupportedFormats.QR_CODE];
      }
      try{
        scanner=new Html5Qrcode('reader',opts); running=true;
        hint.textContent='Point your camera at a product barcode';
        await scanner.start({facingMode:'environment'},
          {fps:10, qrbox:(w,h)=>{const bw=Math.min(w-20,300);return {width:bw,height:Math.max(110,Math.round(bw*0.55))};}, aspectRatio:1.3333, experimentalFeatures:{useBarCodeDetectorIfSupported:true}},
          onDetect, ()=>{});
      }catch(e){ running=false; hint.textContent='Couldn’t start the camera — you can also type the barcode number into “Search for a food”.'; }
    };
    async function doLookup(code){
      stage.innerHTML=`<div class="spinner">${ONDB?'Looking up product…':'Loading food database (first time only, ~10 MB)…'}</div>`;
      const r=await barcodeLookup(code);
      if(!r){ stage.innerHTML=`<div class="err">No product found for that barcode. Scan again, or enter it manually.</div><button class="btn btn-block" id="bc-man" style="margin-top:10px">Enter manually</button><button class="btn btn-block" id="bc-again" style="margin-top:8px">Scan again</button>`; stage.querySelector('#bc-man').onclick=renderManual; stage.querySelector('#bc-again').onclick=renderBarcode; return; }
      body.innerHTML=`<div class="sub-head"><button class="circ-back" id="bc-b2">${IC_BACK}</button><h3>Add item</h3></div><div id="bc-stage2"></div>`;
      body.querySelector('#bc-b2').onclick=renderBarcode;
      logPackaged(null,body.querySelector('#bc-stage2'),r,()=>sh.close());
    }
    startScan();
  }

  function addFromLib(id){
    const l=state.library.find(x=>x.id===id); if(!l)return;
    body.innerHTML=`<div class="sub-head"><button class="circ-back" id="lb-b2">${IC_BACK}</button><h3>Add item</h3></div><div id="lb-stage"></div>`;
    body.querySelector('#lb-b2').onclick=renderLibrary;
    const stage=body.querySelector('#lb-stage');
    if(l.perServing)logServing(null,stage,l.name,l.perServing.calories,l.perServing.portion,'library',()=>sh.close());
    else weighAndLog(null,stage,l.name,l.per_100g,'library',l.lastGrams,()=>sh.close());
  }
  function renderLibrary(){
    camStop(); setTabs(false);
    body.innerHTML=`<div class="sub-head"><button class="circ-back" id="lb-back">${IC_BACK}</button><h3>Library</h3></div>
      <div id="lib-body" style="margin-top:6px"></div>`;
    body.querySelector('#lb-back').onclick=renderFood;
    const lb=body.querySelector('#lib-body');
    const lib2=state.library, meals=state.meals||[], recs=state.recipes||[];
    if(!lib2.length && !meals.length && !recs.length){lb.innerHTML=`<div class="empty" style="border:none">Your library is empty. Tick “Save to library” after logging an item to reuse it here — then swipe a saved food left to drop it into a meal folder.</div>`;return;}
    let html='';
    if(recs.length){
      html+=`<div class="lib-sec">Recipes</div>`;
      html+=recs.map(r=>`<button class="meal-folder" data-rec="${r.id}">
        <span class="mf-ic">${IC_RECIPE}</span>
        <span class="mf-main"><span class="mf-name">${esc(r.name)}</span><span class="mf-sum">${r0(r.servings||1)} servings · ${r.per?rCal(r.per.calories):rCal(0)} kcal/serving</span></span>
        <span class="mf-chev">${IC_CHEVR}</span>
      </button>`).join('');
    }
    if(meals.length){
      html+=`<div class="lib-sec">My meals</div>`;
      html+=meals.map(mm=>`<button class="meal-folder" data-meal="${mm.id}">
        <span class="mf-ic">${IC_FOLDER}</span>
        <span class="mf-main"><span class="mf-name">${esc(mm.name)}</span><span class="mf-sum">${mealSummary(mm)}</span></span>
        <span class="mf-chev">${IC_CHEVR}</span>
      </button>`).join('');
    }
    if(lib2.length){
      html+=`<div class="lib-sec">${meals.length?'Single foods':'Saved foods'}</div>`;
      html+=lib2.map(l=>{
        const sub=l.perServing?`${rCal(l.perServing.calories)} kcal per ${esc(l.perServing.portion)}`:`${rCal(l.per_100g.calories)} kcal/100g`;
        return `<div class="swipe-wrap" data-id="${l.id}">
          <div class="swipe-actions">
            <button class="swipe-meal" data-meal-add="${l.id}" aria-label="Add to meal">${IC_FOLDERADD}<span>＋ Meal</span></button>
            <button class="swipe-del" data-del="${l.id}" aria-label="Delete">${IC_TRASH}<span>Delete</span></button>
          </div>
          <div class="recent-row swipe-row">
            <span class="recent-ic">${IC_FORK}</span>
            <div class="recent-main"><div class="rn">${esc(l.name)}</div><div class="rs">${esc(sub)}</div></div>
            <button class="recent-add" data-lib="${l.id}" aria-label="Add">${IC_PLUS}</button>
          </div>
        </div>`;
      }).join('');
    }
    lb.innerHTML=html;
    lb.querySelectorAll('[data-meal]').forEach(b=>b.onclick=()=>renderMeal(b.dataset.meal));
    lb.querySelectorAll('[data-rec]').forEach(b=>b.onclick=()=>{ const r=state.recipes.find(x=>x.id===b.dataset.rec); if(r)openRecipeDetail(r,renderLibrary); });
    const OPENX=-168;
    lb.querySelectorAll('.swipe-wrap').forEach(wrap=>{
      const id=wrap.dataset.id, row=wrap.querySelector('.swipe-row');
      const addBtn=wrap.querySelector('.recent-add'), delBtn=wrap.querySelector('.swipe-del'), mealBtn=wrap.querySelector('.swipe-meal');
      let startX=0,base=0,off=0,down=false,dragging=false,open=false,suppress=false;
      const apply=(x,anim)=>{row.style.transition=anim?'transform .2s ease':'';row.style.transform=`translateX(${x}px)`;};
      const close=()=>{open=false;apply(0,true);};
      const openIt=()=>{open=true;apply(OPENX,true);};
      const guard=()=>{suppress=true;setTimeout(()=>{suppress=false;},80);};
      const doDelete=()=>{ state.library=state.library.filter(x=>x.id!==id); save(); renderLibrary(); };
      delBtn.onclick=(e)=>{e.stopPropagation();doDelete();};
      mealBtn.onclick=(e)=>{e.stopPropagation(); const l=state.library.find(x=>x.id===id); close(); if(l)openMealPicker(l);};
      addBtn.onclick=(e)=>{ if(open||suppress){e.stopPropagation();e.preventDefault();close();return;} addFromLib(id); };
      row.addEventListener('pointerdown',e=>{ down=true;dragging=false;startX=e.clientX;base=open?OPENX:0;off=base; });
      row.addEventListener('pointermove',e=>{
        if(!down)return; const d=e.clientX-startX;
        if(!dragging && Math.abs(d)>6){ dragging=true; try{row.setPointerCapture(e.pointerId);}catch(_){} }
        if(dragging){ off=base+d; if(off>0)off=0; if(off<OPENX-22)off=OPENX-22; apply(off,false); e.preventDefault(); }
      });
      const endDrag=()=>{
        if(!down)return; down=false;
        if(dragging){ guard(); if(off<=-50){openIt();} else {close();} }
        else if(open){ guard(); close(); }
      };
      row.addEventListener('pointerup',endDrag);
      row.addEventListener('pointercancel',endDrag);
    });
  }
  function openMealPicker(l){
    const meals=state.meals||[];
    const ov=el(`<div class="picker-ov"><div class="picker-bd" id="pk-bd"></div>
      <div class="picker-card">
        <div class="picker-grip"></div>
        <div class="picker-title">Add to a meal</div>
        <div class="picker-sub">Put “${esc(l.name)}” into one of your meals.</div>
        <div style="display:flex;flex-direction:column;gap:9px;margin-top:16px">
          ${meals.map(mm=>`<button class="meal-folder" data-pick="${mm.id}" style="margin-bottom:0">
            <span class="mf-ic">${IC_FOLDER}</span>
            <span class="mf-main"><span class="mf-name" style="font-size:14.5px">${esc(mm.name)}</span><span class="mf-sum">${mealSummary(mm)}</span></span>
            <span class="mf-chev" style="color:var(--accent)">${IC_PLUS}</span>
          </button>`).join('')}
          <button class="meal-new" id="pk-new">${IC_PLUS}<span>New meal</span></button>
        </div>
      </div></div>`);
    $('modal-root').appendChild(ov);
    const _navEntry=navOpen(()=>ov.remove());
    const done=()=>{ navClose(_navEntry); ov.remove(); };
    ov.querySelector('#pk-bd').onclick=done;
    ov.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{
      const mm=state.meals.find(x=>x.id===b.dataset.pick); if(mm){mm.items.push(libToMealItem(l));save();}
      done(); renderLibrary();
    });
    ov.querySelector('#pk-new').onclick=()=>{
      const name=(prompt('Name this meal','My meal')||'').trim(); if(!name){return;}
      state.meals.push({id:uid(),name,items:[libToMealItem(l)]}); save();
      done(); renderLibrary();
    };
  }
  function renderMeal(mealId){
    camStop(); setTabs(false);
    const meal=()=>state.meals.find(x=>x.id===mealId);
    if(!meal()){renderLibrary();return;}
    let chosenMeal=defaultMeal();
    body.innerHTML=`<div class="sub-head"><button class="circ-back" id="ml-back">${IC_BACK}</button><h3 id="ml-title" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(meal().name)}</h3><button class="circ-back" id="ml-rename" aria-label="Rename" style="margin-left:auto">${IC_PENCIL}</button></div>
      <div id="ml-hero"></div>
      <div id="ml-items" style="margin-top:6px"></div>
      ${mealChips(chosenMeal)}
      <button class="btn btn-primary btn-block" id="ml-add" style="margin-top:14px"></button>
      <button class="btn btn-danger btn-block" id="ml-del" style="margin-top:10px">Delete this meal</button>`;
    body.querySelector('#ml-back').onclick=renderLibrary;
    const getMeal=wireMealChips(body);
    body.querySelector('#ml-rename').onclick=()=>{const m=meal();const nn=(prompt('Rename meal',m.name)||'').trim();if(nn){m.name=nn;save();renderMeal(mealId);}};
    body.querySelector('#ml-del').onclick=()=>{ if(confirm('Delete this meal folder? Saved single foods are not affected.')){state.meals=state.meals.filter(x=>x.id!==mealId);save();renderLibrary();} };
    function paint(){
      const m=meal(); if(!m){renderLibrary();return;}
      const tot=mealTotal(m);
      body.querySelector('#ml-hero').innerHTML=`<div class="meal-hero"><div><div class="mh-l">${m.items.length} ingredient${m.items.length===1?'':'s'}</div><div class="mh-s">Adjust portions below</div></div><div style="display:flex;align-items:baseline;gap:5px"><span class="mh-tot">${rCal(tot)}</span><span class="mh-u">kcal</span></div></div>`;
      const box=body.querySelector('#ml-items');
      if(!m.items.length){ box.innerHTML=`<div class="empty" style="border:none">No items yet. Swipe a saved food left in the Library and tap ＋ Meal to add it here.</div>`; }
      else box.innerHTML=m.items.map((it,i)=>{
        const kcal=rCal(mealItemKcal(it));
        const val=it.kind==='serving'?`${r1(it.servings)}<small> × ${esc(it.portion||'serving')}</small>`:`${r0(it.grams)}<small> g</small>`;
        return `<div class="ming">
          <button class="mg-rm" data-rm="${i}" aria-label="Remove">${IC_TRASH}</button>
          <div class="mg-main"><div class="mg-name">${esc(it.name)}</div><div class="mg-kcal">${kcal} kcal</div></div>
          <div class="stepper"><button data-dec="${i}">${IC_MINUS}</button><div class="sv">${val}</div><button data-inc="${i}">${IC_PLUS}</button></div>
        </div>`;
      }).join('');
      const step=(it,dir)=>{ if(it.kind==='serving'){it.servings=Math.max(0.5,r1((it.servings||1)+dir*0.5));} else {it.grams=Math.max(0,Math.round((it.grams||0)+dir*10));} };
      box.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>{step(m.items[+b.dataset.inc],1);save();paint();});
      box.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>{step(m.items[+b.dataset.dec],-1);save();paint();});
      box.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{m.items.splice(+b.dataset.rm,1);save();paint();});
      const addBtn=body.querySelector('#ml-add');
      addBtn.disabled=!m.items.length;
      addBtn.textContent=`Add ${m.items.length} item${m.items.length===1?'':'s'} · ${rCal(tot)} kcal`;
    }
    body.querySelector('#ml-add').onclick=()=>{
      const m=meal(); if(!m||!m.items.length)return; const meal2=getMeal();
      m.items.forEach(it=>{
        if(it.kind==='serving'){
          state.entries.push({id:uid(),date:viewDate,meal:meal2,name:it.name,grams:0,portion:it.portion,unitCal:it.unitCal,servingLabel:`${r1(it.servings)} ${it.portion||'serving'}`,calories:it.unitCal*it.servings,protein_g:0,carbs_g:0,fat_g:0,sugar_g:0,source:'meal'});
        }else{
          const g=it.grams||0;
          state.entries.push({id:uid(),date:viewDate,meal:meal2,name:it.name,grams:g,servingLabel:r1(g)+' g',calories:it.per.calories*g/100,protein_g:it.per.protein_g*g/100,carbs_g:it.per.carbs_g*g/100,fat_g:it.per.fat_g*g/100,sugar_g:(it.per.sugar_g||0)*g/100,source:'meal'});
        }
      });
      save(); sh.close(); render();
    };
    paint();
  }

  function renderManual(){
    camStop(); setTabs(false);
    body.innerHTML=`<div class="sub-head"><button class="circ-back" id="mn-back">${IC_BACK}</button><h3>Enter manually</h3></div>
      <div class="mfield"><label>Food name</label><input id="mn-name" placeholder="e.g. Avocado toast"></div>
      <div style="margin-top:12px"><label class="mlbl">Meal</label><div class="seg" id="mn-meal">${MEALS.map(x=>`<button data-meal="${x}"${x===defaultMeal()?' class="on"':''}>${x}</button>`).join('')}</div></div>
      <div class="mrow" style="margin-top:12px">
        <div class="mfield"><label>Serving</label><input type="number" inputmode="decimal" id="mn-amt" value="1"></div>
        <div class="mfield"><label>Unit</label><select id="mn-unit" class="munit">${UNITS.map(x=>`<option value="${x.u}"${x.u==='serving'?' selected':''}>${x.u}</option>`).join('')}</select></div>
        <div class="mfield"><label>Servings</label><input type="number" inputmode="decimal" id="mn-qty" value="1"></div>
      </div>
      <div class="hint" id="mn-est" style="margin-top:6px"></div>
      <div class="mcal"><label>Calories</label><div class="calwrap"><input type="number" inputmode="numeric" id="mn-cal" placeholder="0"><span class="calu">kcal</span></div></div>
      <div class="mrow" style="margin-top:12px">
        <div class="mfield"><label>Protein</label><input type="number" inputmode="decimal" id="mn-p" value="0"></div>
        <div class="mfield"><label>Carbs</label><input type="number" inputmode="decimal" id="mn-c" value="0"></div>
        <div class="mfield"><label>Fat</label><input type="number" inputmode="decimal" id="mn-f" value="0"></div>
      </div>
      <div class="hint" style="margin-top:6px">Enter the calories &amp; macros for one serving.</div>
      <div class="toggle-row" style="margin-top:12px"><input type="checkbox" id="mn-lib" style="width:auto"><label for="mn-lib" style="margin:0">Save to library</label></div>
      <button class="btn btn-primary btn-block" id="mn-save" style="margin-top:14px">Add food</button>`;
    body.querySelector('#mn-back').onclick=renderFood;
    let meal=defaultMeal();
    body.querySelectorAll('#mn-meal button').forEach(b=>b.onclick=()=>{meal=b.dataset.meal;body.querySelectorAll('#mn-meal button').forEach(x=>x.classList.toggle('on',x===b));});
    const amtEl=body.querySelector('#mn-amt'), unitEl=body.querySelector('#mn-unit'), qtyEl=body.querySelector('#mn-qty'), estEl=body.querySelector('#mn-est');
    const unitG=()=>(UNITS.find(x=>x.u===unitEl.value)||{g:1}).g;
    const perG=()=>(+amtEl.value||0)*unitG();
    function updEst(){
      const ps=perG(), qty=+qtyEl.value||1, tot=ps*qty;
      const isWt=unitEl.value==='gram'||unitEl.value==='ml', lbl=unitEl.value==='ml'?'ml':'g';
      estEl.textContent = isWt
        ? (qty>1?`Logging ${r0(ps)} ${lbl} × ${r1(qty)} = ${r0(tot)} ${lbl}`:`Logging ${r0(ps)} ${lbl}`)
        : `Each serving ≈ ${r0(ps)} g${qty>1?` · total ≈ ${r0(tot)} g`:''}`;
    }
    amtEl.oninput=updEst; qtyEl.oninput=updEst;
    unitEl.onchange=()=>{ amtEl.value = (unitEl.value==='gram'||unitEl.value==='ml') ? 100 : 1; updEst(); };
    updEst();
    body.querySelector('#mn-save').onclick=()=>{
      const name=body.querySelector('#mn-name').value.trim()||'Item';
      const amt=+amtEl.value||0, unit=unitEl.value, qty=+qtyEl.value||1, ps=perG(), grams=ps*qty;
      const cal=+body.querySelector('#mn-cal').value||0, p=+body.querySelector('#mn-p').value||0, c=+body.querySelector('#mn-c').value||0, f=+body.querySelector('#mn-f').value||0;
      let perLabel = unit==='gram' ? `${r0(ps)} g` : unit==='ml' ? `${r0(ps)} ml` : `${r1(amt)} ${unit}`;
      let servingLabel = qty>1 ? `${r1(qty)} × ${perLabel}` : perLabel;
      if(unit!=='gram' && unit!=='ml') servingLabel += ` (≈ ${r0(grams)} g)`;
      state.entries.push({id:uid(),date:viewDate,meal,name,grams,servingLabel,calories:cal*qty,protein_g:p*qty,carbs_g:c*qty,fat_g:f*qty,sugar_g:0,source:'manual'});
      if(body.querySelector('#mn-lib').checked && ps>0) addToLibrary(name,{calories:cal*100/ps,protein_g:p*100/ps,carbs_g:c*100/ps,fat_g:f*100/ps,sugar_g:0},ps);
      save();sh.close();
    };
  }

  function renderExercise(){
    camStop();
    const wkg=latestWeightKg();
    const acts=[...QUICK,...Object.keys(MET).filter(a=>!QUICK.includes(a))];
    let activity='Running',intensity='moderate',minutes=28;
    let customName='', customMET=null, customBusy=false, customErr='';   // free-typed "Other" sport
    const metFor=()=> (activity==='Other' && customMET) ? customMET[intensity] : MET[activity][intensity];
    const calc=()=>metFor()*(wkg||60)*(minutes/60);

    function chooseActivity(){
      setTabs(false);
      body.innerHTML=`
        <div class="sub-head"><button class="circ-back" id="ca-back">${IC_BACK}</button><h3>Choose activity</h3></div>
        <div class="chooser">${acts.map(a=>`<button class="choose-row${a===activity?' on':''}" data-a="${esc(a)}">
          <span class="choose-ic">${actMeta(a).ic}</span>
          <span class="choose-main"><span class="cn">${esc(a)}</span><span class="cc">${actMeta(a).cat}</span></span>
          ${a===activity?`<span class="choose-chk">${IC_CHECK}</span>`:''}</button>`).join('')}</div>`;
      body.querySelector('#ca-back').onclick=draw;
      body.querySelectorAll('.choose-row').forEach(r=>r.onclick=()=>{activity=r.dataset.a;draw();});
    }

    function draw(){
      setTabs(true);
      body.innerHTML=`
        <button class="act-pick" id="ex-actbtn"><span class="act-ic">${actMeta(activity).ic}</span>
          <div class="act-main"><div class="an">${esc(activity)}</div><div class="as">${actMeta(activity).cat}</div></div>
          ${IC_CHEV}</button>
        ${activity==='Other'?`
        <div class="add-card"><div class="add-card-h">What sport?</div>
          <div class="other-row">
            <input type="text" id="ex-sport" placeholder="e.g. rock climbing, pilates" value="${esc(customName)}" ${customBusy?'disabled':''}>
            <button class="btn-mini" id="ex-lookup" ${customBusy?'disabled':''}>${customBusy?'…':'Estimate'}</button>
          </div>
          ${customMET?`<div class="other-met">${esc(customName)} — <b>${customMET.light}</b> <s>light</s> · <b>${customMET.moderate}</b> <s>moderate</s> · <b>${customMET.vigorous}</b> <s>vigorous</s> MET</div>`
            :customErr?`<div class="other-err">${esc(customErr)}</div>`
            :`<div class="other-hint">Type your activity, then Estimate to pull calorie burn from AI.</div>`}
        </div>`:''}
        <div class="add-card"><div class="add-card-h">Intensity</div>
          <div class="seg" id="ex-int">
            <button data-i="light"${intensity==='light'?' class="on"':''}>Light</button>
            <button data-i="moderate"${intensity==='moderate'?' class="on"':''}>Moderate</button>
            <button data-i="vigorous"${intensity==='vigorous'?' class="on"':''}>Vigorous</button>
          </div></div>
        <div class="add-card"><div class="dur-h"><span>Duration</span><span class="dur-v"><b id="ex-minv">${minutes}</b> min</span></div>
          <div class="dur-row"><button class="step" id="ex-dec">${IC_MINUS}</button>
            <div class="nn-slider" id="ex-slider"><div class="nn-track"></div><div class="nn-fill" id="ex-fill"></div><div class="nn-thumb" id="ex-thumb"></div></div>
            <button class="step" id="ex-inc">${IC_PLUS}</button></div></div>
        <div class="burned"><div class="burned-l">Calories burned</div>
          <div class="burned-n" id="ex-kcal">${rCal(calc())}</div>
          <div class="burned-s">kcal · estimated from intensity, time${wkg?' &amp; weight':''}</div></div>
        ${wkg?'':'<div class="hint" style="text-align:center;margin-top:8px">Using an estimated 60&nbsp;kg — log your weight for a more accurate burn.</div>'}
        <button class="btn btn-primary btn-block" id="ex-save" style="margin-top:16px">Save exercise</button>`;
      const MINm=5,MAXm=120;
      const sl=body.querySelector('#ex-slider'), fillEl=body.querySelector('#ex-fill'), thumbEl=body.querySelector('#ex-thumb');
      const place=()=>{const f=(minutes-MINm)/(MAXm-MINm);fillEl.style.width=(f*100)+'%';thumbEl.style.left='calc('+f+' * (100% - 26px))';};
      const paint=()=>{body.querySelector('#ex-minv').textContent=minutes;body.querySelector('#ex-kcal').textContent=rCal(calc());place();};
      const setFromX=(x)=>{const r=sl.getBoundingClientRect();let f=(x-r.left-13)/(r.width-26);f=Math.max(0,Math.min(1,f));minutes=Math.round(MINm+f*(MAXm-MINm));paint();};
      let dragging=false;
      sl.addEventListener('pointerdown',e=>{dragging=true;try{sl.setPointerCapture(e.pointerId);}catch(_){}setFromX(e.clientX);});
      sl.addEventListener('pointermove',e=>{if(dragging)setFromX(e.clientX);});
      sl.addEventListener('pointerup',()=>{dragging=false;});
      sl.addEventListener('pointercancel',()=>{dragging=false;});
      place();
      body.querySelector('#ex-actbtn').onclick=chooseActivity;
      const spEl=body.querySelector('#ex-sport');
      if(spEl) spEl.oninput=e=>{ customName=e.target.value; customErr=''; };
      const lkEl=body.querySelector('#ex-lookup');
      if(lkEl) lkEl.onclick=async ()=>{
        const nm=((body.querySelector('#ex-sport')||{}).value||'').trim();
        if(!nm){ customErr='Type a sport first.'; customMET=null; draw(); return; }
        if(!state.settings.apiKey){ customErr='Add your Gemini API key in Settings to estimate.'; customMET=null; draw(); return; }
        customName=nm; customErr=''; customMET=null; customBusy=true; draw();
        try{ customMET=await aiSportMET(nm); }
        catch(err){ customErr=err.message||'Could not estimate — try again.'; }
        customBusy=false; draw();
      };
      body.querySelectorAll('#ex-int button').forEach(b=>b.onclick=()=>{intensity=b.dataset.i;body.querySelectorAll('#ex-int button').forEach(x=>x.classList.toggle('on',x===b));body.querySelector('#ex-kcal').textContent=rCal(calc());});
      body.querySelector('#ex-dec').onclick=()=>{minutes=Math.max(MINm,minutes-1);paint();};
      body.querySelector('#ex-inc').onclick=()=>{minutes=Math.min(MAXm,minutes+1);paint();};
      body.querySelector('#ex-save').onclick=()=>{
        const isCustom = activity==='Other' && customMET && customName.trim();
        const act = isCustom ? customName.trim() : activity;
        const met = metFor();
        const entry={id:uid(),date:viewDate,activity:act,intensity,minutes,met,caloriesBurned:calc()};
        if(isCustom){ entry.custom=true; entry.metMap={...customMET}; }
        state.exercise.push(entry);
        save();sh.close();
      };
    }
    draw();
  }

  tabs.forEach(b=>b.onclick=()=>{tabs.forEach(x=>x.classList.toggle('on',x===b));b.dataset.tab==='food'?renderFood():renderExercise();});
  renderFood();
}

