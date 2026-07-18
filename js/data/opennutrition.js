import {load} from '../state.js';

/* ---------- OpenNutrition food database (downloaded once, cached on device) ---------- */
export const FOOD_DB_URL='opennutrition.json.gz';
export const FOOD_DB_VERSION='2025.1';
export let ONDB=null, ONBYEAN=null, _onPromise=null;
export function resetFoodDB(){ONDB=null;ONBYEAN=null;_onPromise=null;}
export function _idb(){return new Promise((res,rej)=>{const r=indexedDB.open('nomnom_food',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
export function _idbGet(k){return _idb().then(d=>new Promise((res,rej)=>{const t=d.transaction('kv').objectStore('kv').get(k);t.onsuccess=()=>res(t.result);t.onerror=()=>rej(t.error);}));}
export function _idbSet(k,v){return _idb().then(d=>new Promise((res,rej)=>{const tx=d.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);}));}
export function _idbDel(k){return _idb().then(d=>new Promise((res,rej)=>{const tx=d.transaction('kv','readwrite');tx.objectStore('kv').delete(k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);}));}
export function ensureONDB(){
  if(ONDB) return Promise.resolve(ONDB);
  if(_onPromise) return _onPromise;
  _onPromise=(async()=>{
    let txt=null;
    try{const c=await _idbGet('food');if(c&&c.v===FOOD_DB_VERSION)txt=c.t;}catch(e){}
    if(!txt){
      const r=await fetch(FOOD_DB_URL);
      if(!r.ok) throw new Error('Could not load food database ('+r.status+').');
      const buf=await r.arrayBuffer();
      const u8=new Uint8Array(buf);
      if(u8[0]===0x1f && u8[1]===0x8b){ // gzip magic bytes → decompress
        if(typeof DecompressionStream==='undefined') throw new Error('This browser can\'t decompress the food database (needs Safari 16.4+ / a recent browser).');
        const stream=new Response(buf).body.pipeThrough(new DecompressionStream('gzip'));
        txt=await new Response(stream).text();
      }else{ // already plain JSON (server may have decompressed it)
        txt=new TextDecoder().decode(buf);
      }
      try{await _idbSet('food',{v:FOOD_DB_VERSION,t:txt});}catch(e){}
    }
    ONDB=JSON.parse(txt);
    ONBYEAN=new Map();
    for(const it of ONDB){if(it[7])ONBYEAN.set(it[7],it);}
    return ONDB;
  })();
  return _onPromise;
}
export const SRC={library:'personal library',local:'local database',hpb:'SG FoodID (HPB)',opennutrition:'OpenNutrition',packaged:'Open Food Facts',barcode:'Open Food Facts',ai:'AI estimate',photo:'photo',manual:'manual',recipe:'recipe'};
