import {$, cmToUnit, kgToUnit, latestWeightKg, r0, r1, unitToCm, unitToKg} from '../helpers.js';
import {GEAR_SVG, MEALS, mealsEnabledMap, save, state} from '../state.js';
import {IC_MINUS, IC_PLUS} from './add-shared.js';
import {openSettings} from './settings.js';

/* ---------- PLAN ---------- */
export function renderPlan(){
  const p=state.profile;
  const hu=state.settings.heightUnit||'cm', wu=state.settings.weightUnit||'kg';
  const wkg=latestWeightKg();
  const ACTS_P=[{m:1.2,label:'Sedentary',desc:'Little or no exercise — desk job.'},{m:1.375,label:'Light',desc:'Light exercise 1–3 days a week.'},{m:1.55,label:'Moderate',desc:'Moderate exercise 3–5 days a week.'},{m:1.725,label:'Active',desc:'Hard exercise 6–7 days a week.'},{m:1.9,label:'Very active',desc:'Hard daily exercise or a physical job.'}];
  if(!ACTS_P.find(a=>a.m===p.activity)) p.activity=1.55;
  if(p.rate==null) p.rate=(p.lossRate?Math.min(0.75,Math.max(0.25,Math.round(p.lossRate/1100*4)/4)):0.5);
  if(p.goalWeight==null && wkg) p.goalWeight=Math.round((wkg-5)*10)/10;
  const ageNow=()=>(+p.age||30);
  const fmtN=(n)=>r0(n).toLocaleString();
  const round5=(n)=>Math.round(n/5)*5;
  const SCALE_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 12l4-4.5"/><path d="M9 4.5h6"/></svg>';
  const CALOK_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/><path d="M16.5 14.5l-3.5 3.5-2-2"/></svg>';
  const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  $('main').innerHTML=`
    <div class="topbar"><div><h1>Plan</h1><div class="date">Set your targets</div></div><button class="gear" id="open-settings-p">${GEAR_SVG}</button></div>

    <div class="scard" style="margin-top:14px">
      <div class="scard-h">About you</div>
      <div class="prow"><span class="lab">Sex</span>
        <div class="minitog" id="p-sex"><button data-s="female"${p.sex==='female'?' class="on"':''}>Female</button><button data-s="male"${p.sex==='male'?' class="on"':''}>Male</button></div></div>
      <div class="prow brd"><span class="lab">Age</span>
        <div class="pstep"><button id="p-agedn">${IC_MINUS}</button><span class="val" id="p-agev"></span><button id="p-ageup">${IC_PLUS}</button></div></div>
      <div class="prow brd"><span class="lab">Height</span>
        <div class="pstep"><button id="p-htdn">${IC_MINUS}</button><span class="val" id="p-htv"></span><button id="p-htup">${IC_PLUS}</button></div></div>
    </div>

    <div class="scard pwsync">
      <div class="ic">${SCALE_SVG}</div>
      <div><div style="font-size:13px;color:var(--text-soft)">Current weight</div><div class="v" id="p-cur"></div></div>
    </div>

    <div class="scard">
      <div class="scard-h">Activity level</div>
      <div class="achips" id="p-act">${ACTS_P.map(a=>`<button class="achip${a.m===p.activity?' on':''}" data-m="${a.m}">${a.label}</button>`).join('')}</div>
      <div class="adesc" id="p-actdesc"></div>
    </div>

    <div class="scard">
      <div class="scard-h">Goal</div>
      <div class="seg-goal" id="p-goal"><button data-g="maintain"${p.goal==='maintain'?' class="on"':''}>Maintain</button><button data-g="lose"${p.goal==='lose'?' class="on"':''}>Lose weight</button></div>
      <div id="p-lose" style="${p.goal==='lose'?'':'display:none'}">
        <div class="prow brd"><span class="lab">Goal weight</span>
          <div class="pstep"><button id="p-gwdn">${IC_MINUS}</button><span class="val" id="p-gwv"></span><button id="p-gwup">${IC_PLUS}</button></div></div>
        <div style="padding:14px 0 0;margin-top:14px;border-top:1px solid var(--divider)">
          <div style="font-size:14px;color:var(--text);margin-bottom:10px">Weekly pace</div>
          <div class="paces" id="p-pace">${[0.25,0.5,0.75,1].map(r=>`<button class="pace${Math.abs(r-p.rate)<0.01?' on':''}" data-r="${r}"><div class="kg">${r}</div><div class="u">kg / week</div></button>`).join('')}</div>
        </div>
        <div id="p-proj"></div>
      </div>
    </div>

    <div class="scard">
      <div class="scard-h">Meals I usually eat</div>
      <div class="adesc" style="margin:-2px 0 10px">Splits your daily target across these meals when you're eating out.</div>
      <div class="achips" id="p-meals">${MEALS.map(m=>`<button class="achip${mealsEnabledMap()[m]?' on':''}" data-meal="${m}">${m}</button>`).join('')}</div>
    </div>

    <div class="scard">
      <div class="scard-h">Your numbers</div>
      <div class="numrow"><div><div class="t">BMR</div><div class="s">At complete rest</div></div><span class="v" id="p-bmr">—</span></div>
      <div class="numrow" style="border-bottom:none"><div><div class="t">Maintenance</div><div class="s">To stay the same weight</div></div><span class="v" id="p-maint">—</span></div>
      <div class="tgtbox"><div><div style="font-size:13.5px;font-weight:700;color:var(--text)">Daily target</div><div class="s" id="p-tsub" style="font-size:11.5px;color:var(--text-soft);margin-top:1px"></div></div>
        <div style="display:flex;align-items:baseline;gap:3px"><span class="big" id="p-tgt">—</span><span style="font-size:12px;color:var(--text-soft)">kcal</span></div></div>
    </div>

    <button class="cta" id="p-set">Set as daily target</button>
    <div id="p-saved"></div>
  `;
  $('open-settings-p').onclick=openSettings;

  function paint(){
    $('p-agev').textContent=ageNow();
    $('p-htv').textContent=p.height?`${r0(cmToUnit(p.height,hu))} ${hu}`:`— ${hu}`;
    $('p-cur').textContent=wkg?`${r1(kgToUnit(wkg,wu))} ${wu}`:'Log a weigh-in first';
    const act=ACTS_P.find(a=>a.m===p.activity)||ACTS_P[2];
    $('p-actdesc').textContent=act.desc;
    document.querySelectorAll('#p-act .achip').forEach(b=>b.classList.toggle('on',+b.dataset.m===p.activity));
    document.querySelectorAll('#p-sex button').forEach(b=>b.classList.toggle('on',b.dataset.s===p.sex));
    document.querySelectorAll('#p-goal button').forEach(b=>b.classList.toggle('on',b.dataset.g===p.goal));
    $('p-lose').style.display=p.goal==='lose'?'':'none';
    if(p.goal==='lose'){
      $('p-gwv').textContent=p.goalWeight!=null?`${r1(kgToUnit(p.goalWeight,wu))} ${wu}`:`— ${wu}`;
      document.querySelectorAll('#p-pace .pace').forEach(b=>b.classList.toggle('on',Math.abs(+b.dataset.r-p.rate)<0.01));
    }
    // numbers
    const age=ageNow(), ht=+p.height||0;
    if(!wkg||!ht){
      $('p-bmr').textContent='—';$('p-maint').textContent='—';$('p-tgt').textContent='—';
      $('p-tsub').textContent=!wkg?'Log a weigh-in to calculate':'Add your height above';
      $('p-set').disabled=true;
      $('p-proj').innerHTML='';
      return;
    }
    $('p-set').disabled=false;
    const bmr=10*wkg+6.25*ht-5*age+(p.sex==='male'?5:-161);
    const maint=bmr*p.activity;
    const lose=p.goal==='lose';
    const deficit=Math.round(p.rate*7700/7);
    const floor=p.sex==='male'?1500:1200;
    let target=lose?maint-deficit:maint, clamped=false;
    if(target<floor){target=floor;clamped=true;}
    $('p-bmr').textContent=fmtN(round5(bmr))+' kcal';
    $('p-maint').textContent=fmtN(round5(maint))+' kcal';
    $('p-tgt').textContent=fmtN(round5(target));
    $('p-tsub').textContent=lose?(clamped?'Held at a safe minimum':'−'+fmtN(round5(deficit))+' kcal/day deficit'):'Maintenance calories';
    p._target=round5(target);
    // projection
    if(lose && p.goalWeight!=null){
      const toGo=wkg-p.goalWeight;
      if(toGo>0.05){
        const wks=Math.max(1,Math.round(toGo/p.rate));
        const eta=new Date(); eta.setDate(eta.getDate()+Math.round(toGo/p.rate*7));
        $('p-proj').innerHTML=`<div class="proj"><div class="ic">${CALOK_SVG}</div><div class="tx">Lose ${r1(kgToUnit(toGo,wu))} ${wu} at ${p.rate} kg/week — reach ${r1(kgToUnit(p.goalWeight,wu))} ${wu} around ${MN[eta.getMonth()]} ${eta.getDate()} (~${wks} week${wks===1?'':'s'}).</div></div>`;
      } else {
        $('p-proj').innerHTML=`<div style="background:var(--accent-bg);border-radius:14px;padding:12px 14px;margin-top:16px;font-size:12.5px;color:var(--text-soft)">Set a goal weight below your current weight to see a projection.</div>`;
      }
    } else $('p-proj').innerHTML='';
  }
  const save2=()=>{p.lossRate=Math.round(p.rate*7700/7);save();$('p-saved').innerHTML='';paint();};

  document.querySelectorAll('#p-sex button').forEach(b=>b.onclick=()=>{p.sex=b.dataset.s;save2();});
  $('p-ageup').onclick=()=>{p.age=Math.min(100,ageNow()+1);save2();};
  $('p-agedn').onclick=()=>{p.age=Math.max(14,ageNow()-1);save2();};
  const htStep=(d)=>{const disp=p.height?cmToUnit(p.height,hu):(hu==='in'?67:170);const nd=Math.round(disp)+d;p.height=r1(unitToCm(nd,hu));save2();};
  $('p-htup').onclick=()=>htStep(1); $('p-htdn').onclick=()=>htStep(-1);
  document.querySelectorAll('#p-act .achip').forEach(b=>b.onclick=()=>{p.activity=+b.dataset.m;save2();});
  document.querySelectorAll('#p-goal button').forEach(b=>b.onclick=()=>{p.goal=b.dataset.g;save2();});
  const gwStep=(d)=>{const base=p.goalWeight!=null?p.goalWeight:(wkg||70);const disp=kgToUnit(base,wu)+d;p.goalWeight=r1(unitToKg(disp,wu));save2();};
  $('p-gwup').onclick=()=>gwStep(0.1); $('p-gwdn').onclick=()=>gwStep(-0.1);
  document.querySelectorAll('#p-pace .pace').forEach(b=>b.onclick=()=>{p.rate=+b.dataset.r;save2();});
  document.querySelectorAll('#p-meals .achip').forEach(b=>b.onclick=()=>{
    const cur=Object.assign({Breakfast:true,Lunch:true,Dinner:true,Snack:true}, state.settings.meals||{});
    cur[b.dataset.meal]=!cur[b.dataset.meal];
    if(!MEALS.some(k=>cur[k])) cur[b.dataset.meal]=true; // keep at least one on
    state.settings.meals=cur; save();
    document.querySelectorAll('#p-meals .achip').forEach(x=>x.classList.toggle('on',cur[x.dataset.meal]));
  });
  $('p-set').onclick=()=>{ if(p._target){state.settings.dailyTarget=p._target;save();$('p-saved').innerHTML=`<div class="saved-note">${fmtN(p._target)} kcal set as your daily target ✓</div>`;} };
  paint();
}

