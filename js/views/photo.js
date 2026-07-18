import {geminiJSON} from '../ai/recipe.js';
import {VISION_PROMPT} from '../data/hpb.js';
import {DB} from '../data/met-table.js';
import {esc} from '../helpers.js';
import {save, state} from '../state.js';
import {openModal} from '../ui/nav.js';
import {IC_UPLOAD} from './add-shared.js';
import {permState, showConfirm} from './eat-out-helpers.js';
import {openManual} from './manual.js';
import {openSettings} from './settings.js';

/* ---------- PHOTO ---------- */
export function loadImage(file){return new Promise((res,rej)=>{const img=new Image();const u=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(u);res(img);};img.onerror=rej;img.src=u;});}
export async function toJpegBase64(file,maxDim=1100,q=0.8){
  const img=await loadImage(file);
  const sc=Math.min(1,maxDim/Math.max(img.width,img.height));
  const c=document.createElement('canvas');
  c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',q).split(',')[1];
}
export let _camStream=null;
export async function camStart(v){
  if(await permState('camera')==='denied'){ _camStream=null; return false; }
  try{ _camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}); v.srcObject=_camStream; await v.play(); return true; }
  catch(e){ _camStream=null; return false; }
}
export function camStop(){ if(_camStream){_camStream.getTracks().forEach(t=>t.stop());_camStream=null;} }
export function camCapture(v){
  const w=v.videoWidth||1100,h=v.videoHeight||1100,sc=Math.min(1,1100/Math.max(w,h));
  const c=document.createElement('canvas'); c.width=Math.round(w*sc); c.height=Math.round(h*sc);
  c.getContext('2d').drawImage(v,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',0.8).split(',')[1];
}
export function openPhoto(){
  if(!state.settings.apiKey){
    const m=openModal('Scan a photo',`<div class="err">No API key set. Add your Google Gemini API key in Settings first.</div><div class="field"><button class="btn btn-primary btn-block" id="go-set">Open Settings</button></div>`);
    m.querySelector('#go-set').onclick=()=>{m.remove();openSettings();};
    return;
  }
  const m=openModal('Scan food',`
    <div class="scan-frame" id="ph-cam"><div class="corners"><span></span><span></span><span></span><span></span></div><div class="scan-line"></div><div class="scan-hint">Point your camera at your meal</div></div>
    <button class="dashed-btn" id="ph-gal-btn">${IC_UPLOAD} Upload a photo instead</button>
    <input type="file" accept="image/*" capture="environment" id="photo-cam" style="display:none">
    <input type="file" accept="image/*" id="photo-gal" style="display:none">
    <div id="photo-stage"></div>
  `);
  const stage=()=>m.querySelector('#photo-stage');
  async function runPhoto(b64){
    stage().innerHTML=`<div class="spinner">Analyzing photo…</div>`;
    try{
      const result=await analyzePhoto(b64);
      if(!result.items || !result.items.length){
        stage().innerHTML=`<div class="err">No food detected. ${esc(result.assumptions||'')}</div>
          <div class="btn-row"><button class="btn" id="retry">Try another photo</button></div>`;
        stage().querySelector('#retry').onclick=()=>{m.remove();openPhoto();};
        return;
      }
      showConfirm(m,stage(),result);
    }catch(e){
      stage().innerHTML=`<div class="err">${esc(e.message||'Request failed.')}</div>
        <div class="btn-row"><button class="btn" id="retry">Try again</button><button class="btn" id="man">Enter manually</button></div>`;
      stage().querySelector('#retry').onclick=()=>runPhoto(b64);
      stage().querySelector('#man').onclick=()=>{m.remove();openManual();};
    }
  }
  const handle=async(ev)=>{
    const file=ev.target.files[0]; if(!file)return;
    let b64;
    try{ b64=await toJpegBase64(file); }
    catch(_){ stage().innerHTML=`<div class="err">Could not read that image.</div>`; return; }
    runPhoto(b64);
  };
  m.querySelector('#ph-cam').onclick=()=>m.querySelector('#photo-cam').click();
  m.querySelector('#ph-gal-btn').onclick=()=>m.querySelector('#photo-gal').click();
  m.querySelector('#photo-cam').onchange=handle;
  m.querySelector('#photo-gal').onchange=handle;
}
export function genConfig(model){
  const cfg={responseMimeType:'application/json',maxOutputTokens:2048};
  if(/flash/i.test(model)) cfg.thinkingConfig={thinkingBudget:0}; // disable "thinking" so JSON isn't truncated
  return cfg;
}
export async function analyzePhoto(b64){
  const model=state.settings.model||'gemini-2.5-flash';
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(state.settings.apiKey)}`;
  const res=await fetch(url,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      contents:[{parts:[
        {inline_data:{mime_type:'image/jpeg',data:b64}},
        {text:VISION_PROMPT}
      ]}],
      generationConfig:genConfig(model)
    })
  });
  if(!res.ok){
    let msg='Gemini API error '+res.status;
    try{const e=await res.json();if(e.error&&e.error.message)msg=e.error.message;}catch(_){}
    throw new Error(msg);
  }
  const data=await res.json();
  const cand=(data.candidates||[])[0];
  if(cand && cand.finishReason==='MAX_TOKENS') throw new Error('The AI response was cut off. Tap to try again, or use a clearer, closer photo.');
  let text=cand && cand.content && cand.content.parts ? cand.content.parts.map(p=>p.text).filter(Boolean).join('\n').trim() : '';
  if(!text)throw new Error('Empty response from Gemini. Try again or enter the food manually.');
  text=text.replace(/```json|```/g,'').trim();
  const s=text.indexOf('{'), e=text.lastIndexOf('}');
  if(s>=0&&e>=0)text=text.slice(s,e+1);
  try{ return JSON.parse(text); }
  catch(err){ throw new Error('Could not read the AI response (it may have been cut off). Please try again.'); }
}
export async function aiNutrition(name){
  const model=state.settings.model||'gemini-2.5-flash';
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(state.settings.apiKey)}`;
  const prompt=`Give typical nutrition per 100 grams for this food, assuming the common Singapore version if relevant: "${name}", and the typical weight in grams of one small, one medium (average), and one large single serving or piece, with a short unit label like "apple","banana","bowl","plate","slice". Respond with ONLY JSON, no markdown: {"name":"","per_100g":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"sugar_g":0},"serving":{"label":"","small_g":0,"medium_g":0,"large_g":0}}. If it is not a food, set calories to 0.`;
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:genConfig(model)})});
  if(!res.ok){let msg='Gemini API error '+res.status;try{const e=await res.json();if(e.error&&e.error.message)msg=e.error.message;}catch(_){}throw new Error(msg);}
  const data=await res.json();
  const cand=(data.candidates||[])[0];
  if(cand && cand.finishReason==='MAX_TOKENS') throw new Error('The AI response was cut off. Please try again.');
  let text=cand&&cand.content&&cand.content.parts?cand.content.parts.map(p=>p.text).filter(Boolean).join('\n').trim():'';
  text=text.replace(/```json|```/g,'').trim();const s=text.indexOf('{'),e=text.lastIndexOf('}');if(s>=0&&e>=0)text=text.slice(s,e+1);
  let out; try{ out=JSON.parse(text); }catch(err){ throw new Error('Could not read the AI response. Please try again.'); }
  const p=normPortion(out.serving);
  if(p && out.name) portionCacheSet(out.name, p);   // reuse this weight for future logs of the same food
  out.portion=p;
  return out;
}
/* Normalise an AI serving object -> {label, small, medium, large} grams (medium = average). */
export function normPortion(o){
  if(!o) return null;
  const g=v=>{ const n=Math.round(+v); return isFinite(n)&&n>0?n:0; };
  let s=g(o.small_g), m=g(o.medium_g), l=g(o.large_g);
  const base=m||s||l; if(!base) return null;
  if(!m)m=base; if(!s)s=Math.max(1,Math.round(m*0.7)); if(!l)l=Math.round(m*1.35);
  s=Math.min(s,m); l=Math.max(l,m);   // keep S ≤ M ≤ L
  let label=(typeof o.label==='string'&&o.label.trim())?o.label.trim().slice(0,24):'serving';
  return {label,small:s,medium:m,large:l};
}
/* Persisted, capped cache of typical portion weights, keyed by lowercased food name. */
export function portionCacheGet(name){ const k=(name||'').toLowerCase().trim(); return (k&&state.portionCache&&state.portionCache[k])||null; }
export function portionCacheSet(name,val){
  const k=(name||'').toLowerCase().trim(); if(!k||!val) return;
  if(!state.portionCache) state.portionCache={};
  state.portionCache[k]=val;
  const keys=Object.keys(state.portionCache);
  if(keys.length>400){ for(const kk of keys.slice(0,keys.length-400)) delete state.portionCache[kk]; }
  save();
}
/* One cached AI call for just a typical portion weight (used for DB foods with no serving weight). */
export async function aiServingWeight(name){
  const cached=portionCacheGet(name); if(cached) return cached;
  const prompt=`For the food "${name}" (common Singapore version if relevant), give the typical weight in grams of one small, one medium (average) and one large single serving or piece, plus a short unit label like "apple","banana","bowl","plate","slice". Respond with ONLY JSON, no markdown: {"label":"","small_g":0,"medium_g":0,"large_g":0}.`;
  const out=await geminiJSON([{text:prompt}],256);
  const p=normPortion(out); if(!p) throw new Error('No weight estimate available.');
  portionCacheSet(name,p); return p;
}
