/* ---------- Singapore Health Promotion Board food composition (SG FoodID) ----------
   Data lives in /hpb.json (fetched once, same origin) instead of a giant array literal
   here — keeps this module tiny to parse and the data diffable/editable on its own. */
export const HPB_DB_URL='hpb.json';
export let SGDB=null, HPB_NAMES=null, _hpbPromise=null;
export function _norm(s){return String(s).trim().toLowerCase().replace(/\s+/g,' ');}
export function ensureSGDB(){
  if(SGDB) return Promise.resolve(SGDB);
  if(_hpbPromise) return _hpbPromise;
  _hpbPromise=fetch(HPB_DB_URL).then(r=>{
    if(!r.ok) throw new Error('Could not load the SG FoodID database ('+r.status+').');
    return r.json();
  }).then(data=>{
    SGDB=data;
    HPB_NAMES=new Set(SGDB.map(f=>_norm(f[0])));
    return SGDB;
  });
  return _hpbPromise;
}
ensureSGDB().catch(()=>{}); // kick off the fetch at boot so it's usually ready before anyone searches

export const VISION_PROMPT=`You are a nutrition identification assistant. The user sends a meal photo, possibly with a reference object (credit card, coin, or fork) for scale.
1. Identify each distinct food item.
2. For each item give nutrition per 100 grams: calories, protein, carbs, fat, and sugar (grams).
3. Using the reference object, give a rough starting weight in grams for each item (the user will correct it).
4. Note hidden-calorie assumptions (oil, butter, dressing).
Respond with ONLY valid JSON, no markdown, in this shape:
{"items":[{"name":"","per_100g":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"sugar_g":0},"estimated_grams":0,"confidence":"low|medium|high"}],"assumptions":""}
If no food is visible, return an empty items array and explain in assumptions.`;
