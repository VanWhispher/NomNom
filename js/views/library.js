import {el, esc, r0} from '../helpers.js';
import {state} from '../state.js';
import {closeModal, openModal} from '../ui/nav.js';
import {IC_FORK, IC_PLUS, recentFoods, relogFood} from './add-shared.js';
import {weighAndLog} from './barcode.js';
import {logServing} from './eat-out-helpers.js';

/* ---------- LIBRARY ---------- */
export function openLibrary(){
  const m=openModal('Library',`
    <div class="seg" id="lib-tabs" style="margin-top:10px">
      <button data-t="recent" class="on">Recent</button>
      <button data-t="saved">Saved</button>
      <button data-t="mine">My foods</button>
    </div>
    <div id="lib-body" style="margin-top:10px"></div>`);
  const body=m.querySelector('#lib-body');
  const tabs=m.querySelectorAll('#lib-tabs button');
  const rowHtml=(name,sub,attr)=>`<div class="recent-row"><span class="recent-ic">${IC_FORK}</span><div class="recent-main"><div class="rn">${esc(name)}</div><div class="rs">${esc(sub)}</div></div><button class="recent-add" ${attr} aria-label="Add">${IC_PLUS}</button></div>`;
  const distinct=()=>{const seen=new Set(),out=[];for(let i=state.entries.length-1;i>=0;i--){const e=state.entries[i],k=(e.name||'').toLowerCase();if(!e.name||seen.has(k))continue;seen.add(k);out.push({name:e.name,sub:`${e.servingLabel||(e.grams?r0(e.grams)+' g':'')} · ${r0(e.calories)} kcal`,entry:e});}return out;};
  function quickList(list){
    if(!list.length){body.innerHTML=`<div class="empty" style="border:none">Nothing logged yet.</div>`;return;}
    body.innerHTML=list.map((r,i)=>rowHtml(r.name,r.sub,`data-i="${i}"`)).join('');
    body.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{relogFood(list[+b.dataset.i]);closeModal(m);});
  }
  function showSaved(){
    const lib=state.library;
    if(!lib.length){body.innerHTML=`<div class="empty" style="border:none">Your library is empty. Tick “Save to library” after logging to reuse items here.</div>`;return;}
    body.innerHTML=lib.map(l=>{const sub=l.perServing?`${r0(l.perServing.calories)} kcal per ${esc(l.perServing.portion)}`:`${r0(l.per_100g.calories)} kcal/100g`;return rowHtml(l.name,sub,`data-lib="${l.id}"`);}).join('');
    body.querySelectorAll('[data-lib]').forEach(b=>b.onclick=()=>{
      const l=state.library.find(x=>x.id===b.dataset.lib);
      const stage=el('<div></div>');m.querySelector('#m-body').innerHTML='';m.querySelector('#m-body').appendChild(stage);
      if(l.perServing)logServing(m,stage,l.name,l.perServing.calories,l.perServing.portion,'library');
      else weighAndLog(m,stage,l.name,l.per_100g,'library',l.lastGrams);
    });
  }
  tabs.forEach(b=>b.onclick=()=>{tabs.forEach(x=>x.classList.toggle('on',x===b));const t=b.dataset.t;t==='recent'?quickList(recentFoods(20)):t==='mine'?quickList(distinct()):showSaved();});
  quickList(recentFoods(20));
}

