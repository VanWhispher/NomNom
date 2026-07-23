import {esc, r0, r1, rCal, uid} from '../helpers.js';
import {MEALS, defaultMeal, save, state, viewDate} from '../state.js';
import {makeSheet} from '../ui/bottom-sheet.js';
import {closeModal, openModal} from '../ui/nav.js';
import {IC_BOOKMARK, IC_FORK, IC_MINUS, IC_PLUS, IC_TRASH, IC_X} from './add-shared.js';
import {addToLibrary, addToLibraryServing} from './eat-out-helpers.js';

/* ---------- MANUAL ---------- */
export function openManual(){
  const m=openModal('Enter manually',`
    <div class="mfield" style="margin-top:6px"><label>Food name</label><input id="mn-name" placeholder="e.g. Avocado toast"></div>
    <div style="margin-top:12px"><label class="mlbl">Meal</label><div class="seg" id="mn-meal">${MEALS.map(x=>`<button data-meal="${x}"${x===defaultMeal()?' class="on"':''}>${x}</button>`).join('')}</div></div>
    <div class="mrow" style="margin-top:12px">
      <div class="mfield"><label>Serving (g)</label><input type="number" inputmode="decimal" id="mn-serv" value="100"></div>
      <div class="mfield"><label>Servings</label><input type="number" inputmode="decimal" id="mn-qty" value="1"></div>
    </div>
    <div class="mcal"><label>Calories</label><div class="calwrap"><input type="number" inputmode="numeric" id="mn-cal" placeholder="0"><span class="calu">kcal</span></div></div>
    <div class="mrow" style="margin-top:12px">
      <div class="mfield"><label>Protein</label><input type="number" inputmode="decimal" id="mn-p" value="0"></div>
      <div class="mfield"><label>Carbs</label><input type="number" inputmode="decimal" id="mn-c" value="0"></div>
      <div class="mfield"><label>Fat</label><input type="number" inputmode="decimal" id="mn-f" value="0"></div>
    </div>
    <div class="toggle-row" style="margin-top:12px"><input type="checkbox" id="mn-lib" style="width:auto"><label for="mn-lib" style="margin:0">Save to library</label></div>
    <button class="btn btn-primary btn-block" id="mn-save" style="margin-top:14px">Add food</button>`);
  const body=m.querySelector('#m-body');
  let meal=defaultMeal();
  body.querySelectorAll('#mn-meal button').forEach(b=>b.onclick=()=>{meal=b.dataset.meal;body.querySelectorAll('#mn-meal button').forEach(x=>x.classList.toggle('on',x===b));});
  m.querySelector('#mn-save').onclick=()=>{
    const name=m.querySelector('#mn-name').value.trim()||'Item';
    const servG=+m.querySelector('#mn-serv').value||0, qty=+m.querySelector('#mn-qty').value||1;
    const cal=+m.querySelector('#mn-cal').value||0, p=+m.querySelector('#mn-p').value||0, c=+m.querySelector('#mn-c').value||0, f=+m.querySelector('#mn-f').value||0;
    const grams=servG*qty;
    state.entries.push({id:uid(),date:viewDate,meal,name,grams,servingLabel:`${r1(qty)} × ${r0(servG)} g`,calories:cal*qty,protein_g:p*qty,carbs_g:c*qty,fat_g:f*qty,sugar_g:0,source:'manual'});
    if(m.querySelector('#mn-lib').checked && servG>0) addToLibrary(name,{calories:cal*100/servG,protein_g:p*100/servG,carbs_g:c*100/servG,fat_g:f*100/servG,sugar_g:0},servG);
    save();closeModal(m);
  };
}

/* edit/delete a food entry */
export function editFood(id){
  const e=state.entries.find(x=>x.id===id);if(!e)return;
  const perServing=(e.unitCal!=null);
  const per100=(!perServing&&e.grams)?{calories:e.calories/e.grams*100,protein_g:(e.protein_g||0)/e.grams*100,carbs_g:(e.carbs_g||0)/e.grams*100,fat_g:(e.fat_g||0)/e.grams*100,sugar_g:(e.sugar_g||0)/e.grams*100}:null;
  const SZ_MIN=5,SZ_MAX=600;
  let size=perServing?0:Math.max(SZ_MIN,Math.round(e.grams||100));   // grams per serving
  let servings=perServing?(e.unitCal?r1(e.calories/e.unitCal):1):1; if(!servings)servings=1;
  let meal=e.meal||defaultMeal(), saveLib=false;
  const fmtServ=(v)=>{const w=Math.floor(v);if(v-w===0.5)return w?`${w}½`:'½';return String(r1(v));};
  const kcal=()=>perServing?(e.unitCal*servings):(per100?per100.calories*size*servings/100:0);
  const sub=()=>perServing?`${fmtServ(servings)} × ${e.portion||'serving'}`:`${r0(size*servings)} g · ${fmtServ(servings)} serving${servings===1?'':'s'}`;
  const sh=makeSheet(`<div class="edit-head"><span class="edit-title">Edit food</span><button class="edit-x" id="ef-x">${IC_X}</button></div>
    <div class="efh">
      <div class="efh-top"><span class="efh-ic">${IC_FORK}</span><div class="efh-main"><div class="efh-name">${esc(e.name)}</div><div class="efh-sub" id="ef-sub"></div></div></div>
      <div class="efh-cal"><span id="ef-kcal">0</span><small>kcal</small></div>
    </div>
    ${perServing?'':`<div class="add-card">
      <div class="dur-h"><span>Serving size</span><span class="dur-v"><input id="ef-szv" class="dur-v-input" type="number" inputmode="decimal" min="${SZ_MIN}" max="${SZ_MAX}" value="${size}"> g</span></div>
      <div class="dur-row"><button class="step" id="ef-szdec">${IC_MINUS}</button>
        <div class="nn-slider" id="ef-slider"><div class="nn-track"></div><div class="nn-fill" id="ef-fill"></div><div class="nn-thumb" id="ef-thumb"></div></div>
        <button class="step" id="ef-szinc">${IC_PLUS}</button></div></div>`}
    <div class="add-card">
      <div class="dur-h"><span>Servings</span>
        <div class="stepper"><button id="ef-svdec">${IC_MINUS}</button><div class="sv" id="ef-svv">${fmtServ(servings)}</div><button id="ef-svinc">${IC_PLUS}</button></div></div>
      <div class="qchips" id="ef-q"><button data-q="0.5">½</button><button data-q="1">1</button><button data-q="1.5">1½</button><button data-q="2">2×</button></div>
    </div>
    <div style="margin-top:14px"><div class="add-label">Meal</div><div class="seg" id="ef-meal">${MEALS.map(x=>`<button data-meal="${x}"${x===meal?' class="on"':''}>${x}</button>`).join('')}</div></div>
    <button class="lib-toggle" id="ef-libtog"><span class="lt-ic" id="ef-bm">${IC_BOOKMARK.replace('{F}','none')}</span><span class="lt-label">Save to Library</span><span class="set-tog" id="ef-libsw"><span></span></span></button>
    <button class="btn-del-soft" id="ef-del">${IC_TRASH}<span>Delete this entry</span></button>
    <button class="btn btn-primary btn-block" id="ef-save" style="margin-top:14px">Save changes</button>`);
  const root=sh.sheet;
  let placeSize=()=>{};
  const repaint=()=>{
    root.querySelector('#ef-kcal').textContent=rCal(kcal());
    root.querySelector('#ef-sub').textContent=sub();
    root.querySelector('#ef-svv').textContent=fmtServ(servings);
    if(!perServing){const z=root.querySelector('#ef-szv');if(z&&document.activeElement!==z)z.value=r0(size);placeSize();}
    root.querySelectorAll('#ef-q button').forEach(b=>b.classList.toggle('on',+b.dataset.q===servings));
  };
  if(!perServing){
    const MIN=SZ_MIN,MAX=SZ_MAX;
    const sl=root.querySelector('#ef-slider'),fillEl=root.querySelector('#ef-fill'),thumbEl=root.querySelector('#ef-thumb'),szEl=root.querySelector('#ef-szv');
    placeSize=()=>{const f=Math.max(0,Math.min(1,(size-MIN)/(MAX-MIN)));fillEl.style.width=(f*100)+'%';thumbEl.style.left='calc('+f+' * (100% - 26px))';};
    const setFromX=(x)=>{const r=sl.getBoundingClientRect();let f=(x-r.left-13)/(r.width-26);f=Math.max(0,Math.min(1,f));size=Math.round((MIN+f*(MAX-MIN))/5)*5;repaint();};
    let drag=false;
    sl.addEventListener('pointerdown',ev=>{drag=true;try{sl.setPointerCapture(ev.pointerId);}catch(_){}setFromX(ev.clientX);});
    sl.addEventListener('pointermove',ev=>{if(drag)setFromX(ev.clientX);});
    sl.addEventListener('pointerup',()=>{drag=false;});sl.addEventListener('pointercancel',()=>{drag=false;});
    root.querySelector('#ef-szdec').onclick=()=>{size=Math.max(MIN,size-5);repaint();};
    root.querySelector('#ef-szinc').onclick=()=>{size=Math.min(MAX,size+5);repaint();};
    szEl.oninput=()=>{const n=parseFloat(szEl.value);if(!isNaN(n))size=n;repaint();};
    szEl.onblur=()=>{size=Math.max(MIN,Math.min(MAX,Math.round(size)||MIN));repaint();};
    szEl.onkeydown=(ev)=>{if(ev.key==='Enter'){ev.preventDefault();szEl.blur();}};
  }
  root.querySelector('#ef-svdec').onclick=()=>{servings=Math.max(0.5,r1(servings-0.5));repaint();};
  root.querySelector('#ef-svinc').onclick=()=>{servings=Math.min(20,r1(servings+0.5));repaint();};
  root.querySelectorAll('#ef-q button').forEach(b=>b.onclick=()=>{servings=+b.dataset.q;repaint();});
  root.querySelectorAll('#ef-meal button').forEach(b=>b.onclick=()=>{meal=b.dataset.meal;root.querySelectorAll('#ef-meal button').forEach(x=>x.classList.toggle('on',x===b));});
  root.querySelector('#ef-libtog').onclick=()=>{saveLib=!saveLib;root.querySelector('#ef-libsw').classList.toggle('on',saveLib);root.querySelector('#ef-bm').innerHTML=IC_BOOKMARK.replace('{F}',saveLib?'currentColor':'none');};
  root.querySelector('#ef-x').onclick=()=>sh.close();
  root.querySelector('#ef-del').onclick=()=>{state.entries=state.entries.filter(x=>x.id!==id);save();sh.close();};
  root.querySelector('#ef-save').onclick=()=>{
    e.meal=meal;
    if(perServing){
      e.calories=e.unitCal*servings; e.servingLabel=`${fmtServ(servings)} ${e.portion||'serving'}`;
      if(saveLib)addToLibraryServing(e.name,e.unitCal,e.portion||'serving');
    }else{
      size=Math.max(SZ_MIN,Math.min(SZ_MAX,Math.round(size)||SZ_MIN));
      const g=size*servings;
      e.grams=g; e.calories=per100.calories*g/100; e.protein_g=per100.protein_g*g/100; e.carbs_g=per100.carbs_g*g/100; e.fat_g=per100.fat_g*g/100; e.sugar_g=per100.sugar_g*g/100; e.servingLabel=`${r0(g)} g`;
      if(saveLib&&g)addToLibrary(e.name,per100,size);
    }
    save();sh.close();
  };
  repaint();
}

