import {ONDB} from '../data/opennutrition.js';
import {esc, r0, r1, uid} from '../helpers.js';
import {defaultMeal, mealChips, portionPicker, save, servingWidget, state, viewDate, wireMealChips, wirePortion, wireServing} from '../state.js';
import {closeModal, openModal} from '../ui/nav.js';
import {IC_MINUS, IC_PLUS} from './add-shared.js';
import {addToLibrary} from './eat-out-helpers.js';
import {openManual} from './manual.js';
import {aiServingWeight, portionCacheGet} from './photo.js';
import {barcodeLookup} from './search.js';

/* ---------- BARCODE ---------- */
export function openBarcode(){
  const m=openModal('Scan a barcode',`
    <div id="reader"></div>
    <div class="bc-hint" id="bc-hint">Point your camera at a product barcode</div>
    <div id="bc-stage"></div>
  `);
  const stage=m.querySelector('#bc-stage'), hint=m.querySelector('#bc-hint');
  let scanner=null, running=false;
  const stopScanner=()=>{ if(scanner&&running){running=false;try{return scanner.stop().then(()=>{try{scanner.clear();}catch(_){}}).catch(()=>{});}catch(_){}} return Promise.resolve(); };
  const startScan=async()=>{
    if(typeof Html5Qrcode==='undefined'){hint.textContent='Camera scanning isn’t available here — type the barcode number into “Search for a food”.';return;}
    await stopScanner();
    const opts={};
    if(typeof Html5QrcodeSupportedFormats!=='undefined'){opts.formatsToSupport=[Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E,Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39,Html5QrcodeSupportedFormats.ITF,Html5QrcodeSupportedFormats.QR_CODE];}
    try{
      scanner=new Html5Qrcode('reader',opts); running=true;
      await scanner.start({facingMode:'environment'},
        {fps:10,qrbox:(w,h)=>{const bw=Math.min(w-20,300);return {width:bw,height:Math.max(110,Math.round(bw*0.55))};},aspectRatio:1.3333,experimentalFeatures:{useBarCodeDetectorIfSupported:true}},
        (txt)=>{ if(!running)return; stopScanner(); doLookup(txt); },()=>{});
    }catch(e){running=false;hint.textContent='Couldn’t start the camera — type the barcode number into “Search for a food”.';}
  };
  async function doLookup(code){
    await stopScanner();
    m.querySelector('#reader').innerHTML='';
    stage.innerHTML=`<div class="spinner">${ONDB?'Looking up product…':'Loading food database (first time only, ~10 MB)…'}</div>`;
    const r=await barcodeLookup(code);
    if(!r){stage.innerHTML=`<div class="err">Product not found in OpenNutrition or Open Food Facts. Try entering it manually.</div><div class="btn-row"><button class="btn" id="man">Enter manually</button></div>`;stage.querySelector('#man').onclick=()=>{m.remove();openManual();};return;}
    logPackaged(m,stage,r);
  }
  startScan();
}

/* shared: weigh a known per-100g item and log */
export function weighAndLog(m,stage,name,per,source,defGrams,onDone,portion){
  per={calories:+per.calories||0,protein_g:+per.protein_g||0,carbs_g:+per.carbs_g||0,fat_g:+per.fat_g||0,sugar_g:+per.sugar_g||0};
  stage.innerHTML=`
    <div class="item-edit"><div class="nm">${esc(name)} <span style="color:var(--text-soft);font-weight:400">· ${r0(per.calories)} kcal/100g</span></div></div>
    <div id="wl-serve"></div>
    ${mealChips(defaultMeal())}
    <div class="toggle-row"><input type="checkbox" id="wl-lib" style="width:auto"><label for="wl-lib" style="margin:0">Save to library</label></div>
    <div class="field"><button class="btn btn-primary btn-block" id="wl-save">Log item</button></div>`;
  const serve=stage.querySelector('#wl-serve');
  let sv;
  function mount(mode){
    if(mode==='portion' && portion){
      serve.innerHTML=portionPicker(portion);
      sv=wirePortion(serve,per,portion);
      const mb=serve.querySelector('#pp-manual'); if(mb)mb.onclick=()=>mount('manual');
    }else{
      serve.innerHTML=servingWidget()+(portion?`<button type="button" class="linkbtn" id="wl-back2p" style="margin-top:2px">Back to portion sizes</button>`:'');
      sv=wireServing(serve,per,defGrams);
      const bp=serve.querySelector('#wl-back2p'); if(bp)bp.onclick=()=>mount('portion');
    }
  }
  mount(portion?'portion':'manual');
  const getMeal=wireMealChips(stage);
  stage.querySelector('#wl-save').onclick=()=>{
    const g=sv.grams();
    state.entries.push({id:uid(),date:viewDate,meal:getMeal(),name,grams:g,servingLabel:sv.desc(),
      calories:per.calories*g/100,protein_g:per.protein_g*g/100,carbs_g:per.carbs_g*g/100,fat_g:per.fat_g*g/100,sugar_g:per.sugar_g*g/100,source});
    if(stage.querySelector('#wl-lib').checked)addToLibrary(name,per,g);
    save(); onDone?onDone():closeModal(m);
  };
}
/* Decide how to open the weigh screen for a per-100g food:
   known serving weight -> manual default; else use a cached/AI typical portion (S/M/L chips);
   no key / lookup fails -> plain manual. Costs at most one cached AI call per unique food. */
export function openWeighPer(stage,name,per,source,defGrams,onDone){
  if(defGrams){ weighAndLog(null,stage,name,per,source,defGrams,onDone); return; }
  const cached=portionCacheGet(name);
  if(cached){ weighAndLog(null,stage,name,per,source,null,onDone,cached); return; }
  if(!state.settings.apiKey){ weighAndLog(null,stage,name,per,source,null,onDone); return; }
  stage.innerHTML=`<div class="spinner">Estimating a typical portion…</div>`;
  aiServingWeight(name)
    .then(p=>weighAndLog(null,stage,name,per,source,null,onDone,p))
    .catch(()=>weighAndLog(null,stage,name,per,source,null,onDone));
}

/* Log a packaged / barcode item, serving-first.
   r = {name, per (per-100g), source, servingGrams, servingLabel, packageGrams}
   Defaults to 1 serving; offers whole-package and custom-amount. Falls back to the
   plain per-100g grams widget when the product has no serving weight at all. */
export function logPackaged(m,stage,r,onDone){
  const per={calories:+r.per.calories||0,protein_g:+r.per.protein_g||0,carbs_g:+r.per.carbs_g||0,fat_g:+r.per.fat_g||0,sugar_g:+r.per.sugar_g||0};
  const sg=(+r.servingGrams>0)?+r.servingGrams:null;
  const pkg=(+r.packageGrams>0)?+r.packageGrams:null;
  if(!sg){ return weighAndLog(m,stage,r.name,per,r.source,pkg||undefined,onDone); }   // no serving info -> old behaviour
  const sLabel=r.servingLabel||`${r1(sg)} g`;
  const kcalFor=g=>r0(per.calories*g/100);
  let basis='serving', count=1;                     // count = number of servings
  const bases=[['serving','1 serving']];
  if(pkg) bases.push(['package','Whole package']);
  bases.push(['custom','Custom amount']);
  stage.innerHTML=`
    <div class="item-edit"><div class="nm">${esc(r.name)}</div>
      <div style="color:var(--text-soft);font-size:12.5px;margin-top:3px">Serving ${esc(sLabel)} · ${kcalFor(sg)} kcal${pkg?` &nbsp;·&nbsp; Package ${r1(pkg)} g · ${kcalFor(pkg)} kcal`:''}</div></div>
    <div class="field"><label>How much did you have?</label>
      <div class="chips" id="pk-basis">${bases.map(([b,l])=>`<button class="chip${b===basis?' sel':''}" data-b="${b}">${l}</button>`).join('')}</div></div>
    <div class="field" id="pk-serv"><label>Number of servings</label>
      <div class="pstep"><button id="pk-dn">${IC_MINUS}</button><span class="val" id="pk-ct">1</span><button id="pk-up">${IC_PLUS}</button></div></div>
    <div id="pk-custom" style="display:none">${servingWidget()}</div>
    <div class="hint" id="pk-total"></div>
    ${mealChips(defaultMeal())}
    <div class="toggle-row"><input type="checkbox" id="pk-lib" style="width:auto"><label for="pk-lib" style="margin:0">Save to library</label></div>
    <div class="field"><button class="btn btn-primary btn-block" id="pk-save">Log item</button></div>`;
  const getMeal=wireMealChips(stage);
  const svWrap=stage.querySelector('#pk-serv'), customWrap=stage.querySelector('#pk-custom'),
        total=stage.querySelector('#pk-total'), ctEl=stage.querySelector('#pk-ct');
  const sv=wireServing(customWrap,per,sg);          // custom grams widget, pre-filled to one serving
  const curGrams=()=> basis==='serving' ? sg*count : basis==='package' ? pkg : sv.grams();
  const curDesc=()=> basis==='serving' ? `${r1(count)} serving${count===1?'':'s'} (${r1(sg*count)} g)`
                    : basis==='package' ? `whole package (${r1(pkg)} g)` : sv.desc();
  const recompute=()=>{ const g=curGrams(); total.textContent=`= ${r0(per.calories*g/100)} kcal · ${r1(g)} g`; };
  const syncBasis=()=>{ svWrap.style.display=basis==='serving'?'':'none'; customWrap.style.display=basis==='custom'?'':'none'; recompute(); };
  stage.querySelectorAll('#pk-basis .chip').forEach(c=>c.onclick=()=>{ basis=c.dataset.b; stage.querySelectorAll('#pk-basis .chip').forEach(x=>x.classList.toggle('sel',x===c)); syncBasis(); });
  stage.querySelector('#pk-up').onclick=()=>{ count=r1(Math.min(50,count+0.5)); ctEl.textContent=r1(count); recompute(); };
  stage.querySelector('#pk-dn').onclick=()=>{ count=r1(Math.max(0.5,count-0.5)); ctEl.textContent=r1(count); recompute(); };
  customWrap.addEventListener('input',recompute);
  syncBasis();
  stage.querySelector('#pk-save').onclick=()=>{
    const g=curGrams();
    state.entries.push({id:uid(),date:viewDate,meal:getMeal(),name:r.name,grams:g,servingLabel:curDesc(),
      calories:per.calories*g/100,protein_g:per.protein_g*g/100,carbs_g:per.carbs_g*g/100,fat_g:per.fat_g*g/100,sugar_g:per.sugar_g*g/100,source:r.source});
    if(stage.querySelector('#pk-lib').checked)addToLibrary(r.name,per,sg);
    save(); onDone?onDone():closeModal(m);
  };
}

