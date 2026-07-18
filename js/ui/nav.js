import {$, el, esc, todayKey} from '../helpers.js';
import {setTab, setViewDate, state, tab, viewDate} from '../state.js';
import {render} from './router.js';

/* ---------- back-button / swipe-back navigation ---------- */
export const _navStack=[];        // LIFO of open dismissible layers, each {close}
export let _navSuppress=0;        // count of history entries we're unwinding ourselves
export function _navBase(){ if(!(history.state&&history.state.nomBase)){ try{history.pushState({nomBase:1},'');}catch(_){}}}
export function navOpen(closeFn){  // call when a layer opens; returns an entry handle
  const entry={close:closeFn};
  _navStack.push(entry);
  try{history.pushState({nomLayer:_navStack.length},'');}catch(_){}
  return entry;
}
export function navClose(entry){    // call from a UI close (X / swipe / backdrop)
  if(!entry)return;
  const i=_navStack.indexOf(entry);
  if(i===-1)return;         // already unwound by a back press
  _navStack.splice(i,1);
  _navSuppress++;
  try{history.back();}catch(_){_navSuppress=Math.max(0,_navSuppress-1);}   // consume our pushed entry
}
window.addEventListener('popstate',()=>{
  if(_navSuppress>0){_navSuppress--;return;}
  if(_navStack.length){ _navStack.pop().close(); return; }   // a layer is open -> close the top one
  // no layers open: back acts as in-app navigation instead of leaving the site
  if(typeof tab!=='undefined' && tab!=='today'){ setTab('today'); if(typeof todayKey==='function')setViewDate(todayKey()); try{render();}catch(_){}}
  setTimeout(_navBase,0);    // re-buffer OUTSIDE the popstate dispatch (Chrome ignores pushState inside it)
});

export function openModal(title,bodyHtml){
  const m=el(`<div class="overlay"><div class="overlay-inner"><div class="mhead"><h2>${esc(title)}</h2><button class="linkbtn" id="m-close">Close</button></div><div id="m-body">${bodyHtml}</div></div></div>`);
  $('modal-root').appendChild(m);
  m._nav=navOpen(()=>{ if(m.parentNode)m.remove(); render(); });
  m.querySelector('#m-close').onclick=()=>closeModal(m);
  return m;
}
export function closeModal(m){ if(m){navClose(m._nav); if(m.parentNode)m.remove();} render(); }
export function closeAllModals(){ while(_navStack.length)navClose(_navStack[_navStack.length-1]); $('modal-root').innerHTML=''; render(); }

