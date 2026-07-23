import {geminiJSON} from '../ai/recipe.js';
import {esc, rCal, uid} from '../helpers.js';
import {defaultMeal, mealChips, save, state, user, viewDate, wireMealChips} from '../state.js';
import {closeModal} from '../ui/nav.js';
import {IC_REFRESH, IC_TRASH} from './add-shared.js';
import {aiNutrition} from './photo.js';

/* ---------- EAT OUT helpers (menu vision, geo, Places proxy, dish suggest) ---------- */
export async function detectMenuDishes(b64, opts){
  opts=opts||{};
  const mealLine = opts.meal ? `The user is picking a ${opts.meal} option. ` : '';
  const budgetLine = opts.target!=null ? `They are aiming for about ${opts.target} kcal for this meal. ` : '';
  const prompt=`This photo shows a menu, a hawker/food-court signboard, or food on display at an eatery. ${mealLine}List the distinct orderable dishes you can see (max 12). Use the common Singapore name for each. ${budgetLine}For EACH dish give a realistic typical single-serving weight in grams ("grams"), nutrition per 100 g, and the estimated calories for that serving ("kcal"). Ignore prices, drinks (unless they are the only items), and non-food text. Respond with ONLY JSON, no markdown: {"dishes":[{"name":"","grams":0,"kcal":0,"per_100g":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"sugar_g":0}}]}. Return an empty array if no food or menu is visible.`;
  const out=await geminiJSON([{inline_data:{mime_type:'image/jpeg',data:b64}},{text:prompt}],4096);
  return Array.isArray(out.dishes)?out.dishes.filter(d=>d&&d.name).map(d=>({name:String(d.name).trim(),grams:+d.grams||0,kcal:+d.kcal||0,per100:d.per_100g||null})):[];
}
export function haversine(la1,lo1,la2,lo2){
  const R=6371000, t=Math.PI/180, dLa=(la2-la1)*t, dLo=(lo2-lo1)*t;
  const a=Math.sin(dLa/2)**2+Math.cos(la1*t)*Math.cos(la2*t)*Math.sin(dLo/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}
export let _lastLoc=null; // in-memory fix for this session
export async function permState(name){
  try{ if(navigator.permissions && navigator.permissions.query){ const s=await navigator.permissions.query({name}); return s.state; } }catch(_){}
  return 'unknown';
}
export function _loadPersistedLoc(){
  try{ const j=JSON.parse(localStorage.getItem('nomnom_lastloc')||'null'); return (j&&j.lat!=null)?j:null; }catch(_){ return null; }
}
export function _cachedLoc(maxAgeMs){
  if(_lastLoc && (Date.now()-_lastLoc.ts)<maxAgeMs) return _lastLoc;
  const p=_loadPersistedLoc();
  if(p && (Date.now()-(p.ts||0))<maxAgeMs) return p;
  return null;
}
// opts: {force:true} to bypass cache and re-fetch; {maxAge:ms} to widen/narrow reuse window
export function getLocation(opts){
  opts=opts||{};
  const maxAge = opts.maxAge!=null ? opts.maxAge : 30*60*1000; // reuse a fix up to 30 min old — avoids re-prompting on reopen
  return new Promise(async(resolve,reject)=>{
    if(!opts.force){ const c=_cachedLoc(maxAge); if(c) return resolve({lat:c.lat,lng:c.lng,cached:true}); }
    if(!navigator.geolocation) return reject(new Error('This device can’t share its location.'));
    if(await permState('geolocation')==='denied') return reject(new Error('Location is blocked for this site. Allow it in your browser or site settings, then try again.'));
    navigator.geolocation.getCurrentPosition(
      p=>{ const loc={lat:p.coords.latitude,lng:p.coords.longitude,ts:Date.now()}; _lastLoc=loc;
           try{ localStorage.setItem('nomnom_lastloc',JSON.stringify(loc)); }catch(_){}
           resolve({lat:loc.lat,lng:loc.lng}); },
      err=>reject(new Error(err&&err.code===1?'Location permission was denied — allow location access for this site, then try again.':'Couldn’t get your location. Make sure location is on, then try again.')),
      {enableHighAccuracy:true,timeout:12000,maximumAge:maxAge}
    );
  });
}
export async function nearbyPlaces(lat,lng){
  let res;
  try{ res=await fetch('/.netlify/functions/places',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lat,lng,radius:600})}); }
  catch(e){ throw new Error('Couldn’t reach the nearby-search service. This only works on the deployed app.'); }
  if(!res.ok){
    let msg='Nearby search failed ('+res.status+').';
    try{const e=await res.json(); if(e&&e.error) msg=e.error;}catch(_){}
    if(res.status===404) msg='Nearby search only works on the deployed app (the places function isn’t reachable here).';
    throw new Error(msg);
  }
  const data=await res.json();
  return Array.isArray(data.places)?data.places:[];
}
export async function suggestDishesForPlaces(places, opts){
  opts=opts||{};
  const mealLine = opts.meal ? `The user wants a ${opts.meal} option. ` : '';
  const budgetLine = opts.target!=null ? `Aim for dishes at or under about ${opts.target} kcal; one slightly-higher option per place is fine.` : `Keep dishes to sensible single-serving portions.`;
  const list = places.map((p,i)=>`${i}. ${p.name}${p.type?` (${String(p.type).replace(/_/g,' ')})`:''}`).join('\n');
  const prompt=`These are real food places near the user in Singapore, listed by index:
${list}

For EACH place, base your suggestions on that specific establishment's ACTUAL popular menu: if you recognise the named place (a chain, franchise, or well-known eatery), use its real signature/best-selling dishes; otherwise infer the most likely menu for that type and name of place. ${mealLine}Suggest 1-3 dishes a person could realistically order there for this meal. ${budgetLine} Use the dish's real menu name where you know it, otherwise the common Singapore name. For each dish give a realistic single-serving weight in grams ("grams"), nutrition per 100 g, and estimated calories ("kcal"). Respond with ONLY JSON, no markdown:
{"places":[{"i":0,"dishes":[{"name":"","grams":0,"kcal":0,"per_100g":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"sugar_g":0}}]}]}`;
  const out=await geminiJSON([{text:prompt}],4096);
  const byI={}; (out&&out.places||[]).forEach(pp=>{ if(pp&&pp.i!=null) byI[pp.i]=Array.isArray(pp.dishes)?pp.dishes.map(d=>({name:String(d.name||'').trim(),grams:+d.grams||0,kcal:+d.kcal||0,per100:d.per_100g||null})).filter(d=>d.name):[]; });
  return places.map((p,i)=>Object.assign({},p,{dishes:byI[i]||[]}));
}
export async function generateRecipes(ingredients, opts){
  opts=opts||{};
  const budgetLine = opts.budget ? `Each serving MUST be at or under ${opts.budget} kcal.` : `Keep each serving moderate in calories.`;
  const extrasLine = (opts.extras===0)
    ? `Do NOT add ingredients beyond the user's list, except basic staples (salt, pepper, water, cooking oil) which you may assume are on hand.`
    : `You MAY suggest up to ${opts.extras} additional ingredients the user would need to buy — mark these "have": false. Basic staples (salt, pepper, water, oil) may be assumed on hand and do not count toward this limit.`;
  const dietLine = (opts.diet&&opts.diet.length) ? `Dietary requirements: ${opts.diet.join(', ')}.` : '';
  const mealLine = opts.meal ? `Intended meal: ${opts.meal}.` : '';
  const prompt=`You are a nutrition-aware cooking assistant helping someone who wants filling meals that support gradual, healthy weight loss. Favour high-protein, high-fibre, higher-volume recipes with good satiety per calorie. Singapore-friendly ingredients are welcome. Never suggest skipping a meal or extreme tiny portions.

Ingredients the user already has: ${ingredients.join(', ')||'(none listed)'}.
Servings wanted: ${opts.servings||2}.
${mealLine}
${budgetLine}
${extrasLine}
${dietLine}

Suggest 2-3 realistic recipes. For EACH ingredient provide an integer "grams" and your own rough "kcal" and "protein_g" for that amount (used only as a fallback estimate). Set "have": true if the ingredient is in the user's list or a basic staple, otherwise false. Where a sensible swap exists, include up to 3 "alts", each {"name","job","kcalDelta"} where job is "have" (use something on hand / a common substitute), "cut" (lower calorie), or "diet" (allergy/dietary), and kcalDelta is the approximate kcal change versus the ingredient it replaces (negative = fewer). Do not invent alternatives where none make sense.

Respond with ONLY JSON, no markdown:
{"recipes":[{"name":"","servings":2,"time_min":20,"meal":"","note":"","ingredients":[{"name":"","grams":0,"have":true,"kcal":0,"protein_g":0,"alts":[{"name":"","job":"have","kcalDelta":0}]}],"steps":[""]}]}`;
  const out=await geminiJSON([{text:prompt}],8192);
  return Array.isArray(out.recipes)?out.recipes:[];
}
export function showConfirm(m,stage,result,onDone,presetMeal){
  const items=result.items.map(it=>({
    name:it.name||'Item',
    per:{calories:+(it.per_100g?.calories||0),protein_g:+(it.per_100g?.protein_g||0),carbs_g:+(it.per_100g?.carbs_g||0),fat_g:+(it.per_100g?.fat_g||0),sugar_g:+(it.per_100g?.sugar_g||0)},
    grams:+(it.estimated_grams||100),
    conf:(it.confidence||'').toLowerCase(),
    estName:it.name||'Item'   // name the current nutrition was estimated for
  }));
  function rowHtml(it,i){
    const cal=rCal(it.per.calories*it.grams/100);
    const dirty=it.name.trim() && it.name.trim()!==it.estName;
    const lowTag=it.conf==='low'?`<span class="conf-tag">Low confidence</span>`:'';
    return `<div class="item-edit" data-row="${i}">
      <div class="ie-head">
        <input class="ie-name" data-n="${i}" value="${esc(it.name)}" placeholder="Food name" autocomplete="off">
        <button class="ie-del" data-del="${i}" aria-label="Remove item">${IC_TRASH}</button>
      </div>
      <div class="ie-meta">
        <span class="ie-per">${rCal(it.per.calories)} kcal/100g</span>
        ${lowTag}
        <button class="ie-reest" data-reest="${i}" style="${dirty?'':'display:none'}">${IC_REFRESH}Re-estimate</button>
      </div>
      <div class="field-row" style="margin-top:10px">
        <div class="field"><label>Weight (g)</label><input type="number" inputmode="decimal" data-g="${i}" value="${it.grams}"></div>
        <div class="field"><label>Calories</label><input type="text" data-c="${i}" value="${cal}" disabled></div>
      </div>
      <div class="ie-rowerr" data-err="${i}" style="display:none"></div>
    </div>`;
  }
  function paint(){
    const named=items.filter(it=>it.name.trim());
    stage.innerHTML=`
      ${result.assumptions?`<div class="note">${esc(result.assumptions)}</div>`:''}
      ${items.length?items.map(rowHtml).join(''):'<div class="empty" style="border:none">No items left. Add one below or go back to rescan.</div>'}
      <button class="add-missing" id="add-missing">+ Add an item the AI missed</button>
      ${mealChips(presetMeal||defaultMeal())}
      <div class="toggle-row"><input type="checkbox" id="savelib" style="width:auto"><label for="savelib" style="margin:0">Save these to library</label></div>
      <div class="field"><button class="btn btn-primary btn-block" id="confirm-save"${named.length?'':' disabled'}>Log ${named.length} item${named.length===1?'':'s'}</button></div>`;
    const getMeal=wireMealChips(stage);

    // weight -> recompute calories live
    stage.querySelectorAll('[data-g]').forEach(inp=>inp.oninput=()=>{
      const i=+inp.dataset.g; items[i].grams=+inp.value||0;
      stage.querySelector(`[data-c="${i}"]`).value=rCal(items[i].per.calories*items[i].grams/100);
    });
    // name edits -> update model + toggle this row's Re-estimate button (no repaint, keeps focus)
    stage.querySelectorAll('[data-n]').forEach(inp=>inp.oninput=()=>{
      const i=+inp.dataset.n; items[i].name=inp.value;
      const btn=stage.querySelector(`[data-reest="${i}"]`);
      const dirty=inp.value.trim() && inp.value.trim()!==items[i].estName;
      if(btn)btn.style.display=dirty?'':'none';
    });
    // delete
    stage.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ items.splice(+b.dataset.del,1); paint(); });
    // re-estimate (text-only, keeps grams)
    stage.querySelectorAll('[data-reest]').forEach(b=>b.onclick=async()=>{
      const i=+b.dataset.reest; const name=items[i].name.trim(); if(!name)return;
      const errEl=stage.querySelector(`[data-err="${i}"]`);
      if(!state.settings.apiKey){ errEl.style.display='';errEl.textContent='Add your Gemini API key in Settings to re-estimate.';return; }
      errEl.style.display='none'; b.disabled=true; const html=b.innerHTML; b.innerHTML=`${IC_REFRESH}Estimating…`;
      try{
        const ai=await aiNutrition(name);
        if(!ai||!ai.per_100g||!(+ai.per_100g.calories)){ throw new Error('Couldn’t estimate that. Try a clearer name.'); }
        items[i].per={calories:+ai.per_100g.calories||0,protein_g:+ai.per_100g.protein_g||0,carbs_g:+ai.per_100g.carbs_g||0,fat_g:+ai.per_100g.fat_g||0,sugar_g:+ai.per_100g.sugar_g||0};
        items[i].name=ai.name||name; items[i].estName=items[i].name; items[i].conf='';  // user-corrected: clear low flag
        paint();
      }catch(e){ b.disabled=false; b.innerHTML=html; errEl.style.display='';errEl.textContent=e.message||'Re-estimate failed.'; }
    });
    // add a blank row to fill in + estimate
    stage.querySelector('#add-missing').onclick=()=>{
      items.push({name:'',per:{calories:0,protein_g:0,carbs_g:0,fat_g:0,sugar_g:0},grams:100,conf:'',estName:''});
      paint();
      const inputs=stage.querySelectorAll('[data-n]'); const last=inputs[inputs.length-1]; if(last)last.focus();
    };
    // save (only rows with a name)
    stage.querySelector('#confirm-save').onclick=()=>{
      const lib=stage.querySelector('#savelib').checked; const meal=getMeal();
      const toLog=items.filter(it=>it.name.trim());
      if(!toLog.length)return;
      toLog.forEach(it=>{
        state.entries.push({id:uid(),date:viewDate,meal,name:it.name.trim(),grams:it.grams,
          calories:it.per.calories*it.grams/100,protein_g:it.per.protein_g*it.grams/100,
          carbs_g:it.per.carbs_g*it.grams/100,fat_g:it.per.fat_g*it.grams/100,sugar_g:it.per.sugar_g*it.grams/100,source:'photo'});
        if(lib)addToLibrary(it.name.trim(),it.per,it.grams);
      });
      save(); onDone?onDone():closeModal(m);
    };
  }
  paint();
}
export function addToLibrary(name,per,grams){
  const ex=state.library.find(l=>l.name.toLowerCase()===name.toLowerCase());
  if(ex){ex.per_100g=per;ex.lastGrams=grams;delete ex.perServing;}
  else state.library.push({id:uid(),name,per_100g:per,lastGrams:grams});
}
export function addToLibraryServing(name,calories,portion){
  const ex=state.library.find(l=>l.name.toLowerCase()===name.toLowerCase());
  if(ex){ex.perServing={calories,portion};delete ex.per_100g;delete ex.lastGrams;}
  else state.library.push({id:uid(),name,perServing:{calories,portion}});
}
/* log a per-serving item (local database / per-serving library) */
export function logServing(m,stage,name,calories,portion,source,onDone){
  stage.innerHTML=`
    <div class="item-edit"><div class="nm">${esc(name)} <span style="color:var(--text-soft);font-weight:400">· ${rCal(calories)} kcal per ${esc(portion)}</span></div></div>
    <div class="field"><label>Quantity (number of ${esc(portion)})</label><input type="number" inputmode="decimal" id="ls-q" value="1"></div>
    <div class="hint" id="ls-total"></div>
    ${mealChips(defaultMeal())}
    <div class="toggle-row"><input type="checkbox" id="ls-lib" style="width:auto"><label for="ls-lib" style="margin:0">Save to library</label></div>
    <div class="field"><button class="btn btn-primary btn-block" id="ls-save">Log item</button></div>`;
  const getMeal=wireMealChips(stage);
  const qi=stage.querySelector('#ls-q');
  const rc=()=>stage.querySelector('#ls-total').textContent=`= ${rCal((+qi.value||0)*calories)} kcal`;
  qi.oninput=rc; rc();
  stage.querySelector('#ls-save').onclick=()=>{
    const qty=+qi.value||0;
    state.entries.push({id:uid(),date:viewDate,meal:getMeal(),name,grams:0,portion,unitCal:calories,servingLabel:`${qty} ${portion}`,
      calories:qty*calories,protein_g:0,carbs_g:0,fat_g:0,sugar_g:0,source});
    if(stage.querySelector('#ls-lib').checked)addToLibraryServing(name,calories,portion);
    save(); onDone?onDone():closeModal(m);
  };
}

