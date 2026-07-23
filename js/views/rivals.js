import {hasData} from '../cloud-sync.js';
import {$, dateKey, el, esc, latestWeightKg, r0, r1, rCal, sum, todayKey, unitToKg} from '../helpers.js';
import {CLOUD, MEALS, RV_THEM, RV_THEM_BG, RV_THEM_LT, RV_YOU, RV_YOU_BG, RV_YOU_LT, applyTheme, load, rvSyncColors, save, sb, setTab, state, tab, user} from '../state.js';
import {_navStack, closeAllModals, openModal} from '../ui/nav.js';
import {MEALCOLOR} from './today.js';

/* ================================================================
   RIVALS — head-to-head competition with one friend
   Fairness: each person races their own Plan-tab target, so different
   genders / weights / goals compete on adherence, not raw kg.
   Only DERIVED scores (points + %-progress) ever leave the device.
   ================================================================ */

/* Rivals colours (RV_YOU / RV_THEM / …) are theme-aware — set in rvSyncColors(), called from applyTheme(). */

/* ----- scoring (pure functions of local state) ----- */
export function compCalorieScore(C,T){                 // 0..80
  if(!T)return 0;
  if(C<=T)return 80;
  return Math.max(0, 80*(1-(C-T)/(0.25*T)));
}
export function compDayCalories(d){ return sum(state.entries.filter(e=>e.date===d),'calories'); }
export function compDayExercise(d){ return sum(state.exercise.filter(e=>e.date===d),'caloriesBurned'); }
export function compDayNet(d){ return Math.max(0, compDayCalories(d)-compDayExercise(d)); }  // exercise earns back headroom
export function compDayLogged(d){ return state.entries.some(e=>e.date===d); }
export function compDailyScore(d){                      // 0..100
  const T=state.settings.dailyTarget;
  if(!T || !compDayLogged(d)) return 0;          // no log = 0 (showing up is the point)
  return 20 + compCalorieScore(compDayNet(d), T);  // net = food − exercise vs target
}
export function earliestWeightKg(){
  if(!state.weights||!state.weights.length)return null;
  const w=[...state.weights].sort((a,b)=>a.date<b.date?-1:1)[0];
  return unitToKg(w.weight, w.unit||'kg');
}
// Progress to goal weight: how far your latest weigh-in has moved from your
// true starting weight (first weigh-in) toward your goal. 0..100%.
// Display-only — it does not feed the points race.
export function compProgressPct(){
  const goal=state.profile.goalWeight, start=earliestWeightKg(), cur=latestWeightKg();
  if(goal==null||start==null||cur==null||start===goal)return null;
  const p=(start-cur)/(start-goal)*100;
  if(!isFinite(p))return null;
  return Math.max(0,Math.min(100,p));
}

/* ----- week / range helpers ----- */
export function compWeekMonday(offset){                 // offset weeks back; 0 = this week
  const now=new Date(); const o=(now.getDay()+6)%7; // 0=Mon
  const mon=new Date(now); mon.setDate(now.getDate()-o-7*(offset||0)); mon.setHours(0,0,0,0);
  return mon;
}
export function compWeekDaysFor(offset){
  const mon=compWeekMonday(offset), out=[];
  for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);out.push(dateKey(d));}
  return out;
}
export function compWeekDays(){ return compWeekDaysFor(0); }
export function comp28Days(){
  const start=compWeekMonday(3), out=[];
  for(let i=0;i<28;i++){const d=new Date(start);d.setDate(start.getDate()+i);out.push(dateKey(d));}
  return out;                                    // 4 ISO weeks ending this Sunday
}
export function compDaysLeftWeek(){ const idx=(new Date().getDay()+6)%7; return 6-idx; }
export function compDaysLeftMonth(){
  const now=new Date(); const end=new Date(now.getFullYear(),now.getMonth()+1,0);
  return Math.max(0, Math.round((end-now)/86400000));
}

/* ----- who am I (display name, matches Settings) ----- */
export function compMyName(){
  const meta=(user&&user.user_metadata)||{}, email=(user&&user.email)||'';
  const namePart=(email.split('@')[0]||'').replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  return meta.full_name||meta.name||namePart||'You';
}
export function rvInitial(n){ return ((n||'?').trim()[0]||'?').toUpperCase(); }

/* ----- code normalisation (fixes join: prefix is fixed, we only need 4 chars) ----- */
export function compNormalizeCode(raw){
  let s=String(raw||'').toUpperCase().replace(/\s+/g,'');
  s=s.replace(/^NOM[-\s]?/,'').replace(/[^A-Z0-9]/g,'');
  return 'NOM-'+s;
}

/* ----- Supabase wrappers ----- */
export async function compCreate(){
  const name=compMyName();
  const {data,error}=await sb.rpc('create_competition',{p_display_name:name});
  if(error)throw error;
  state.competition={id:data.id,code:data.code,role:'host',startWeightKg:latestWeightKg(),name};
  save();
  return data;
}
export async function compJoin(code){
  const name=compMyName();
  const {data,error}=await sb.rpc('join_competition',{p_code:compNormalizeCode(code),p_display_name:name});
  if(error)throw error;
  state.competition={id:data.id,code:data.code,role:'guest',startWeightKg:latestWeightKg(),name};
  save();
  return data;
}
// compact food entry for sharing with a rival (short keys keep the payload small)
export function rvDiaryEntry(e){
  return {m:e.meal||'Snack', n:e.name||'', s:e.servingLabel||(r0(e.grams)+' g'),
    c:r0(e.calories||0), p:r1(e.protein_g||0), cb:r1(e.carbs_g||0), f:r1(e.fat_g||0)};
}
export async function compPushMine(){
  const c=state.competition; if(!c||!CLOUD||!user)return;
  const days=comp28Days(), tk=todayKey(), pct=compProgressPct(), now=new Date().toISOString();
  const past=days.filter(d=>d<=tk);
  const rows=past.map(d=>({
    competition_id:c.id, user_id:user.id, date:d,
    daily_points:Math.round(compDailyScore(d)), logged:compDayLogged(d),
    progress_pct:pct, updated_at:now
  }));
  if(rows.length) await sb.from('competition_scores').upsert(rows,{onConflict:'competition_id,user_id,date'});
  // share the actual food diary (overwrites each day, so deletions propagate). Degrades quietly if the table isn't set up yet.
  try{
    const myTgt=state.settings.dailyTarget||null;                 // so a rival can see how much you were over/under
    const drows=past.map(d=>{
      const items=state.entries.filter(e=>e.date===d).map(rvDiaryEntry);
      const dayEx=r0(compDayExercise(d));                          // derived total only — no workout detail leaves the device
      if(items.length){
        if(myTgt!=null) items[0].dt=myTgt;                         // stash target/exercise on the first item; old clients ignore unknown keys
        if(dayEx) items[0].eb=dayEx;
      } else if(myTgt!=null || dayEx){
        items.push({m:'',n:'',s:'',c:0, ...(myTgt!=null?{dt:myTgt}:{}), ...(dayEx?{eb:dayEx}:{})});   // metadata-only sentinel for a no-food day
      }
      return { competition_id:c.id, user_id:user.id, date:d, entries:items, updated_at:now };
    });
    if(drows.length) await sb.from('competition_diary').upsert(drows,{onConflict:'competition_id,user_id,date'});
  }catch(e){}
}
// lazy: pull one rival-day's diary only when the user opens it
export async function compFetchDiary(userId,date){
  const c=state.competition; if(!c)return {items:[],target:null,exerciseBurned:0};
  const {data,error}=await sb.from('competition_diary').select('entries')
    .eq('competition_id',c.id).eq('user_id',userId).eq('date',date).maybeSingle();
  if(error)throw error;
  const raw=(data&&Array.isArray(data.entries))?data.entries:[];
  let target=null, exerciseBurned=0;
  for(const x of raw){ if(x){ if(x.dt!=null && target==null)target=+x.dt; if(x.eb!=null)exerciseBurned=+x.eb; } }
  const items=raw.filter(x=>x&&x.n);                               // drop the no-food sentinel from the food list
  return {items, target, exerciseBurned};
}
export async function compFetchAll(){
  const c=state.competition; if(!c)return null;
  const days=comp28Days();
  const [memR,scR,cmpR]=await Promise.all([
    sb.from('competition_members').select('user_id,display_name').eq('competition_id',c.id),
    sb.from('competition_scores').select('user_id,date,daily_points,logged,progress_pct').eq('competition_id',c.id).in('date',days),
    sb.from('competitions').select('status,invite_code,started_at').eq('id',c.id).maybeSingle()
  ]);
  if(memR.error)throw memR.error;
  const members=memR.data||[], scores=scR.data||[];
  const status=(cmpR.data&&cmpR.data.status)||'pending';
  const startedAt=(cmpR.data&&cmpR.data.started_at)||null;
  if(startedAt && c.startedAt!==startedAt){ c.startedAt=startedAt; save(); }  // lock in the shared start moment
  const mk=(id,name)=>({id,name,byDate:{},pct:null});
  const users={};
  members.forEach(m=>users[m.user_id]=mk(m.user_id,m.display_name||'Player'));
  scores.forEach(r=>{
    const u=users[r.user_id]; if(!u)return;
    u.byDate[r.date]={points:r.daily_points||0,logged:!!r.logged};
    if(r.progress_pct!=null)u.pct=r.progress_pct;
  });
  const me=users[user.id]||mk(user.id,c.name);
  const them=Object.values(users).find(u=>u.id!==user.id)||null;
  return {status,me,them,startedAt,invite:(cmpR.data&&cmpR.data.invite_code)||c.code};
}
export async function compLeave(){
  const c=state.competition; if(!c)return;
  try{ await sb.from('competition_members').delete().eq('competition_id',c.id).eq('user_id',user.id); }catch(e){}
  state.competition=null; save();
}

/* ----- competition start date (the day both parties joined) ----- */
export function isoToLocalDateKey(iso){ try{ return dateKey(new Date(iso)); }catch(e){ return null; } }
export function compStartDate(){
  const c=state.competition, s=c&&c.startedAt;
  return s?isoToLocalDateKey(s):null;
}
// keep only days on/after the competition start and on/before today
export function compCountDates(dates){
  const start=compStartDate(), tk=todayKey();
  return dates.filter(d=> d<=tk && (!start || d>=start));
}

/* ----- per-user aggregation over a set of dates ----- */
export function rvAgg(u,dates){
  let p=0,l=0; if(u) dates.forEach(d=>{const e=u.byDate[d]; if(e){p+=e.points; if(e.logged)l++;}});
  return {points:p, logged:l, logging:20*l, calorie:Math.max(0,p-20*l)};
}

/* ================================================================
   RENDER — the Rivals tab (into #main)
   ================================================================ */
export let rivalsMode='week';      // 'week' | 'month'
export let rivalsView='intro';     // 'intro' | 'join' (only when no competition)
export let rivalsData=null;
export let _rivalsStale=true, _rivalsLoading=false;
export function setRivalsStale(v){_rivalsStale=v;}
export let _rvTimer=null, _rvSig='';

export function renderRivals(){
  rivalsInitDelegation();
  const main=$('main');
  if(!(CLOUD&&user)){
    main.innerHTML=`<div class="rv-empty"><div class="rv-emoji">🔒</div><h3>Sign in to compete</h3><p>Rivals needs an account so you and your friend can share a scoreboard.</p></div>`;
    return;
  }
  if(!state.competition){
    rivalsView==='join' ? rvRenderJoin() : rvRenderIntro();
    return;
  }
  rivalsStartAuto();
  if(_rivalsStale && !_rivalsLoading) rivalsLoad();
  if(rivalsData && rivalsData.error){ rvRenderError(rivalsData.error); return; }
  if(!rivalsData){ main.innerHTML=rvHeader('Rivals','Loading…')+`<div class="rv-empty"><div class="rv-spin"></div></div>`; return; }
  if(!rivalsData.them){ rvRenderPending(); return; }
  rvRenderBoard();
}

export async function rivalsLoad(){
  _rivalsLoading=true; _rivalsStale=false;
  try{ await compPushMine(); rivalsData=await compFetchAll(); _rvSig=rvDataSig(rivalsData); }
  catch(e){ rivalsData={error:(e&&e.message)||'Could not load the scoreboard.'}; }
  _rivalsLoading=false;
  if(tab==='rivals') renderRivals();
}
export function rivalsRefresh(){ _rivalsStale=true; renderRivals(); }

/* ---- auto-refresh (silent polling while on the tab) ---- */
export function rvUserSig(u){ return u?[u.pct,Object.keys(u.byDate).sort().map(d=>d+':'+u.byDate[d].points+(u.byDate[d].logged?'1':'0')).join(',')].join('|'):'∅'; }
export function rvDataSig(d){ return d?[d.status,d.startedAt,rvUserSig(d.me),rvUserSig(d.them)].join('~'):''; }
export function rivalsStartAuto(){
  if(_rvTimer)return;
  _rvTimer=setInterval(()=>{
    if(tab!=='rivals'||!state.competition){ clearInterval(_rvTimer); _rvTimer=null; return; }
    if(document.hidden)return;
    if(_navStack.length)return;                         // a modal is open — don't disrupt
    if(document.getElementById('rv-menu-pop'))return;   // menu open
    rivalsSilentRefresh();
  }, 20000);
}
export async function rivalsSilentRefresh(){
  if(!(CLOUD&&user)||!state.competition||_rivalsLoading)return;
  try{
    await compPushMine();
    const d=await compFetchAll();
    const sig=rvDataSig(d);
    rivalsData=d;
    if(tab==='rivals' && sig!==_rvSig && !_navStack.length && !document.getElementById('rv-menu-pop')){ _rvSig=sig; renderRivals(); }
    else _rvSig=sig;
  }catch(e){/* silent */}
}

/* ---- shared bits ---- */
export const RV_PEOPLE='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 6.5a3 3 0 0 1 0 6M17 20a5.5 5.5 0 0 0-2.5-4.6"/></svg>';
export const RV_BOOK='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z"/><path d="M9 7.5h7M9 11h5"/></svg>';
export function rvHeader(title,sub,menu){
  return `<div class="topbar rv-topbar">
    <div><h1>${esc(title)}</h1>${sub?`<div class="date">${esc(sub)}</div>`:''}</div>
    <div class="band-actions">
      <button class="gear" id="rv-rules" aria-label="How points work">${RV_BOOK}</button>
      ${menu?`<button class="gear" id="rv-menu" aria-label="Options">${RV_PEOPLE}</button>`:''}
    </div>
  </div>`;
}
export function rvWireHeader(){ /* header buttons handled by delegation (rivalsInitDelegation) */ }
export function rivalsInitDelegation(){
  if(window._rvDeleg)return; window._rvDeleg=true;
  document.addEventListener('click',(e)=>{
    if(tab!=='rivals')return;
    const t=e.target;
    if(t.closest&&t.closest('#rv-rules')){ e.preventDefault(); openRivalsRules(); return; }
    const mb=t.closest&&t.closest('#rv-menu');
    if(mb){ e.preventDefault(); rvToggleMenu(mb); return; }
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && tab==='rivals' && state.competition){ rivalsSilentRefresh(); }
  });
}
export function openRivalsRules(){
  const T=state.settings.dailyTarget;
  openModal('How points work',`
    <div class="rv-rules">
      <p class="rv-rules-lead">You each race your <b>own</b> daily calorie target — so different bodies, genders and goals compete fairly. Points come from sticking to your plan, not from the scale.</p>

      <div class="rv-rule">
        <div class="rv-rule-ic" style="background:${RV_YOU_BG};color:${RV_YOU}">✓</div>
        <div><div class="rv-rule-t">Log your day — <b>+20</b></div>
        <div class="rv-rule-s">Any food logged that day earns 20 points. Showing up counts.</div></div>
      </div>

      <div class="rv-rule">
        <div class="rv-rule-ic" style="background:${RV_YOU_BG};color:${RV_YOU}">◎</div>
        <div><div class="rv-rule-t">Stay within your target — up to <b>+80</b></div>
        <div class="rv-rule-s">Scored on food minus exercise. If that net is at or under your daily target${T?` (${rCal(T,{group:true})} kcal)`:''} you earn the full 80 — so a workout buys back headroom. Going a little over earns less; a big overage tapers to 0. Eating under is never penalised.</div></div>
      </div>

      <div class="rv-rule">
        <div class="rv-rule-ic" style="background:${RV_THEM_BG};color:${RV_THEM}">△</div>
        <div><div class="rv-rule-t">Progress to goal weight</div>
        <div class="rv-rule-s">Shown separately as how close your latest weigh-in is to your goal, measured from your starting weight. It's a parallel race — it doesn't add to your daily points.</div></div>
      </div>

      <div class="rv-rule">
        <div class="rv-rule-ic" style="background:#F1EBE1;color:#8A8172">↻</div>
        <div><div class="rv-rule-t">Weekly reset</div>
        <div class="rv-rule-s">The head-to-head points race resets every Monday. "This month" totals the last four weeks.</div></div>
      </div>

      <div class="rv-rules-foot">Best possible day: <b>100 points</b> (20 for logging + 80 for keeping food − exercise within your target).</div>
    </div>
  `);
}
export function rvAvatar(letter,color,bg,ring){
  return `<div class="rv-av" style="background:${bg};color:${color};border-color:${ring||'#fff'}">${esc(letter)}</div>`;
}

/* ---- intro (no competition) ---- */
export function rvRenderIntro(){
  const noTarget=!state.settings.dailyTarget;
  $('main').innerHTML=rvHeader('Rivals','')+`
    <div class="rv-empty">
      <div class="rv-emoji">🏁</div>
      <h3>Race a friend</h3>
      <p>Compete on sticking to your plan — not on the scale. You each race your own daily target, so different bodies and goals stay fair.</p>
    </div>
    <button class="btn btn-primary btn-block" id="rv-create">Start a competition</button>
    <button class="btn btn-block" id="rv-joinbtn" style="margin-top:10px">Join with a code</button>
    ${noTarget?`<div class="rv-note">Set a daily calorie target in the Plan tab first — it's what makes the scoring fair.</div>`:''}
  `;
  const cr=$('rv-create');
  cr.onclick=async()=>{
    if(noTarget){ toastComp('Set a daily target in Plan first.'); return; }
    cr.disabled=true; cr.textContent='Creating…';
    try{ await compCreate(); rivalsData=null; _rivalsStale=true; renderRivals(); }
    catch(e){ cr.disabled=false; cr.textContent='Start a competition'; toastComp((e&&e.message)||'Could not create.'); }
  };
  $('rv-joinbtn').onclick=()=>{ rivalsView='join'; renderRivals(); };
}

/* ---- join form (fixed NOM- prefix, only 4 chars typed) ---- */
export function rvRenderJoin(){
  $('main').innerHTML=rvHeader('Join a rival','')+`
    <div class="rv-empty" style="padding-bottom:8px">
      <div class="rv-emoji">🔑</div>
      <h3>Enter the code</h3>
      <p>Type the 4 characters your friend shared. The <b>NOM-</b> part is already filled in.</p>
    </div>
    <div class="rv-codebox">
      <span class="rv-codepre">NOM-</span>
      <input id="rv-code" class="rv-codeinp" maxlength="6" placeholder="XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" inputmode="text">
    </div>
    <button class="btn btn-primary btn-block" id="rv-do" style="margin-top:16px">Join</button>
    <button class="btn btn-block" id="rv-back" style="margin-top:10px">Back</button>
    <div id="rv-jmsg"></div>
  `;
  const inp=$('rv-code'); inp.focus();
  inp.oninput=()=>{ inp.value=inp.value.toUpperCase().replace(/[^A-Z0-9]/g,''); };
  const go=async()=>{
    const raw=inp.value.trim(); if(!raw){ inp.focus(); return; }
    if(!state.settings.dailyTarget){ toastComp('Set a daily target in Plan first.'); return; }
    const btn=$('rv-do'); btn.disabled=true; btn.textContent='Joining…';
    try{ await compJoin(raw); rivalsView='intro'; rivalsData=null; _rivalsStale=true; renderRivals(); }
    catch(e){
      btn.disabled=false; btn.textContent='Join';
      $('rv-jmsg').innerHTML=`<div class="rv-note" style="color:#E5533A">${esc((e&&e.message)||'Could not join.')}</div>`;
    }
  };
  $('rv-do').onclick=go;
  inp.onkeydown=(e)=>{ if(e.key==='Enter')go(); };
  $('rv-back').onclick=()=>{ rivalsView='intro'; renderRivals(); };
}

/* ---- pending (waiting for the friend to join) ---- */
export function rvRenderPending(){
  const c=state.competition, code=(rivalsData&&rivalsData.invite)||c.code;
  $('main').innerHTML=rvHeader('Rivals','Waiting for your friend',true)+`
    <div class="rv-empty" style="padding-bottom:6px">
      <div class="rv-emoji">📨</div>
      <h3>Share your code</h3>
      <p>Send this to your friend. The race begins the moment they join with it.</p>
    </div>
    <div class="rv-code">${esc(code)}</div>
    <button class="btn btn-primary btn-block" id="rv-share">Share code</button>
    <button class="btn btn-block" id="rv-check" style="margin-top:10px">I've shared it — check now</button>
    <button class="rv-leave" id="rv-cancel">Cancel competition</button>
  `;
  rvWireHeader();
  $('rv-share').onclick=()=>rvShare(code);
  $('rv-check').onclick=rivalsRefresh;
  $('rv-cancel').onclick=async()=>{ await compLeave(); rivalsData=null; renderRivals(); };
}

export function rvRenderError(msg){
  $('main').innerHTML=rvHeader('Rivals','',true)+`
    <div class="rv-note" style="color:#E5533A;margin-top:26px">${esc(msg)}</div>
    <button class="btn btn-block" id="rv-retry" style="margin-top:14px">Try again</button>`;
  rvWireHeader();
  $('rv-retry').onclick=rivalsRefresh;
}

export async function rvShare(code){
  const txt=`Join my NomNom competition — code ${code}`;
  if(navigator.share){ try{ await navigator.share({text:txt}); }catch(e){} }
  else{ try{ await navigator.clipboard.writeText(code); toastComp('Code copied'); }catch(e){ toastComp(code); } }
}

/* ---- menu (top-right people icon → refresh / leave) ---- */
export function rvToggleMenu(b){
  const existing=document.getElementById('rv-menu-pop'); if(existing){existing.remove();return;}
  const pop=el(`<div id="rv-menu-pop" class="rv-pop">
    <button data-act="refresh">Refresh now</button>
    <button data-act="leave" class="danger">Leave competition</button>
  </div>`);
  const anchor=b.closest('.rv-topbar')||b.parentElement;
  anchor.appendChild(pop);
  pop.querySelector('[data-act="refresh"]').onclick=()=>{ pop.remove(); rivalsRefresh(); };
  pop.querySelector('[data-act="leave"]').onclick=async()=>{
    pop.remove();
    if(confirm('Leave this competition? Your scores will stop syncing.')){ await compLeave(); rivalsData=null; renderRivals(); }
  };
  setTimeout(()=>{ document.addEventListener('click',function h(ev){ if(!pop.contains(ev.target)&&!(ev.target.closest&&ev.target.closest('#rv-menu'))){pop.remove();document.removeEventListener('click',h);} }); },0);
}

/* ---- the scoreboard ---- */
export function rvBar(myVal,theirVal){
  const a=Math.max(0,myVal), b=Math.max(0,theirVal), tot=a+b;
  if(tot<=0) return `<div class="rv-split"><div style="flex:1;background:#EFE9DF"></div></div>`;
  return `<div class="rv-split">
    <div style="flex:${a||0.001};background:${RV_YOU}"></div>
    <div style="flex:${b||0.001};background:${RV_THEM_LT}"></div>
  </div>`;
}
export function rvBreakRow(label,my,their,suffix,myLead){
  const you=`<b style="color:${RV_YOU}">${my}${suffix||''}</b>`;
  const them=`<b style="color:${RV_THEM}">${their}${suffix||''}</b>`;
  return `<div class="rv-brow">
    <div class="rv-brow-h"><span>${esc(label)}</span>
      <span class="rv-brow-v">${myLead?you:my+(suffix||'')} vs ${myLead?their+(suffix||''):them}</span></div>
    <div class="rv-dual">
      <div class="rv-dbar" style="flex:${Math.max(my,0.001)};background:${my>=their?RV_YOU:RV_YOU_LT}"></div>
      <div class="rv-dbar" style="flex:${Math.max(their,0.001)};background:${their>my?RV_THEM:RV_THEM_LT}"></div>
    </div>
  </div>`;
}
export function rvGoalRow(name,pct,color){
  const p=pct==null?null:Math.round(pct);
  return `<div class="rv-grow">
    <div class="rv-grow-h"><span>${esc(name)}</span><b style="color:${color}">${p==null?'—':p+'%'}</b></div>
    <div class="rv-gbar"><span style="width:${p==null?0:Math.max(2,Math.min(100,p))}%;background:${color}"></span></div>
  </div>`;
}
export function rvGoalCard(mePct,themPct,themName){
  const body = (mePct==null && themPct==null)
    ? `<div class="rv-brow-s">Log your weight and set a goal in the Weight tab to track this.</div>`
    : rvGoalRow('You',mePct,RV_YOU)+rvGoalRow(themName,themPct,RV_THEM);
  return `<div class="rv-card">
    <div class="rv-card-h">Progress to goal weight</div>
    ${body}
  </div>`;
}

export function rvFmtDay(dk){
  try{ return new Date(dk+'T00:00:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'}); }
  catch(e){ return dk; }
}
/* ---- view a rival's food diary for one day (lazy-loaded) ---- */
export async function rvOpenDiary(userId,name,dk){
  const m=openModal(`${name}'s day`,`<div class="rv-diary-load"><div class="rv-spin"></div></div>`);
  const body=m.querySelector('#m-body');
  let res;
  try{ res=await compFetchDiary(userId,dk); }
  catch(e){ body.innerHTML=`<div class="rv-note" style="color:#E5533A">Couldn't load their day. Pull to refresh and try again.</div>`; return; }
  if(!m.parentNode)return;                                   // closed while loading
  const items=res.items||[];
  const theirTarget=res.target;
  const theirExercise=res.exerciseBurned||0;
  const total=items.reduce((s,x)=>s+(+x.c||0),0);
  const myTotal=sum(state.entries.filter(e=>e.date===dk),'calories');
  const myTarget=state.settings.dailyTarget||null;
  const myExercise=compDayExercise(dk);
  const dash=(v)=>v==null?'—':rCal(v,{group:true});
  const diaryCard=(label,tot,tgt,ex)=>{
    // score = food - exercise - target (net of exercise earned back), same red/under-green coding as before
    let color='var(--text)', scoreHtml=`${rCal(tot,{group:true})} <span>kcal</span>`;
    if(tgt!=null){
      const diff=tot-ex-tgt, over=diff>0;
      color=over?'#E5747A':'#18A974';
      scoreHtml=`${rCal(Math.abs(diff),{group:true})} <span>${over?'over':'under'}</span>`;
    }
    return `<div class="rv-dc">
      <div class="rv-dc-tot" style="color:${color}">${scoreHtml}</div>
      <div class="rv-dc-name">${esc(label)}</div>
      <div class="rv-dc-mini">
        <div class="rv-dc-box"><div class="l">Food</div><div class="v">${rCal(tot,{group:true})}</div></div>
        <div class="rv-dc-box"><div class="l">Exercise</div><div class="v">${dash(ex)}</div></div>
        <div class="rv-dc-box"><div class="l">Target</div><div class="v">${dash(tgt)}</div></div>
      </div>
    </div>`;
  };
  let groups='';
  MEALS.forEach(mn=>{
    const its=items.filter(x=>(x.m||'Snack')===mn); if(!its.length)return;
    const sub=its.reduce((s,x)=>s+(+x.c||0),0);
    groups+=`<div class="mealgroup">
      <div class="meal-line"><div class="ml-left"><span class="meal-dot" style="background:${MEALCOLOR[mn]}"></span><span class="meal-name">${mn}</span></div><span class="meal-sub">${rCal(sub)} kcal</span></div>
      <div class="fooditems">${its.map(x=>`
        <div class="fooditem" style="cursor:default">
          <span style="min-width:0;display:flex;flex-direction:column;gap:2px"><span class="fi-name">${esc(x.n)}</span><span class="fi-sub">${esc(x.s||'')}</span></span>
          <span class="fi-right"><span class="fi-cal">${rCal(x.c)}</span></span>
        </div>`).join('')}</div>
    </div>`;
  });
  if(!groups) groups=`<div class="empty" style="margin-top:6px">No food logged this day.</div>`;
  body.innerHTML=`
    <div class="rv-diary-head2">
      ${diaryCard(name,total,theirTarget,theirExercise)}
      ${diaryCard('You',myTotal,myTarget,myExercise)}
    </div>
    <div class="rv-diary-date2">${esc(rvFmtDay(dk))}</div>${groups}`;
}

export function rvRenderBoard(){
  const d=rivalsData, me=d.me, them=d.them;
  const meName=me.name||compMyName(), themName=them.name||'Rival';
  const mode=rivalsMode;
  const dates=compCountDates(mode==='week'?compWeekDaysFor(0):comp28Days());
  const A=rvAgg(me,dates), B=rvAgg(them,dates);
  const diff=A.points-B.points;
  const total=A.points+B.points;
  const meShare=total>0?Math.round(A.points/total*100):50;
  const daysLeft=mode==='week'?compDaysLeftWeek():compDaysLeftMonth();
  const leadTxt = diff>0 ? `You're ahead by ${diff}` : diff<0 ? `${esc(themName)} leads by ${-diff}` : `All square`;
  const leftTxt = daysLeft<=0 ? (mode==='week'?'final day':'last day') : `${daysLeft} day${daysLeft===1?'':'s'} left`;

  // pct for weight-goal row
  const mePct = me.pct==null?null:Math.round(me.pct);
  const themPct = them.pct==null?null:Math.round(them.pct);

  // hero
  const hero=`<div class="rv-hero">
    <div class="rv-hero-row">
      <div class="rv-hero-p">
        ${rvAvatar(rvInitial(meName),RV_YOU,RV_YOU_BG,'#fff')}
        <div class="rv-hero-name">You</div>
        <div class="rv-hero-pts">${A.points.toLocaleString()}</div>
        <div class="rv-hero-lbl">points</div>
      </div>
      <div class="rv-hero-vs">VS</div>
      <div class="rv-hero-p" style="opacity:.94">
        ${rvAvatar(rvInitial(themName),RV_THEM,RV_THEM_BG,'rgba(255,255,255,.5)')}
        <div class="rv-hero-name">${esc(themName)}</div>
        <div class="rv-hero-pts" style="color:rgba(255,255,255,.9)">${B.points.toLocaleString()}</div>
        <div class="rv-hero-lbl">points</div>
      </div>
    </div>
    <div class="rv-hero-split"><div style="width:${meShare}%"></div></div>
    <div class="rv-hero-foot">${leadTxt} — ${leftTxt}</div>
  </div>`;

  // breakdown (adherence points only)
  const breakdown=`<div class="rv-card">
    <div class="rv-card-h">Where the points came from</div>
    ${rvBreakRow('Logging streak',A.logging,B.logging,'',A.logging>=B.logging)}
    ${rvBreakRow('Days under calorie goal',Math.round(A.calorie),Math.round(B.calorie),'',A.calorie>=B.calorie)}
  </div>`;

  // progress to goal weight — its own widget (closeness to goal; not scored)
  const goalCard=rvGoalCard(mePct,themPct,themName);

  // day-by-day (week) or week-by-week (month)
  let chart='';
  if(mode==='week'){
    const wk=compWeekDaysFor(0), tk=todayKey(), startD=compStartDate();
    const labels=['M','T','W','T','F','S','S'];
    let mx=1; wk.forEach(dk=>{ if(startD&&dk<startD)return; const em=me.byDate[dk],et=them.byDate[dk];mx=Math.max(mx,em?em.points:0,et?et.points:0);});
    const bars=wk.map((dk,i)=>{
      const future=dk>tk;
      const preStart=startD && dk<startD;
      const inactive=future||preStart;
      const em=preStart?null:me.byDate[dk], et=preStart?null:them.byDate[dk];
      const mh=em?Math.max(6,em.points/mx*70):(inactive?10:6);
      const th=et?Math.max(6,et.points/mx*70):(inactive?10:6);
      const op=inactive?'opacity:.4':'';
      const mc=inactive?'#DED6C8':(em?RV_YOU:RV_YOU_LT);
      const tc=inactive?'#DED6C8':(et?RV_THEM:RV_THEM_LT);
      const tap=!inactive;
      return `<div class="rv-daycol${tap?' tap':''}" style="${op}"${tap?` data-rvday="${dk}"`:''}>
        <div class="rv-daybars"><div style="height:${mh}px;background:${mc}"></div><div style="height:${th}px;background:${tc}"></div></div>
        <span>${labels[i]}</span></div>`;
    }).join('');
    chart=`<div class="rv-card">
      <div class="rv-card-h rv-legend"><span>Day by day</span>
        <span class="rv-leg"><i style="background:${RV_YOU}"></i>You <i style="background:${RV_THEM}"></i>${esc(themName)}</span></div>
      <div class="rv-daywrap">${bars}</div>
      <div class="rv-daytip">Tap a day to see ${esc(themName)}'s food</div>
    </div>`;
  } else {
    // week by week (4 weeks, oldest→newest) + weeks-won tally
    const rows=[]; let mx=1; let meWon=0, themWon=0; const tk=todayKey();
    for(let off=3; off>=0; off--){
      const wdays=compCountDates(compWeekDaysFor(off));
      const a=rvAgg(me,wdays).points, b=rvAgg(them,wdays).points;
      const hasData=(a+b)>0;
      if(hasData){ if(a>=b)meWon++; else themWon++; }
      mx=Math.max(mx,a,b);
      rows.push({label:'W'+(4-off),a,b,current:off===0,hasData});
    }
    const bars=rows.map(r=>{
      const mh=Math.max(6,r.a/mx*70), th=Math.max(6,r.b/mx*70);
      return `<div class="rv-daycol">
        <div class="rv-daybars"><div style="height:${mh}px;background:${r.a>=r.b?RV_YOU:RV_YOU_LT}"></div><div style="height:${th}px;background:${r.b>r.a?RV_THEM:RV_THEM_LT}"></div></div>
        <span>${r.label}</span></div>`;
    }).join('');
    const wins=rows.map(r=>{
      const bg = !r.hasData ? '#EFE9DF' : (r.a>=r.b?RV_YOU:RV_THEM);
      return `<div class="rv-wincell" style="background:${bg};${r.current?'':''}"><span>${r.label}</span></div>`;
    }).join('');
    chart=`<div class="rv-card">
        <div class="rv-card-h rv-legend"><span>Week by week</span>
          <span class="rv-leg"><i style="background:${RV_YOU}"></i>You <i style="background:${RV_THEM}"></i>${esc(themName)}</span></div>
        <div class="rv-daywrap">${bars}</div>
      </div>
      <div class="rv-card">
        <div class="rv-card-h rv-legend"><span>Weeks won</span>
          <span class="rv-brow-v">You lead <b style="color:${RV_YOU}">${meWon}</b>–${themWon}</span></div>
        <div class="rv-winrow">${wins}</div>
      </div>`;
  }

  const toggle=`<div class="rv-toggle">
    <button data-m="week" class="${mode==='week'?'on':''}">This week</button>
    <button data-m="month" class="${mode==='month'?'on':''}">This month</button>
  </div>`;

  $('main').innerHTML =
    rvHeader('Rivals', `You & ${themName}`, true) +
    toggle + hero + breakdown + goalCard + chart;

  document.querySelectorAll('.rv-toggle button').forEach(bt=>bt.onclick=()=>{ rivalsMode=bt.dataset.m; rvRenderBoard(); });
  document.querySelectorAll('#main [data-rvday]').forEach(c=>c.onclick=()=>rvOpenDiary(them.id,themName,c.dataset.rvday));
}

/* ---- toast ---- */
export function toastComp(msg){
  const t=el(`<div style="position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:200;
    background:var(--text);color:#fff;padding:11px 18px;border-radius:999px;font-size:14px;
    font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.2);max-width:80%;text-align:center">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(()=>{t.style.transition='opacity .3s';t.style.opacity='0';setTimeout(()=>t.remove(),300);},1900);
}

/* shortcut used by the Settings card */
export function openLeaderboard(){ setTab('rivals'); _rivalsStale=true; closeAllModals(); }


