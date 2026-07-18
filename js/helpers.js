import {shiftDay, state, viewDate} from './state.js';

/* ---------- helpers ---------- */
export const $=(id)=>document.getElementById(id);
export const el=(html)=>{const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstChild;};
export function dateKey(d){const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
export function todayKey(){return dateKey(new Date());}
export function fmtDate(){return new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});}
export function r0(n){return Math.round(n||0);}
export function r1(n){return Math.round((n||0)*10)/10;}
export function uid(){return Math.random().toString(36).slice(2,9);}
export function esc(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
export const KG_PER_LB=0.45359237, CM_PER_IN=2.54;
export function kgToUnit(kg,u){return u==='lb'?kg/KG_PER_LB:kg;}
export function unitToKg(v,u){return u==='lb'?v*KG_PER_LB:v;}
export function cmToUnit(cm,u){return u==='in'?cm/CM_PER_IN:cm;}
export function unitToCm(v,u){return u==='in'?v*CM_PER_IN:v;}
export function weightDisp(w,u){return kgToUnit(unitToKg(w.weight,w.unit||'kg'),u);}  // a weigh-in -> current display unit
export function latestWeightKg(){
  if(!state.weights.length)return null;
  const w=[...state.weights].sort((a,b)=>a.date<b.date?1:-1)[0];
  return unitToKg(w.weight, w.unit||'kg');
}
export function todayFood(){return state.entries.filter(e=>e.date===viewDate);}
export function todayEx(){return state.exercise.filter(e=>e.date===viewDate);}
export function sum(arr,f){return arr.reduce((s,x)=>s+(x[f]||0),0);}
/* consecutive days (ending today, or yesterday if today isn't logged yet) with any food logged */
export function loggingStreak(){
  const logged=new Set(state.entries.map(e=>e.date));
  let cur=todayKey();
  if(!logged.has(cur)) cur=shiftDay(cur,-1);   // today unlogged — streak still stands through yesterday
  let n=0;
  while(logged.has(cur)){ n++; cur=shiftDay(cur,-1); }
  return n;
}
/* last 7 calendar days ending today, marked logged/not — for the streak strip */
export function last7Logged(){
  const logged=new Set(state.entries.map(e=>e.date)), tk=todayKey(), out=[];
  let d=tk;
  for(let i=0;i<7;i++){ out.unshift({date:d,logged:logged.has(d),today:d===tk}); d=shiftDay(d,-1); }
  return out;
}

