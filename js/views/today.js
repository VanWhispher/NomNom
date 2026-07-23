import {$, esc, last7Logged, loggingStreak, r0, rCal, sum, todayEx, todayFood, todayKey} from '../helpers.js';
import {CAL_SVG, LOGO_SVG, MEALS, dayLabel, setViewDate, shiftDay, state, viewDate} from '../state.js';
import {render} from '../ui/router.js';
import {actMeta} from './add-shared.js';
import {openCalendar} from './calendar.js';
import {editFood} from './manual.js';
import {editExercise} from './weight.js';

/* ---------- TODAY ---------- */
export const MEALCOLOR={Breakfast:'#FFB23E',Lunch:'#18A974',Dinner:'#7C6FE0',Snack:'#E0699A'};
export const ACT_SVG='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="1.6"/><path d="M7 21l3-5 2-3-1-4 4 2 2 3M9 9l4-2"/></svg>';
export const IC_FLAME='<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.4 2.2c.5 2.9-1.2 4.4-2.6 5.9C8.3 9.7 6.5 11.4 6.5 14.2A5.5 5.5 0 0 0 17.5 14.2c0-2-.8-3.5-1.8-4.7-.5 1-1.4 1.6-2.1 1.4 1-2.6.3-6.4-1.2-8.7Z"/><path d="M12 20.5a3 3 0 0 1-3-3c0-1.6 1.3-2.6 2-3.6.6.9 1.2 1.3 1.7 1.2-.3 1.2 0 1.9.6 2.4.5.5.7 1 .7 1.6a3 3 0 0 1-2 3.4Z" fill="#fff" opacity=".85"/></svg>';
export const IC_SPARK='<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l1.8 4.9L18.7 8.7l-4.9 1.8L12 15.4l-1.8-4.9L5.3 8.7l4.9-1.8L12 2z"/><path d="M18.5 13.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z" opacity=".7"/></svg>';
export function renderToday(){
  const food=todayFood(), ex=todayEx();
  const consumed=sum(food,'calories');
  const burned=sum(ex,'caloriesBurned');
  const target=state.settings.dailyTarget;
  const atToday = viewDate===todayKey();
  const subdate=new Date(viewDate+'T00:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  const heroNum = target ? rCal(target-consumed+burned) : rCal(consumed);
  const heroLabel = target ? 'calories remaining' : 'calories eaten';
  let progressHtml='';
  if(target){
    const pct=Math.max(0,Math.min(100,Math.round((consumed-burned)/target*100)));
    progressHtml=`<div class="progress"><div class="track"><div class="fill" style="width:${pct}%"></div></div><div class="pct">${pct}%</div></div>`;
  }
  const band=`
    <div class="band">
      <div class="band-top"><span class="logo"><span class="logo-cat">${LOGO_SVG}</span>NomNom</span><div class="band-actions"><button class="gear" id="open-cal">${CAL_SVG}</button></div></div>
      <div class="bandnav">
        <button class="navbtn" id="day-prev">&#8249;</button>
        <button id="cal-open2" style="background:none;border:none;cursor:pointer;padding:0"><div class="d1">${dayLabel(viewDate)}</div><div class="d2">${subdate}</div></button>
        <button class="navbtn${atToday?' off':''}" id="day-next">&#8250;</button>
      </div>
      <div class="hero">
        <div class="hero-num">${heroNum}</div>
        <div class="hero-label">${heroLabel}</div>
        ${progressHtml}
        <div class="statchips">
          <div class="statchip"><div class="l">Target</div><div class="v">${target?rCal(target):'—'}</div></div>
          <div class="statchip"><div class="l">Food</div><div class="v">${rCal(consumed)}</div></div>
          <div class="statchip"><div class="l">Exercise</div><div class="v">${rCal(burned)}</div></div>
        </div>
      </div>
    </div>`;

  // logging streak (only meaningful for the live day)
  let streakHtml='';
  if(atToday){
    const st=loggingStreak(), days=last7Logged(), loggedToday=days[days.length-1].logged;
    const nline = st>0 ? `<b>${st}</b>-day streak` : `No streak yet`;
    const sub = st>0
      ? (loggedToday ? `Logged today — nice, keep it rolling.` : `Log something today to reach ${st+1} days.`)
      : `Log any food each day to start a streak.`;
    const dots = days.map(d=>`<span class="sd ${d.logged?'on':'off'}${d.today?' today':''}"></span>`).join('');
    streakHtml=`<div class="streak">
      <div class="streak-flame">${IC_FLAME}</div>
      <div class="streak-main"><div class="streak-n">${nline}</div><div class="streak-sub">${sub}</div></div>
      <div class="streak-dots">${dots}</div>
    </div>`;
  }
  // macros card
  const macro=(g,ref,color,label)=>{
    const pct=Math.max(0,Math.min(100,Math.round((g/ref)*100)));
    return `<div class="macrocol"><div class="mv" style="color:${color}">${r0(g)}<s>g</s></div><div class="ml">${label}</div><div class="mbar"><i style="width:${pct}%;background:${color}"></i></div></div>`;
  };
  const macroCard=`<div class="card">
    <div class="card-title" style="margin-bottom:14px">Macros today</div>
    <div class="macrocols">
      ${macro(sum(food,'protein_g'),120,'#18A974','Protein')}
      ${macro(sum(food,'carbs_g'),300,'#F2A93B','Carbs')}
      ${macro(sum(food,'fat_g'),70,'#FF6B4A','Fat')}
    </div></div>`;

  // food card grouped by meal
  let groups='';
  MEALS.forEach(mealName=>{
    const items=food.filter(e=>(e.meal||'Snack')===mealName);
    if(!items.length)return;
    const subtotal=sum(items,'calories');
    groups+=`<div class="mealgroup">
      <div class="meal-line"><div class="ml-left"><span class="meal-dot" style="background:${MEALCOLOR[mealName]}"></span><span class="meal-name">${mealName}</span></div><span class="meal-sub">${rCal(subtotal)} kcal</span></div>
      <div class="fooditems">${items.map(e=>`
        <button class="fooditem" data-edit-food="${e.id}">
          <span style="min-width:0;display:flex;flex-direction:column;gap:2px"><span class="fi-name">${esc(e.name)}</span><span class="fi-sub">${esc(e.servingLabel||r0(e.grams)+' g')}</span></span>
          <span class="fi-right"><span class="fi-cal">${rCal(e.calories)}</span><svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>
        </button>`).join('')}</div>
    </div>`;
  });
  if(!groups)groups=`<div class="empty" style="margin-top:6px">No food logged${atToday?' yet':''}. Tap Add to start.</div>`;
  const foodCard=`<div class="card">
    <div class="card-head"><div class="card-title">Food</div><div class="card-sub">${rCal(consumed)} kcal</div></div>
    ${groups}</div>`;

  // activity card
  const actRows = ex.length ? ex.map((e,i)=>`
    <div class="act-item${i===0?' first':''}" data-edit-ex="${e.id}">
      <div class="act-icon">${actMeta(e.activity).ic}</div>
      <div style="flex:1;min-width:0"><div class="act-name">${esc(e.activity)}</div><div class="act-sub">${e.minutes} min · ${e.intensity}</div></div>
      <div class="act-cal">${rCal(e.caloriesBurned)}</div>
      <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-soft);flex:none;margin-left:6px"><path d="M9 18l6-6-6-6"/></svg>
    </div>`).join('') : `<div class="empty" style="margin-top:0">No exercise logged.</div>`;
  const actCard=`<div class="card">
    <div class="card-head"><div class="card-title">Activity</div><div class="card-sub">${rCal(burned)} kcal</div></div>
    ${actRows}</div>`;

  $('main').innerHTML=band+streakHtml+macroCard+foodCard+actCard;
  $('open-cal').onclick=openCalendar;
  $('cal-open2').onclick=openCalendar;
  $('day-prev').onclick=()=>{setViewDate(shiftDay(viewDate,-1));render();};
  $('day-next').onclick=()=>{if(!atToday){setViewDate(shiftDay(viewDate,1));render();}};
  document.querySelectorAll('[data-edit-food]').forEach(n=>n.onclick=()=>editFood(n.dataset.editFood));
  document.querySelectorAll('[data-edit-ex]').forEach(n=>n.onclick=()=>editExercise(n.dataset.editEx));
}

