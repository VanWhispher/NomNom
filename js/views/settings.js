import {pushCloud, signOut} from '../cloud-sync.js';
import {ONBYEAN, ONDB, _idbDel, _onPromise, ensureONDB, resetFoodDB} from '../data/opennutrition.js';
import {$, el, esc} from '../helpers.js';
import {CLOUD, DEFAULT, KEY, THEMES, applyTheme, save, saveLocal, setState, setTab, state, tab, user} from '../state.js';
import {navClose, navOpen} from '../ui/nav.js';
import {layout, render} from '../ui/router.js';
import {IC_CHECK, IC_CHEVR, IC_TRASH} from './add-shared.js';
import {_rivalsStale, setRivalsStale} from './rivals.js';
import {IC_SPARK} from './today.js';

/* ---------- SETTINGS ---------- */
export function openSettings(){
  const s=state.settings;
  const I=(p)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IC_SCALE=I('<path d="M7 8h10a2 2 0 012 2v9a2 2 0 01-2 2H7a2 2 0 01-2-2v-9a2 2 0 012-2z"/><path d="M12 4v4M9.5 13.5L12 8l2.5 5.5"/>');
  const IC_RULER=I('<path d="M12 3v18M8 6l4-3 4 3M8 18l4 3 4-3"/>');
  const IC_SPARK=I('<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"/>');
  const IC_DB=I('<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6M5 11.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6"/>');
  const IC_EXPORT=I('<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 18v1a2 2 0 002 2h10a2 2 0 002-2v-1"/>');
  const IC_FLAME=I('<path d="M12 3c1.2 3-1.6 4.6-3 6.6A5 5 0 0012 17a5 5 0 003.2-8.9C13.6 6.9 12.4 5.2 12 3z"/>');
  const IC_CHEVR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  const IC_CHEVD='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  const IC_CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M20 6L9 17l-5-5"/></svg>';
  const MODELS=[
    {id:'gemini-3.5-flash',name:'Gemini 3.5 Flash',desc:'Newest · best accuracy'},
    {id:'gemini-2.5-flash',name:'Gemini 2.5 Flash',desc:'Fast & dependable'},
    {id:'gemini-2.5-flash-lite',name:'Gemini 2.5 Flash-Lite',desc:'Lighter on quota'},
    {id:'gemini-2.0-flash',name:'Gemini 2.0 Flash',desc:'Lowest latency'}
  ];
  const meta=(user&&user.user_metadata)||{};
  const email=(user&&user.email)||'';
  const namePart=(email.split('@')[0]||'').replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const displayName=meta.full_name||meta.name||namePart||'Your account';
  const initials=((displayName.match(/\b\w/g)||[]).join('').slice(0,2)||email.slice(0,2)||'NN').toUpperCase();

  const overlay=el(`<div class="sheet-overlay"><div class="sheet set-sheet" id="sheet">
    <div class="sheet-handle" id="sheet-handle"><div class="sheet-grip"></div></div>
    <h2>Account</h2>

    ${(CLOUD&&user)?`<div class="set-card set-prof" style="margin-top:10px">
      <div class="set-av">${esc(initials)}</div>
      <div class="grow"><div class="set-name">${esc(displayName)}</div><div class="set-email">${esc(email)}</div></div>
    </div>

    <div class="set-sec">Friends</div>
    <div class="set-card">
      <div class="set-row first" id="set-compete" style="cursor:pointer">
        <div class="set-ico">${I('<path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M6 4h12v4a6 6 0 01-12 0z"/><path d="M9 15h6M8 20h8M12 15v5"/>')}</div>
        <div class="grow"><div class="set-rt">Compete with a friend</div><div class="set-rs" id="set-compete-sub">${state.competition?'View your leaderboard':'Race someone on sticking to your plan'}</div></div>
        <span class="set-chev">${IC_CHEVR}</span>
      </div>
    </div>`:''}

    <div class="set-sec">Units</div>
    <div class="set-card">
      <div class="set-row first">
        <div class="set-ico">${IC_SCALE}</div>
        <div class="grow"><div class="set-rt">Weight unit</div></div>
        <div class="seg" id="seg-w">
          <button class="seg-btn${s.weightUnit==='kg'?' active':''}" data-w="kg">kg</button>
          <button class="seg-btn${s.weightUnit==='lb'?' active':''}" data-w="lb">lb</button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-ico">${IC_RULER}</div>
        <div class="grow"><div class="set-rt">Height unit</div><div class="set-rs">used only for profile estimates</div></div>
        <div class="seg" id="seg-h">
          <button class="seg-btn${s.heightUnit==='cm'?' active':''}" data-h="cm">cm</button>
          <button class="seg-btn${s.heightUnit==='in'?' active':''}" data-h="in">in</button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-ico">${IC_FLAME}</div>
        <div class="grow"><div class="set-rt">Calorie decimals</div></div>
        <div class="seg" id="seg-cd">
          <button class="seg-btn${(s.calorieDecimals||0)===0?' active':''}" data-cd="0">0</button>
          <button class="seg-btn${s.calorieDecimals===1?' active':''}" data-cd="1">1</button>
          <button class="seg-btn${s.calorieDecimals===2?' active':''}" data-cd="2">2</button>
        </div>
      </div>
    </div>

    <div class="set-sec">Appearance</div>
    <div class="set-card pad">
      <div class="set-rt" style="margin-bottom:4px">Theme</div>
      <div class="set-rs" id="set-themelbl" style="margin-bottom:16px">${esc((THEMES[s.theme]||{}).desc||'')}</div>
      <div class="set-themes" id="set-themes">
        ${Object.keys(THEMES).map(id=>{const t=THEMES[id];return `<button class="set-sw${s.theme===id?' sel':''}" data-theme="${id}" style="--swr:${t.strong}"><span class="dot" style="background:${t.sw}"></span><span class="lbl">${t.name}</span></button>`;}).join('')}
      </div>
    </div>

    <div class="set-sec">AI scanning</div>
    <div class="set-card">
      <div class="set-row first">
        <div class="set-ico">${IC_SPARK}</div>
        <div class="grow"><div class="set-rs" style="line-height:1.45">Powers photo &amp; barcode food recognition. Bring your own key — <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:var(--accent-strong);font-weight:600">free in Google AI Studio</a>.</div></div>
      </div>
      <div class="set-row" id="set-keyrow"></div>
      <div class="set-row" style="display:block">
        <div style="display:flex;align-items:center;gap:14px">
          <div class="grow"><div class="set-rt">Model</div></div>
          <button class="set-pill" id="set-modelpill"><span id="set-modelname">Choose</span>${IC_CHEVD}</button>
        </div>
        <div id="set-modelmenu"></div>
      </div>
    </div>

    <div class="set-sec">Data &amp; storage</div>
    <div class="set-card">
      <div class="set-row first">
        <div class="set-ico">${IC_DB}</div>
        <div class="grow"><div class="set-rt">Offline food database</div><div class="set-rs" id="set-dbstatus">…</div></div>
        <button class="set-tog" id="set-dbtog"><span></span></button>
      </div>
      <div class="set-row" id="set-export">
        <div class="set-ico">${IC_EXPORT}</div>
        <div class="grow"><div class="set-rt">Export my data</div><div class="set-rs">download everything as JSON</div></div>
        <span class="set-chev">${IC_CHEVR}</span>
      </div>
      <div class="set-row" id="set-clear">
        <div class="set-ico danger">${IC_TRASH}</div>
        <div class="grow"><div class="set-rt danger">Clear all data</div><div class="set-rs danger">this can't be undone</div></div>
      </div>
    </div>

    ${(CLOUD&&user)?`<button class="set-signout" id="set-signout">Sign out</button>`:''}
    <div class="set-foot">NomNom · Food data from Singapore's Health Promotion Board (SG FoodID), <a href="https://www.opennutrition.app" target="_blank" rel="noopener">OpenNutrition</a> &amp; <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a></div>
  </div></div>`);
  $('modal-root').appendChild(overlay);
  const sheet=overlay.querySelector('#sheet');
  // slide-up entry
  sheet.style.transform='translateY(100%)';
  requestAnimationFrame(()=>{sheet.style.transition='transform .28s cubic-bezier(.22,.61,.36,1)';sheet.style.transform='translateY(0)';});
  let closed=false;
  const rawClose=()=>{
    if(closed)return; closed=true;
    sheet.style.transition='transform .25s ease-in';sheet.style.transform='translateY(100%)';
    overlay.style.transition='background .25s';overlay.style.background='rgba(0,0,0,0)';
    setTimeout(()=>{overlay.remove();render();},240);
  };
  const _navEntry=navOpen(rawClose);
  const close=()=>{ if(closed)return; navClose(_navEntry); rawClose(); };
  overlay.onclick=(e)=>{if(e.target===overlay)close();};
  // swipe-down to dismiss — only when the top grip handle is dragged
  let startY=0,dY=0,drag=false;
  const handle=overlay.querySelector('#sheet-handle');
  handle.addEventListener('touchstart',e=>{startY=e.touches[0].clientY;dY=0;drag=false;sheet.style.transition='none';},{passive:true});
  handle.addEventListener('touchmove',e=>{
    const dy=e.touches[0].clientY-startY;
    if(dy>0){drag=true;dY=dy;sheet.style.transform=`translateY(${dy}px)`;e.preventDefault();}
  },{passive:false});
  handle.addEventListener('touchend',()=>{
    if(!drag){sheet.style.transition='';return;}
    drag=false;sheet.style.transition='transform .25s ease';
    if(dY>90){close();}else{sheet.style.transform='translateY(0)';}
  });
  // mouse: drag the grip handle (desktop)
  const ps=(y)=>{startY=y;dY=0;drag=true;sheet.style.transition='none';};
  const pm=(y)=>{if(!drag)return;dY=Math.max(0,y-startY);sheet.style.transform=`translateY(${dY}px)`;};
  const pe=()=>{if(!drag)return;drag=false;sheet.style.transition='transform .25s ease';if(dY>90){close();}else{sheet.style.transform='translateY(0)';}};
  handle.addEventListener('mousedown',e=>{e.preventDefault();ps(e.clientY);
    const mm=ev=>pm(ev.clientY),mu=()=>{pe();document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
    document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);});
  // ---- units (segmented, live save) ----
  overlay.querySelectorAll('#seg-w .seg-btn').forEach(b=>b.onclick=()=>{ s.weightUnit=b.dataset.w; save();
    overlay.querySelectorAll('#seg-w .seg-btn').forEach(x=>x.classList.toggle('active',x===b)); });
  overlay.querySelectorAll('#seg-h .seg-btn').forEach(b=>b.onclick=()=>{ s.heightUnit=b.dataset.h; save();
    overlay.querySelectorAll('#seg-h .seg-btn').forEach(x=>x.classList.toggle('active',x===b)); });
  overlay.querySelectorAll('#seg-cd .seg-btn').forEach(b=>b.onclick=()=>{ s.calorieDecimals=+b.dataset.cd; save();
    overlay.querySelectorAll('#seg-cd .seg-btn').forEach(x=>x.classList.toggle('active',x===b)); });

  // ---- theme (apply live on tap) ----
  overlay.querySelectorAll('#set-themes .set-sw').forEach(b=>b.onclick=()=>{
    s.theme=b.dataset.theme; save(); applyTheme(s.theme);
    overlay.querySelectorAll('#set-themes .set-sw').forEach(p=>p.classList.toggle('sel',p===b));
    const lbl=overlay.querySelector('#set-themelbl'); if(lbl)lbl.textContent=(THEMES[s.theme]||{}).desc||'';
  });

  // ---- API key (masked display + inline edit) ----
  const keyrow=overlay.querySelector('#set-keyrow');
  const maskKey=k=>k?('••••••••'+k.slice(-4)):'Not set';
  function paintKey(){
    keyrow.innerHTML=`<div class="grow"><div class="set-rt">Gemini API key</div><div class="set-rs">${esc(maskKey(s.apiKey))}</div></div><button class="set-editbtn">${s.apiKey?'Edit':'Add'}</button>`;
    keyrow.querySelector('button').onclick=editKey;
  }
  function editKey(){
    keyrow.innerHTML=`<div class="grow"><div class="set-rt">Gemini API key</div><input class="set-keyinput" type="password" placeholder="AIza…"></div><button class="set-editbtn">Done</button>`;
    const inp=keyrow.querySelector('input'); inp.value=s.apiKey||''; setTimeout(()=>inp.focus(),0);
    keyrow.querySelector('button').onclick=()=>{ s.apiKey=inp.value.trim(); save(); paintKey(); };
    inp.onkeydown=e=>{ if(e.key==='Enter'){ s.apiKey=inp.value.trim(); save(); paintKey(); } };
  }
  paintKey();

  // ---- model picker (dropdown, live save) ----
  let modelOpen=false;
  const pill=overlay.querySelector('#set-modelpill');
  const nameEl=overlay.querySelector('#set-modelname');
  const menuEl=overlay.querySelector('#set-modelmenu');
  function paintModel(){
    const cur=MODELS.find(m=>m.id===s.model);
    nameEl.textContent=cur?cur.name:(s.model||'Choose');
    pill.classList.toggle('open',modelOpen);
    if(!modelOpen){ menuEl.innerHTML=''; return; }
    menuEl.innerHTML=`<div class="set-menu">${MODELS.map(m=>`<button class="set-mi${s.model===m.id?' sel':''}" data-m="${m.id}"><div style="flex:1;min-width:0"><div class="mn">${m.name}</div><div class="md">${m.desc}</div></div>${s.model===m.id?`<span class="mck">${IC_CHECK}</span>`:''}</button>`).join('')}</div>`;
    menuEl.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ s.model=b.dataset.m; save(); modelOpen=false; paintModel(); });
  }
  pill.onclick=()=>{ modelOpen=!modelOpen; paintModel(); };
  paintModel();

  // ---- offline database (toggle: download / clear) ----
  const dbtog=overlay.querySelector('#set-dbtog');
  const dbstatus=overlay.querySelector('#set-dbstatus');
  function paintDb(){
    const on=!!ONDB;
    dbtog.classList.toggle('on',on);
    dbstatus.textContent=on?`${ONDB.length.toLocaleString()} foods · offline ready`:'Not downloaded';
  }
  paintDb();
  dbtog.onclick=async()=>{
    if(ONDB){
      if(!confirm('Remove the offline food database from this device? You can download it again anytime.'))return;
      try{await _idbDel('food');}catch(e){}
      resetFoodDB(); paintDb();
    }else{
      dbtog.classList.add('on'); dbstatus.textContent='Downloading…';
      try{ await ensureONDB(); paintDb(); }
      catch(e){ dbtog.classList.remove('on'); dbstatus.textContent='Couldn’t download — needs the deployed https site.'; }
    }
  };

  // ---- export / clear / sign out ----
  overlay.querySelector('#set-export').onclick=()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='nomnom-data.json';a.click();
  };
  overlay.querySelector('#set-clear').onclick=()=>{if(confirm('Erase all data? This cannot be undone.')){localStorage.removeItem(KEY);setState(structuredClone(DEFAULT));if(CLOUD&&user){saveLocal();pushCloud();}close();}};
  const so=overlay.querySelector('#set-signout'); if(so)so.onclick=()=>{overlay.remove();signOut();};
  const compBtn=overlay.querySelector('#set-compete');
  if(compBtn)compBtn.onclick=()=>{ close(); setTimeout(()=>{ setTab('rivals'); setRivalsStale(true); render(); layout(); },220); };
}

