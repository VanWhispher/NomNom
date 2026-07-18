import {$} from '../helpers.js';
import {applyTheme, state, tab} from '../state.js';
import {renderPlan} from '../views/plan.js';
import {renderRivals} from '../views/rivals.js';
import {renderToday} from '../views/today.js';
import {renderWeight} from '../views/weight.js';

/* ---------- render router ---------- */
export let _fabH=52;
export function layout(){
  const tb=document.querySelector('.tabbar');
  const h=tb?tb.offsetHeight:64;
  const fab=document.getElementById('fab');
  if(fab && fab.offsetHeight) _fabH=fab.offsetHeight;
  const root=document.documentElement.style;
  root.setProperty('--fab-bottom',(h+14)+'px');
  root.setProperty('--reserve',(h+_fabH+30)+'px');
}
export function render(){
  applyTheme(state.settings.theme);
  document.querySelectorAll('.tabbar .tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  $('fab').style.display = tab==='today' ? 'block' : 'none';
  if(tab==='today')renderToday();
  else if(tab==='weight')renderWeight();
  else if(tab==='rivals')renderRivals();
  else renderPlan();
  layout();
}

