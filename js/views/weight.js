import {MET, QUICK} from '../data/met-table.js';
import {$, el, esc, kgToUnit, latestWeightKg, r1, rCal, todayKey, weightDisp} from '../helpers.js';
import {save, state, tab} from '../state.js';
import {makeSheet} from '../ui/bottom-sheet.js';
import {IC_BACK, IC_CHECK, IC_CHEV, IC_CHEVR, IC_MINUS, IC_PLUS, IC_TRASH, IC_X, actMeta} from './add-shared.js';

/* ---------- WEIGHT ---------- */
export function editExercise(id){
  const e=state.exercise.find(x=>x.id===id); if(!e)return;
  const wkg=latestWeightKg();
  const acts=[...QUICK,...Object.keys(MET).filter(a=>!QUICK.includes(a))];
  let activity=e.activity, intensity=e.intensity, minutes=e.minutes;
  const metFor=()=>{
    if(MET[activity] && MET[activity][intensity]!=null) return MET[activity][intensity];   // standard activity picked
    if(e.metMap && e.metMap[intensity]!=null) return e.metMap[intensity];                   // free-typed sport
    return e.met||0;
  };
  const calc=()=>metFor()*(wkg||60)*(minutes/60);
  const sh=makeSheet(`<div id="ee-root"></div>`);
  const root=sh.sheet.querySelector('#ee-root');
  function chooseActivity(){
    root.innerHTML=`<div class="sub-head"><button class="circ-back" id="ee-caback">${IC_BACK}</button><h3>Choose activity</h3></div>
      <div class="chooser">${acts.map(a=>`<button class="choose-row${a===activity?' on':''}" data-a="${esc(a)}">
        <span class="choose-ic">${actMeta(a).ic}</span>
        <span class="choose-main"><span class="cn">${esc(a)}</span><span class="cc">${actMeta(a).cat}</span></span>
        ${a===activity?`<span class="choose-chk">${IC_CHECK}</span>`:''}</button>`).join('')}</div>`;
    root.querySelector('#ee-caback').onclick=draw;
    root.querySelectorAll('.choose-row').forEach(r=>r.onclick=()=>{activity=r.dataset.a;draw();});
  }
  function draw(){
    root.innerHTML=`<div class="edit-head"><span class="edit-title">Edit exercise</span><button class="edit-x" id="ee-x">${IC_X}</button></div>
      <button class="act-pick" id="ee-actbtn"><span class="act-ic">${actMeta(activity).ic}</span>
        <div class="act-main"><div class="an">${esc(activity)}</div><div class="as">${actMeta(activity).cat}</div></div>${IC_CHEV}</button>
      <div class="add-card"><div class="add-card-h">Intensity</div>
        <div class="seg" id="ee-int">
          <button data-i="light"${intensity==='light'?' class="on"':''}>Light</button>
          <button data-i="moderate"${intensity==='moderate'?' class="on"':''}>Moderate</button>
          <button data-i="vigorous"${intensity==='vigorous'?' class="on"':''}>Vigorous</button>
        </div></div>
      <div class="add-card"><div class="dur-h"><span>Duration</span><span class="dur-v"><b id="ee-minv">${minutes}</b> min</span></div>
        <div class="dur-row"><button class="step" id="ee-dec">${IC_MINUS}</button>
          <div class="nn-slider" id="ee-slider"><div class="nn-track"></div><div class="nn-fill" id="ee-fill"></div><div class="nn-thumb" id="ee-thumb"></div></div>
          <button class="step" id="ee-inc">${IC_PLUS}</button></div></div>
      <div class="burned"><div class="burned-l">Calories burned</div><div class="burned-n" id="ee-kcal">${rCal(calc())}</div>
        <div class="burned-s">kcal · estimated from intensity, time${wkg?' &amp; weight':''}</div></div>
      ${wkg?'':'<div class="hint" style="text-align:center;margin-top:8px">Using an estimated 60&nbsp;kg — log your weight for a more accurate burn.</div>'}
      <button class="btn-del-soft" id="ee-del">${IC_TRASH}<span>Delete this entry</span></button>
      <button class="btn btn-primary btn-block" id="ee-save" style="margin-top:14px">Save changes</button>`;
    const MIN=5,MAX=120;
    const sl=root.querySelector('#ee-slider'),fillEl=root.querySelector('#ee-fill'),thumbEl=root.querySelector('#ee-thumb');
    const place=()=>{const f=(minutes-MIN)/(MAX-MIN);fillEl.style.width=(f*100)+'%';thumbEl.style.left='calc('+f+' * (100% - 26px))';};
    const paint=()=>{root.querySelector('#ee-minv').textContent=minutes;root.querySelector('#ee-kcal').textContent=rCal(calc());place();};
    const setFromX=(x)=>{const r=sl.getBoundingClientRect();let f=(x-r.left-13)/(r.width-26);f=Math.max(0,Math.min(1,f));minutes=Math.round(MIN+f*(MAX-MIN));paint();};
    let drag=false;
    sl.addEventListener('pointerdown',ev=>{drag=true;try{sl.setPointerCapture(ev.pointerId);}catch(_){}setFromX(ev.clientX);});
    sl.addEventListener('pointermove',ev=>{if(drag)setFromX(ev.clientX);});
    sl.addEventListener('pointerup',()=>{drag=false;});sl.addEventListener('pointercancel',()=>{drag=false;});
    place();
    root.querySelector('#ee-x').onclick=()=>sh.close();
    root.querySelector('#ee-actbtn').onclick=chooseActivity;
    root.querySelectorAll('#ee-int button').forEach(b=>b.onclick=()=>{intensity=b.dataset.i;root.querySelectorAll('#ee-int button').forEach(x=>x.classList.toggle('on',x===b));root.querySelector('#ee-kcal').textContent=rCal(calc());});
    root.querySelector('#ee-dec').onclick=()=>{minutes=Math.max(MIN,minutes-1);paint();};
    root.querySelector('#ee-inc').onclick=()=>{minutes=Math.min(MAX,minutes+1);paint();};
    root.querySelector('#ee-del').onclick=()=>{state.exercise=state.exercise.filter(x=>x.id!==id);save();sh.close();};
    root.querySelector('#ee-save').onclick=()=>{
      e.activity=activity;e.intensity=intensity;e.minutes=minutes;e.met=metFor();e.caloriesBurned=calc();
      if(MET[activity]){ delete e.custom; delete e.metMap; }   // reverted to a standard activity
      save();sh.close();
    };
  }
  draw();
}
export function ringSVG(pct){
  const r=58,c=2*Math.PI*r,off=c*(1-Math.max(0,Math.min(1,pct||0)));
  return `<svg viewBox="0 0 140 140" width="128" height="128">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--accent-bg)" stroke-width="12"/>
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 70 70)"/>
  </svg>`;
}
export function trendSVG(pts){
  if(pts.length<2)return '<div class="empty" style="border:none">Log at least two mornings to see your trend.</div>';
  const W=320,H=130,padT=10,padB=4,padL=4,padR=4;
  const xs=pts.map(p=>p.t),ys=pts.map(p=>p.v);
  const minX=Math.min(...xs),maxX=Math.max(...xs);
  let minY=Math.min(...ys),maxY=Math.max(...ys);const pad=(maxY-minY)*0.25||1;minY-=pad;maxY+=pad;
  const X=t=>padL+(maxX===minX?0.5:(t-minX)/(maxX-minX))*(W-padL-padR);
  const Y=v=>padT+(1-(v-minY)/(maxY-minY))*(H-padT-padB);
  const daily=pts.map(p=>`${X(p.t)},${Y(p.v)}`).join(' ');
  const avg=pts.map(p=>{const win=pts.filter(q=>q.t<=p.t&&q.t>p.t-7*864e5);return [X(p.t),Y(win.reduce((s,q)=>s+q.v,0)/win.length)];});
  const last=pts[pts.length-1];
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">
    <polyline fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="${avg.map(a=>a.join(',')).join(' ')}"/>
    <polyline fill="none" stroke="var(--accent-strong)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" points="${daily}"/>
    <circle cx="${X(last.t)}" cy="${Y(last.v)}" r="4.5" fill="var(--surface)" stroke="var(--accent-strong)" stroke-width="3"/>
  </svg>`;
}
export let wRange=30, wLogOpen=false, wLogVal=null, wHistPage=0;
export function renderWeight(){
  const wu=state.settings.weightUnit||'kg';
  const p=state.profile;
  const ARR_DN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
  const ARR_UP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  const sorted=[...state.weights].sort((a,b)=>a.date<b.date?-1:1);
  const pts=sorted.map(w=>({t:new Date(w.date+'T00:00:00').getTime(),v:weightDisp(w,wu),w}));
  const curKg=latestWeightKg();
  const cur=curKg!=null?kgToUnit(curKg,wu):null;
  const goal=p.goalWeight!=null?kgToUnit(p.goalWeight,wu):null;
  const nearestBefore=(ms)=>{ let r=null; for(const q of pts){ if(q.t<=ms)r=q; } return r||pts[0]; };
  const lastT=pts.length?pts[pts.length-1].t:Date.now();
  const change=(days)=>{ if(pts.length<2)return null; const before=nearestBefore(lastT-days*864e5); return cur-before.v; };
  const weekCh=change(7), monthCh=change(30);
  const startCh=pts.length>=2?cur-pts[0].v:null;
  const weeksElapsed=pts.length>=2?Math.max(1,(lastT-pts[0].t)/(7*864e5)):0;
  const avgWk=pts.length>=2?startCh/weeksElapsed:null;
  // ring progress toward goal
  const start0=pts.length?pts[0].v:cur;
  let progPct=0, toGo=null;
  if(cur!=null&&goal!=null){ toGo=cur-goal; const denom=(start0-goal); progPct=denom>0?Math.max(0,Math.min(1,(start0-cur)/denom)):(toGo<=0?1:0); }
  const deltaPill=(d)=>{ // d in display unit
    if(d==null)return '';
    const loss=d<-0.05, gain=d>0.05;
    const col=loss?'#18A974':gain?'#E5747A':'#9A938A';
    const bg=loss?'rgba(24,169,116,.12)':gain?'rgba(229,116,122,.12)':'rgba(43,42,38,.05)';
    const arr=loss?ARR_DN:gain?ARR_UP:'';
    return `<span class="delta" style="background:${bg};color:${col}">${arr}<span>${Math.abs(d).toFixed(1)}</span></span>`;
  };
  const stripVal=(d)=>{ if(d==null)return `<span class="v" style="color:var(--text-soft)">—</span>`; const loss=d<-0.05,gain=d>0.05; const col=loss?'#18A974':gain?'#E5747A':'#9A938A'; const arr=loss?`<span style="color:${col}">${ARR_DN}</span>`:gain?`<span style="color:${col}">${ARR_UP}</span>`:''; return `<span class="v" style="color:${col}">${arr.replace('<svg','<svg width=12 height=12')}${Math.abs(d).toFixed(1)}</span>`; };

  // range-filtered pts for chart
  const cutoff=wRange>=9999?0:Date.now()-wRange*864e5;
  const cpts=pts.filter(q=>q.t>=cutoff);

  // BMI
  let bmiHtml='';
  if(curKg&&p.height){ const hm=p.height/100; const bmi=curKg/(hm*hm); const cat=bmi<18.5?'Underweight':bmi<25?'Healthy':bmi<30?'Overweight':'Obese'; const ccol=bmi<18.5?'#7CB8E8':bmi<25?'#18A974':bmi<30?'#F2A93B':'#E5747A'; const pct=Math.max(0,Math.min(100,(bmi-15)/(35-15)*100));
    bmiHtml=`<div class="scard" style="padding:16px 18px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><span style="font-weight:600;font-size:13px;color:var(--text-soft)">BMI</span><div style="display:flex;align-items:baseline;gap:5px"><span style="font-family:var(--display);font-weight:800;font-size:18px;color:${ccol}">${bmi.toFixed(1)}</span><span style="font-size:11.5px;color:var(--text-soft)">${cat}</span></div></div><div class="bmibar"><div class="knob" style="left:${pct}%"></div></div></div>`;
  }

  const ranges=[[7,'1W'],[30,'1M'],[90,'3M'],[9999,'All']];
  $('main').innerHTML=`
    <div class="topbar"><div><h1>Weight</h1><div class="date">${wu}</div></div></div>

    ${cur!=null?`<div class="scard whero" style="margin-top:14px">
      <div class="wring">${ringSVG(progPct)}<div class="ctr"><span class="n">${r1(cur)}</span><span class="u">${wu} now</span></div></div>
      <div style="flex:1;min-width:0">
        ${goal!=null&&toGo!=null?`${weekCh!=null?`<div class="wpill" style="background:rgba(24,169,116,.12)">${(weekCh<-0.05?`<span style="color:#18A974">${ARR_DN}</span>`:weekCh>0.05?`<span style="color:#E5747A">${ARR_UP}</span>`:'')}<span style="color:${weekCh<-0.05?'#18A974':weekCh>0.05?'#E5747A':'#9A938A'}">${Math.abs(weekCh).toFixed(1)} ${wu} / wk</span></div>`:''}
        <div style="font-family:var(--display);font-weight:800;font-size:26px;color:${toGo<=0?'#18A974':'#18A974'};line-height:1">${toGo>0?r1(toGo):'0.0'} ${wu}</div>
        <div style="font-size:12.5px;color:var(--text-soft);margin-top:2px">${toGo>0?`to your ${r1(goal)} ${wu} goal`:`you reached your ${r1(goal)} ${wu} goal 🎉`}</div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--divider);font-size:12px;color:#7c766c">Started at <strong style="color:var(--text)">${r1(start0)} ${wu}</strong> · ${Math.round(progPct*100)}% there</div>`
        :`<div style="font-size:13px;color:var(--text-soft)">Set a goal weight in the <strong style="color:var(--text)">Plan</strong> tab to track your progress.</div>`}
      </div>
    </div>`:`<div class="scard" style="text-align:center;padding:26px 18px;margin-top:14px"><div style="font-family:var(--display);font-weight:700;font-size:17px;color:var(--text)">No weigh-ins yet</div><div style="font-size:13px;color:var(--text-soft);margin-top:4px">Log your first morning below to start tracking.</div></div>`}

    <div class="checkin"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 3 6-7"/><path d="M16 8h4v4"/></svg></div><div class="tx">${cur!=null?'Weigh in at the same time each morning for the most consistent trend.':'Step on the scale first thing tomorrow and log it here.'}</div></div>

    <div id="w-log"></div>

    ${pts.length>=2?`<div class="scard" style="padding:16px 16px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><span class="scard-h" style="margin:0">Trend</span>
        <div class="minitog" id="w-range">${ranges.map(([r,l])=>`<button data-r="${r}"${wRange===r?' class="on"':''}>${l}</button>`).join('')}</div></div>
      ${trendSVG(cpts)}
      <div class="wlegend"><span class="lg"><span style="width:14px;height:3px;border-radius:2px;background:var(--accent-strong)"></span>Daily weigh-in</span><span class="lg"><span style="width:14px;height:2px;border-radius:2px;background:var(--accent)"></span>7-day average</span></div>
    </div>

    <div class="wstrip">
      <div class="col"><div class="l">Week</div><div class="v">${stripVal(weekCh)}</div></div><div class="vline"></div>
      <div class="col"><div class="l">Month</div><div class="v">${stripVal(monthCh)}</div></div><div class="vline"></div>
      <div class="col"><div class="l">Start</div><div class="v">${stripVal(startCh)}</div></div><div class="vline"></div>
      <div class="col"><div class="l">Avg/wk</div><div class="v">${stripVal(avgWk)}</div></div>
    </div>`:''}

    ${bmiHtml}

    ${sorted.length?(()=>{
      const PAGE=10;
      const rev=[...pts].reverse();                                  // newest first
      const rows=rev.map((q,i)=>({q, d:rev[i+1]?q.v-rev[i+1].v:null}));// delta vs the chronologically previous weigh-in
      const pages=Math.max(1,Math.ceil(rows.length/PAGE));
      wHistPage=Math.max(0,Math.min(wHistPage,pages-1));
      const startI=wHistPage*PAGE;
      const pageRows=rows.slice(startI,startI+PAGE);
      const countLbl=pages>1?`${startI+1}–${Math.min(startI+PAGE,rows.length)} of ${rows.length}`:`${rows.length} ${rows.length===1?'entry':'entries'}`;
      return `<div class="whist"><div class="whist-h"><span class="t">History</span><span class="c">${countLbl}</span></div>
      ${pageRows.map(({q,d})=>`<div class="whrow"><span class="lab">${new Date(q.w.date+'T00:00:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})}</span>${deltaPill(d)}<span class="wt">${r1(q.v)} ${wu}</span><button class="del" data-delw="${q.w.date}">${IC_TRASH}</button></div>`).join('')}
      ${pages>1?`<div class="whpager"><button class="whpg" id="wh-prev"${wHistPage===0?' disabled':''}>${IC_BACK}</button><span class="whpg-lbl">Page ${wHistPage+1} / ${pages}</span><button class="whpg" id="wh-next"${wHistPage>=pages-1?' disabled':''}>${IC_CHEVR}</button></div>`:''}
    </div>`;})():''}
  `;

  function renderLog(){
    const host=$('w-log'); if(!host)return;
    if(!wLogOpen){
      host.innerHTML=`<button class="wlog-btn" id="w-open"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Log this morning${cur!=null?`<span class="last">· last ${r1(cur)} ${wu}</span>`:''}</button>`;
      $('w-open').onclick=()=>{ wLogOpen=true; wLogVal=cur!=null?Math.round(cur*10)/10:(wu==='lb'?154:70); renderLog(); };
    } else {
      host.innerHTML=`<div class="scard" style="padding:16px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><span style="font-family:var(--display);font-weight:700;font-size:15px;color:var(--text)">This morning · ${new Date().toLocaleDateString(undefined,{day:'numeric',month:'short'})}</span><button id="w-close" style="border:none;background:none;cursor:pointer;padding:0;display:flex;color:var(--text-soft)">${IC_X}</button></div>
        <div class="wstep"><button id="w-dn" type="button">${IC_MINUS}</button><div style="display:flex;align-items:baseline;gap:4px;justify-content:center"><input class="v" id="w-val" type="number" inputmode="decimal" step="0.1" min="0"><span style="font-family:var(--display);font-weight:700;font-size:16px;color:var(--text-soft)">${wu}</span></div><button id="w-up" type="button">${IC_PLUS}</button></div>
        <button class="cta" id="w-save" style="height:46px;border-radius:14px;margin-top:14px;font-size:16px">Save weigh-in</button></div>`;
      $('w-close').querySelector('svg').style.width='18px'; $('w-close').querySelector('svg').style.height='18px';
      const el=$('w-val');
      const paintV=()=>{ if(document.activeElement!==el) el.value=wLogVal.toFixed(1); };
      paintV();
      $('w-up').onclick=()=>{ wLogVal=Math.round((wLogVal+0.1)*10)/10; paintV(); };
      $('w-dn').onclick=()=>{ wLogVal=Math.max(0,Math.round((wLogVal-0.1)*10)/10); paintV(); };
      el.oninput=()=>{ const n=parseFloat(el.value); if(!isNaN(n)) wLogVal=n; };
      el.onblur=()=>{ wLogVal=Math.max(0,Math.round((wLogVal||0)*10)/10); paintV(); };
      el.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); el.blur(); $('w-save').click(); } };
      $('w-close').onclick=()=>{ wLogOpen=false; renderLog(); };
      $('w-save').onclick=()=>{
        wLogVal=Math.max(0,Math.round((wLogVal||0)*10)/10);
        const k=todayKey(); const exist=state.weights.find(w=>w.date===k);
        if(exist){ exist.weight=wLogVal; exist.unit=wu; } else state.weights.push({date:k,weight:wLogVal,unit:wu});
        wLogOpen=false; wHistPage=0; save(); renderWeight();
      };
    }
  }
  renderLog();
  const rr=$('w-range'); if(rr)rr.querySelectorAll('button').forEach(b=>b.onclick=()=>{wRange=+b.dataset.r;renderWeight();});
  const whP=$('wh-prev'); if(whP)whP.onclick=()=>{ wHistPage--; renderWeight(); };
  const whN=$('wh-next'); if(whN)whN.onclick=()=>{ wHistPage++; renderWeight(); };
  document.querySelectorAll('[data-delw]').forEach(b=>b.onclick=()=>{state.weights=state.weights.filter(w=>w.date!==b.dataset.delw);save();renderWeight();});
}

