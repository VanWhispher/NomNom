import {$, el} from '../helpers.js';
import {navClose, navOpen} from './nav.js';
import {render} from './router.js';
import {camStop} from '../views/photo.js';

/* ---------- bottom-sheet helper (slide up + swipe down, like Settings) ---------- */
export function makeSheet(innerHtml){
  const overlay=el(`<div class="sheet-overlay"><div class="sheet" id="sheet">
    <div class="sheet-handle" id="sheet-handle"><div class="sheet-grip"></div></div>
    ${innerHtml}
  </div></div>`);
  $('modal-root').appendChild(overlay);
  const sheet=overlay.querySelector('#sheet');
  sheet.style.transform='translateY(100%)';
  requestAnimationFrame(()=>{sheet.style.transition='transform .28s cubic-bezier(.22,.61,.36,1)';sheet.style.transform='translateY(0)';});
  let closed=false;
  const rawClose=()=>{
    if(closed)return; closed=true;
    camStop();
    sheet.style.transition='transform .25s ease-in';sheet.style.transform='translateY(100%)';
    overlay.style.transition='background .25s';overlay.style.background='rgba(0,0,0,0)';
    setTimeout(()=>{overlay.remove();render();},240);
  };
  const _navEntry=navOpen(rawClose);
  const close=()=>{ if(closed)return; navClose(_navEntry); rawClose(); };
  overlay.onclick=(e)=>{if(e.target===overlay)close();};
  let startY=0,dY=0,drag=false;
  const handle=overlay.querySelector('#sheet-handle');
  handle.addEventListener('touchstart',e=>{startY=e.touches[0].clientY;dY=0;drag=false;sheet.style.transition='none';},{passive:true});
  handle.addEventListener('touchmove',e=>{const dy=e.touches[0].clientY-startY;if(dy>0){drag=true;dY=dy;sheet.style.transform=`translateY(${dy}px)`;e.preventDefault();}},{passive:false});
  handle.addEventListener('touchend',()=>{if(!drag){sheet.style.transition='';return;}drag=false;sheet.style.transition='transform .25s ease';if(dY>90){close();}else{sheet.style.transform='translateY(0)';}});
  const ps=(y)=>{startY=y;dY=0;drag=true;sheet.style.transition='none';};
  const pm=(y)=>{if(!drag)return;dY=Math.max(0,y-startY);sheet.style.transform=`translateY(${dY}px)`;};
  const pe=()=>{if(!drag)return;drag=false;sheet.style.transition='transform .25s ease';if(dY>90){close();}else{sheet.style.transform='translateY(0)';}};
  handle.addEventListener('mousedown',e=>{e.preventDefault();ps(e.clientY);const mm=ev=>pm(ev.clientY),mu=()=>{pe();document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);});
  return {overlay,sheet,close};
}

