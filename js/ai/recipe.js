import {ONDB, ensureONDB} from '../data/opennutrition.js';
import {state} from '../state.js';
import {aiNutrition} from '../views/photo.js';

/* ---------- RECIPE: AI + costing helpers (cook with what I have) ---------- */
export async function geminiJSON(parts, maxTok){
  const model=state.settings.model||'gemini-2.5-flash';
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(state.settings.apiKey)}`;
  const cfg={responseMimeType:'application/json',maxOutputTokens:maxTok||2048};
  if(/flash/i.test(model)) cfg.thinkingConfig={thinkingBudget:0};
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts}],generationConfig:cfg})});
  if(!res.ok){let msg='Gemini API error '+res.status;try{const e=await res.json();if(e.error&&e.error.message)msg=e.error.message;}catch(_){}throw new Error(msg);}
  const data=await res.json();
  const cand=(data.candidates||[])[0];
  if(cand && cand.finishReason==='MAX_TOKENS') throw new Error('The AI response was cut off — try fewer ingredients, or tap again.');
  let text=cand&&cand.content&&cand.content.parts?cand.content.parts.map(p=>p.text).filter(Boolean).join('\n').trim():'';
  if(!text) throw new Error('Empty response from Gemini. Please try again.');
  text=text.replace(/```json|```/g,'').trim();
  const s=text.indexOf('{'),e=text.lastIndexOf('}'); if(s>=0&&e>=0)text=text.slice(s,e+1);
  try{ return JSON.parse(text); }catch(err){ throw new Error('Could not read the AI response. Please try again.'); }
}
export async function detectIngredients(b64){
  const prompt=`Identify the distinct food ingredients visible in this photo (e.g. a fridge, pantry shelf, or a group of grocery items). Use simple common names. Ignore non-food objects, brands, and packaging text. Respond with ONLY JSON, no markdown: {"ingredients":["",""]}. Return an empty array if no food is visible.`;
  const out=await geminiJSON([{inline_data:{mime_type:'image/jpeg',data:b64}},{text:prompt}],1024);
  return Array.isArray(out.ingredients)?out.ingredients.filter(x=>x&&typeof x==='string').map(x=>x.trim()):[];
}
export function bestFoodMatch(name){
  if(!ONDB) return null;
  const q=(name||'').toLowerCase().trim(); if(q.length<2) return null;
  let hits=ONDB.filter(a=>a[0].toLowerCase().includes(q));
  if(!hits.length){ const w=q.split(/[\s,]+/)[0]; if(w&&w.length>2) hits=ONDB.filter(a=>a[0].toLowerCase().includes(w)); }
  if(!hits.length) return null;
  hits.sort((a,b)=>a[0].length-b[0].length);
  const h=hits[0];
  return {per100:{calories:+h[1]||0,protein_g:+h[2]||0,carbs_g:+h[3]||0,fat_g:+h[4]||0,sugar_g:+h[5]||0}};
}
export async function costRecipe(recipe){
  try{ await ensureONDB(); }catch(_){}
  let tk=0,tp=0,tc=0,tf=0,anyEst=false;
  for(const ing of (recipe.ingredients||[])){
    const g=+ing.grams||0; let kcal=null,p=0,c=0,f=0,matched=false;
    if(g>0){ const m=bestFoodMatch(ing.name); if(m){ kcal=m.per100.calories*g/100; p=m.per100.protein_g*g/100; c=m.per100.carbs_g*g/100; f=m.per100.fat_g*g/100; matched=true; } }
    if(kcal==null){ kcal=+ing.kcal||0; p=+ing.protein_g||0; if(g>0&&kcal>0)anyEst=true; }
    ing._kcal=Math.round(kcal); ing._matched=matched; ing._prot=Math.round(p); ing._carb=Math.round(c); ing._fat=Math.round(f);
    tk+=kcal; tp+=p; tc+=c; tf+=f;
  }
  const sv=Math.max(1,Math.round(+recipe.servings||1));
  recipe._total={calories:Math.round(tk),protein_g:Math.round(tp),carbs_g:Math.round(tc),fat_g:Math.round(tf)};
  recipe._per={calories:Math.round(tk/sv),protein_g:Math.round(tp/sv),carbs_g:Math.round(tc/sv),fat_g:Math.round(tf/sv)};
  recipe._estimated=anyEst;
  return recipe;
}
export async function lookupPer100(name){
  try{ await ensureONDB(); }catch(_){}
  const m=bestFoodMatch(name);
  if(m) return {cal:m.per100.calories,prot:m.per100.protein_g,carb:m.per100.carbs_g,fat:m.per100.fat_g,src:'db'};
  if(state.settings.apiKey){ try{ const ai=await aiNutrition(name); if(ai&&ai.per_100g&&+ai.per_100g.calories){ const n=ai.per_100g; return {cal:+n.calories||0,prot:+n.protein_g||0,carb:+n.carbs_g||0,fat:+n.fat_g||0,src:'ai'}; } }catch(_){} }
  return null;
}

