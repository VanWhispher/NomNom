import {hasData} from '../cloud-sync.js';
import {$, dateKey, el, esc, r0, sum, todayKey} from '../helpers.js';
import {MEALS, dayLabel, defaultMeal, setTab, setViewDate, shiftDay, state, tab, viewDate} from '../state.js';
import {navClose, navOpen} from '../ui/nav.js';
import {render} from '../ui/router.js';
import {IC_BACK, IC_CHEVR, IC_FORK, IC_X, actMeta} from './add-shared.js';

/* ---------- CALENDAR ---------- */
export function openCalendar(){
  const target=state.settings.dailyTarget;
  const today=todayKey();
  const map={};
  for(const e of state.entries){(map[e.date]=map[e.date]||{c:0,b:0}).c+=e.calories||0;}
  for(const x of state.exercise){(map[x.date]=map[x.date]||{c:0,b:0}).b+=x.caloriesBurned||0;}
  const hasData=(k)=>!!(map[k]&&map[k].c>0);
  const netOf=(k)=>map[k]?(map[k].c-map[k].b):0;
  const consumedOf=(k)=>map[k]?map[k].c:0;
  const burnedOf=(k)=>map[k]?map[k].b:0;
  const metric=(k)=>target!=null?(target-netOf(k)):netOf(k);   // remaining (target − food + exercise) when a target is set
  const lerp=(a,b,t)=>[Math.round(a[0]+(b[0]-a[0])*t),Math.round(a[1]+(b[1]-a[1])*t),Math.round(a[2]+(b[2]-a[2])*t)];
  const lum=(c)=>(0.299*c[0]+0.587*c[1]+0.114*c[2])/255;
  const GLO=[150,226,197],GHI=[16,150,101],RLO=[249,178,180],RHI=[222,54,60];
  const signed=(k)=>{ if(target==null)return r0(metric(k)); const v=metric(k); return (v>0?'+':'')+r0(v); };
  const dayStatCard=(label,day,color)=>`<div class="cal-stat"><div class="stat-hrow"><div class="sh"><span class="cal-dot" style="background:${color}"></span>${label}</div>${day?`<span class="sh-date">${shortLabel(day)}</span>`:''}</div><div class="sv" style="color:${color}">${day?signed(day):'—'}</div>${day?`<div class="stat-mini"><div class="stat-box"><div class="l">Food</div><div class="v">${r0(consumedOf(day))}</div></div><div class="stat-box"><div class="l">Exercise</div><div class="v">${r0(burnedOf(day))}</div></div></div>`:`<div class="sl">No data yet</div>`}</div>`;
  const heat=(k)=>{
    const st=statusOf(k);
    if((st==='under'||st==='over')&&target){
      const rem=target-netOf(k); let f,bg;
      if(rem>=0){ f=Math.min(1,rem/target); bg=lerp(GLO,GHI,f); } else { f=Math.min(1,(-rem)/target); bg=lerp(RLO,RHI,f); }
      return {bg:`rgb(${bg[0]},${bg[1]},${bg[2]})`, fg:lum(bg)>0.62?'#23201c':'#fff'};
    }
    return {bg:CELLBG[st], fg:CELLFG[st]};
  };
  const statusOf=(k)=>{ if(k>today)return 'future'; if(!hasData(k))return 'none'; if(!target)return 'data'; return netOf(k)<=target?'under':'over'; };
  const CELLBG={under:'#18A974',over:'#E5484D',data:'var(--accent-bg)',none:'rgba(43,42,38,.04)',future:'transparent'};
  const CELLFG={under:'#fff',over:'#fff',data:'var(--text)',none:'var(--text-soft)',future:'#D8D2C8'};
  const DOW=['M','T','W','T','F','S','S'];
  const weekStart=(d)=>{ const s=new Date(d); s.setDate(s.getDate()-((s.getDay()+6)%7)); return s; };   // Monday-first
  const shortLabel=(k)=>new Date(k+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
  let mode='month';
  let anchor=new Date(today+'T00:00:00');

  // all-time stats
  const allDays=Object.keys(map).filter(hasData).sort();
  let bestStreak=0;
  if(target){ let run=0,prev=null; for(const k of allDays){ if(netOf(k)<=target){ run=(prev&&shiftDay(prev,1)===k)?run+1:1; bestStreak=Math.max(bestStreak,run); prev=k; } else { run=0; prev=null; } } }
  // "best" and "highest" are opposite ends of the same net (food − exercise) metric, so a big
  // workout can pull a day out of "highest" the same way it helps it toward "best".
  const pickBestHigh=(days)=>{
    let best=null,high=null;
    for(const k of days){
      if(target!=null){
        if(best===null||metric(k)>metric(best))best=k;
        if(high===null||metric(k)<metric(high))high=k;
      } else {
        if(best===null||metric(k)<metric(best))best=k;
        if(high===null||metric(k)>metric(high))high=k;
      }
    }
    return {best,high};
  };
  const {best:bestDay,high:highDay}=pickBestHigh(allDays);
  const daysOnAllTime=target?allDays.filter(k=>netOf(k)<=target).length:0;
  const sectionTitle=(text)=>`<div class="add-label" style="grid-column:1/-1">${text}</div>`;

  const ov=el(`<div class="cal-ov"><div class="cal-head">
      <div class="cal-head-row">
        <button class="cal-rbtn" id="cal-prev">${IC_BACK}</button>
        <span class="cal-title" id="cal-title"></span>
        <div style="display:flex;gap:7px"><button class="cal-rbtn" id="cal-next">${IC_CHEVR}</button><button class="cal-rbtn" id="cal-x">${IC_X}</button></div>
      </div>
      <div class="cal-agg"><span class="net" id="cal-net">—</span><span class="cal-pill" id="cal-pill"></span></div>
      <div class="cal-sub" id="cal-sub"></div>
    </div>
    <div class="cal-body">
      <div class="cal-seg" id="cal-seg"><button data-m="week">1W</button><button data-m="month">1M</button></div>
      <div class="cal-card" id="cal-card"></div>
      <div class="cal-legend"><span class="lg"><span class="sw" style="background:#18A974"></span>Under target</span><span class="lg"><span class="sw" style="background:#E5484D"></span>Over target</span></div>
      <div class="cal-stats" id="cal-stats"></div>
    </div></div>`);
  $('modal-root').appendChild(ov);
  const _navEntry=navOpen(()=>ov.remove());
  const close=()=>{ navClose(_navEntry); ov.remove(); };
  ov.querySelector('#cal-x').onclick=close;
  const jump=(k)=>{ setViewDate(k); setTab('today'); close(); render(); };

  const periodKeys=()=>{
    const keys=[];
    if(mode==='month'){
      const y=anchor.getFullYear(),m=anchor.getMonth(),days=new Date(y,m+1,0).getDate();
      for(let i=1;i<=days;i++)keys.push(dateKey(new Date(y,m,i)));
    }else{
      const s=weekStart(anchor);
      for(let i=0;i<7;i++){const d=new Date(s);d.setDate(s.getDate()+i);keys.push(dateKey(d));}
    }
    return keys;
  };

  function paint(){
    if(mode==='month'){ ov.querySelector('#cal-title').textContent=anchor.toLocaleDateString(undefined,{month:'long',year:'numeric'}); }
    else { const s=weekStart(anchor);const e=new Date(s);e.setDate(s.getDate()+6); ov.querySelector('#cal-title').textContent=`${shortLabel(dateKey(s))} – ${shortLabel(dateKey(e))}`; }
    ov.querySelectorAll('#cal-seg button').forEach(b=>b.classList.toggle('on',b.dataset.m===mode));
    const pk=periodKeys().filter(hasData), daysLogged=pk.length;
    const avg=daysLogged?Math.round(pk.reduce((s,k)=>s+metric(k),0)/daysLogged):0;
    ov.querySelector('#cal-net').textContent=daysLogged?r0(avg):'—';
    const pill=ov.querySelector('#cal-pill');
    if(daysLogged&&target){
      const under=avg>=0;
      pill.style.display='';
      pill.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${under?'<path d="M12 5v14M6 13l6 6 6-6"/>':'<path d="M12 19V5M6 11l6-6 6 6"/>'}</svg><span>${under?'under':'over'}</span>`;
    } else pill.style.display='none';
    ov.querySelector('#cal-sub').textContent=daysLogged?`${target?'avg left/day':'avg net/day'} · ${daysLogged} day${daysLogged===1?'':'s'} logged${target?'':' · set a daily target to track on/over'}`:'No days logged this period';

    const card=ov.querySelector('#cal-card');
    if(mode==='month'){
      const y=anchor.getFullYear(),m=anchor.getMonth(),first=(new Date(y,m,1).getDay()+6)%7,days=new Date(y,m+1,0).getDate();
      let cells='';
      for(let i=0;i<first;i++)cells+=`<div></div>`;
      for(let dd=1;dd<=days;dd++){
        const k=dateKey(new Date(y,m,dd)),h=heat(k),clk=k<=today;
        const kc=hasData(k)?`<span class="k" style="color:${h.fg}">${signed(k)}</span>`:'';
        cells+=`<div class="cal-cell" data-jump="${clk?k:''}" style="background:${h.bg};cursor:${clk?'pointer':'default'}"><span class="d" style="color:${h.fg}">${dd}</span>${kc}</div>`;
      }
      card.innerHTML=`<div class="cal-dow">${DOW.map(d=>`<div>${d}</div>`).join('')}</div><div class="cal-grid">${cells}</div>`;
    }else{
      const s=weekStart(anchor);
      let cells='';
      for(let i=0;i<7;i++){
        const d=new Date(s);d.setDate(s.getDate()+i);const k=dateKey(d),h=heat(k),clk=k<=today;
        const lab=hasData(k)?signed(k):(k>today?'·':'–');
        cells+=`<div style="display:flex;flex-direction:column;align-items:center;gap:4px"><span style="font-size:10px;font-weight:600;color:var(--text-soft)">${DOW[i]}</span>
          <div class="cal-cell" data-jump="${clk?k:''}" style="width:100%;background:${h.bg};border-radius:11px;padding:9px 2px;cursor:${clk?'pointer':'default'}"><span class="d" style="font-size:13px;color:${h.fg}">${d.getDate()}</span><span class="k" style="font-size:9.5px;color:${h.fg}">${lab}</span></div></div>`;
      }
      card.innerHTML=`<div class="cal-grid">${cells}</div>`;
    }
    card.querySelectorAll('[data-jump]').forEach(c=>{ if(c.dataset.jump)c.onclick=()=>openDayDetail(c.dataset.jump); });

    const icC='<svg viewBox="0 0 24 24" fill="none" stroke="#18A974" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    const icF='<svg viewBox="0 0 24 24" fill="none" stroke="#F2A93B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1.5 3 4 4 4 7a4 4 0 01-8 0c0-1 .3-1.8.8-2.5C9 9 12 8 12 2z"/></svg>';

    // week/month sections are scoped to whatever period prev/next has navigated to (not "today"),
    // and only the one matching the current 1W/1M toggle is shown.
    const {best:periodBest,high:periodHigh}=pickBestHigh(periodKeys().filter(hasData));
    let periodTitle;
    if(mode==='week'){ const s=weekStart(anchor);const e=new Date(s);e.setDate(s.getDate()+6); periodTitle=`Week of ${shortLabel(dateKey(s))} to ${shortLabel(dateKey(e))}`; }
    else periodTitle=`Month of ${anchor.toLocaleDateString(undefined,{month:'long',year:'numeric'})}`;

    ov.querySelector('#cal-stats').innerHTML=`
      ${sectionTitle('All Time')}
      <div class="cal-stat"><div class="sh">${icC}Days on target</div><div class="sv" style="color:#18A974">${target?daysOnAllTime:'—'}<small>${target?` /${allDays.length}`:''}</small></div></div>
      <div class="cal-stat"><div class="sh">${icF}Best streak</div><div class="sv" style="color:var(--text)">${target?bestStreak:'—'}<small> days</small></div></div>
      ${dayStatCard('Best day',bestDay,'#18A974')}
      ${dayStatCard('Highest day',highDay,'#E5484D')}
      ${sectionTitle(periodTitle)}
      ${dayStatCard('Best day',periodBest,'#18A974')}
      ${dayStatCard('Highest day',periodHigh,'#E5484D')}`;
  }
  ov.querySelector('#cal-prev').onclick=()=>{ if(mode==='month')anchor.setMonth(anchor.getMonth()-1); else anchor.setDate(anchor.getDate()-7); paint(); };
  ov.querySelector('#cal-next').onclick=()=>{ if(mode==='month')anchor.setMonth(anchor.getMonth()+1); else anchor.setDate(anchor.getDate()+7); paint(); };
  ov.querySelectorAll('#cal-seg button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;paint();});
  paint();
}
export function openDayDetail(key){
  const target=state.settings.dailyTarget;
  const MC={Breakfast:'#F2A93B',Lunch:'#18A974',Dinner:'#FF6B4A',Snack:'#A285CF'};
  const REST='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>';
  const ov=el(`<div class="cal-ov" style="z-index:140"><div class="cal-head">
      <div class="cal-head-row">
        <button class="cal-rbtn" id="dd-x">${IC_X}</button>
        <span class="cal-title" id="dd-date"></span>
        <div style="display:flex;gap:7px"><button class="cal-rbtn" id="dd-prev">${IC_BACK}</button><button class="cal-rbtn" id="dd-next">${IC_CHEVR}</button></div>
      </div>
      <div class="cal-agg"><span class="net" id="dd-net"></span><span id="dd-word" style="font-size:13px;color:rgba(255,255,255,.85);margin-bottom:4px"></span></div>
      <div class="dd-mini">
        <div class="dd-box"><div class="l">Food</div><div class="v" id="dd-food"></div></div>
        <div class="dd-box"><div class="l">Exercise</div><div class="v" id="dd-burn"></div></div>
        <div class="dd-box"><div class="l">Target</div><div class="v" id="dd-tgt"></div></div>
      </div>
    </div>
    <div class="cal-body" id="dd-body"></div></div>`);
  $('modal-root').appendChild(ov);
  let cur=key;
  const _navEntry=navOpen(()=>ov.remove());
  ov.querySelector('#dd-x').onclick=()=>{ navClose(_navEntry); ov.remove(); };
  ov.querySelector('#dd-prev').onclick=()=>{cur=shiftDay(cur,-1);paint();};
  ov.querySelector('#dd-next').onclick=()=>{cur=shiftDay(cur,1);paint();};
  function paint(){
    const food=state.entries.filter(e=>e.date===cur);
    const exs=state.exercise.filter(e=>e.date===cur);
    const consumed=sum(food,'calories'), burned=sum(exs,'caloriesBurned');
    ov.querySelector('#dd-date').textContent=dayLabel(cur);
    if(target!=null){ const v=target-consumed+burned; ov.querySelector('#dd-net').textContent=r0(Math.abs(v)); ov.querySelector('#dd-word').textContent=v>=0?'calories left':'over target'; }
    else { ov.querySelector('#dd-net').textContent=r0(consumed-burned); ov.querySelector('#dd-word').textContent='net intake'; }
    ov.querySelector('#dd-food').textContent=r0(consumed);
    ov.querySelector('#dd-burn').textContent=r0(burned);
    ov.querySelector('#dd-tgt').textContent=target!=null?r0(target):'—';
    let foodHtml='';
    MEALS.forEach(mn=>{
      const items=food.filter(e=>(e.meal||defaultMeal())===mn);
      if(!items.length)return;
      foodHtml+=`<div class="dd-meal"><div class="dd-meal-h"><div class="nm"><span class="dot" style="background:${MC[mn]||'#999'}"></span>${mn}</div><div class="sub">${r0(sum(items,'calories'))} kcal</div></div>${items.map(it=>`<div class="dd-item"><span class="nm">${esc(it.name)}</span><span class="kc">${r0(it.calories)}</span></div>`).join('')}</div>`;
    });
    if(!foodHtml)foodHtml=`<div class="dd-rest" style="padding-top:10px"><div class="ic">${IC_FORK}</div>No food logged</div>`;
    const exHtml = exs.length
      ? exs.map(e=>`<div class="dd-ex"><div class="ic">${actMeta(e.activity).ic}</div><div class="mn"><div class="n">${esc(e.activity)}</div><div class="s">${e.minutes} min · ${e.intensity}</div></div><div class="kc">${r0(e.caloriesBurned)}</div></div>`).join('')
      : `<div class="dd-rest"><div class="ic">${REST}</div>Rest day — no activity logged</div>`;
    ov.querySelector('#dd-body').innerHTML=`
      <div class="dd-card"><div class="dd-card-h"><div class="t">Food</div><div class="s">${r0(consumed)} kcal</div></div>${foodHtml}</div>
      <div class="dd-card"><div class="dd-card-h"><div class="t">Activity</div><div class="s">${r0(burned)} kcal</div></div><div style="margin-top:12px">${exHtml}</div></div>`;
  }
  paint();
}
