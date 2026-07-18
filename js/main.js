import {boot} from './cloud-sync.js';
import {todayKey} from './helpers.js';
import {load, setTab, setViewDate, state, tab, viewDate} from './state.js';
import {_navBase, closeAllModals} from './ui/nav.js';
import {layout} from './ui/router.js';
import {setRivalsStale} from './views/rivals.js';
import './views/add.js';   // wires the FAB's onclick as a module side-effect — nothing else imports its exports

/* ---------- init ---------- */
document.querySelectorAll('.tabbar .tab').forEach(t=>t.onclick=()=>{setTab(t.dataset.tab);if(tab==='today')setViewDate(todayKey());if(tab==='rivals')setRivalsStale(true);closeAllModals();});
window.addEventListener('resize',layout);
window.addEventListener('orientationchange',()=>setTimeout(layout,250));
if(window.visualViewport)window.visualViewport.addEventListener('resize',layout);
window.addEventListener('load',layout);
// Guarantee a history buffer so the first back press is caught in-app (not sent to the
// previous page / app exit). replaceState normalizes the current entry first, so this
// works even when a relaunched PWA restored a persisted nomBase state.
try{ history.replaceState({nomRoot:1},''); }catch(_){}
_navBase();
boot();
