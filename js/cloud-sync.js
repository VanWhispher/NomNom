import {esc} from './helpers.js';
import {CLOUD, DEFAULT, KEY, LOGO_SVG, SUPABASE_ANON_KEY, SUPABASE_URL, applyTheme, saveLocal, sb, setCloud, setSb, setState, setUser, state, tab, user} from './state.js';
import {layout, render} from './ui/router.js';
import {compPushMine} from './views/rivals.js';

/* ---------- cloud sync (Supabase) ---------- */
export function initCloud(){
  if(SUPABASE_URL && /^https?:\/\//.test(SUPABASE_URL) && window.supabase){
    try{ setSb(window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY)); setCloud(true); }catch(e){ setCloud(false); }
  }
}
export let _pushT=null;
export function scheduleCloudPush(){ if(!CLOUD||!user)return; clearTimeout(_pushT); _pushT=setTimeout(pushCloud,800); }
export async function pushCloud(){ if(!CLOUD||!user)return; try{ await sb.from('profiles').upsert({id:user.id,data:state,updated_at:new Date().toISOString()}); }catch(e){} }
export let _rvPushT=null;
// keep a rival's scoreboard + diary fresh as you log, instead of only when you open the Rivals tab
export function scheduleRivalsPush(){ if(!CLOUD||!user||!state.competition)return; clearTimeout(_rvPushT); _rvPushT=setTimeout(()=>{ compPushMine().catch(()=>{}); },1000); }
export function hasData(){ return (state.entries&&state.entries.length)||(state.weights&&state.weights.length)||(state.exercise&&state.exercise.length)||(state.library&&state.library.length); }
export async function loadCloudIntoState(){
  let row=null;
  try{ const r=await sb.from('profiles').select('data').eq('id',user.id).maybeSingle(); row=r.data; }catch(e){}
  if(row&&row.data){ setState(Object.assign(structuredClone(DEFAULT),row.data)); saveLocal(); }   // cloud wins
  else if(hasData()){ await pushCloud(); }                                                       // migrate this device's data up
}
export async function onAuth(){
  if(user){ try{ await loadCloudIntoState(); }catch(e){} showApp(); }
  else showLogin();
}
export async function signOut(){ try{ await sb.auth.signOut(); }catch(e){} setUser(null); try{localStorage.removeItem(KEY);}catch(e){} setState(structuredClone(DEFAULT)); showLogin(); }
export function showApp(){
  const a=document.getElementById('auth-screen'); if(a)a.style.display='none';
  document.getElementById('app').style.display='';
  document.querySelector('.tabbar').style.display='';
  render(); layout();
}
export function showLogin(){
  document.getElementById('app').style.display='none';
  document.querySelector('.tabbar').style.display='none';
  const fab=document.getElementById('fab'); if(fab)fab.style.display='none';
  applyTheme(state.settings.theme);
  const s=document.getElementById('auth-screen'); s.style.display='flex';
  s.innerHTML=`<div class="auth-wrap">
    <div class="auth-cat">${LOGO_SVG}</div>
    <div class="auth-logo">NomNom</div>
    <div class="auth-tag">Sign in to sync your food log across your devices.</div>
    <div id="auth-msg"></div>
    <div class="field"><label>Email</label><input id="auth-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com"></div>
    <button class="btn btn-primary btn-block" id="auth-magic" style="margin-top:14px">Email me a sign-in link</button>
    <div class="auth-or">or</div>
    <button class="btn btn-block" id="auth-google">Continue with Google</button>
  </div>`;
  const msg=s.querySelector('#auth-msg');
  const redirect=location.href.split('#')[0].split('?')[0];
  s.querySelector('#auth-magic').onclick=async()=>{
    const email=s.querySelector('#auth-email').value.trim();
    if(!email){msg.innerHTML='<div class="err">Enter your email.</div>';return;}
    msg.innerHTML='<div class="hint">Sending…</div>';
    try{ const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:redirect}}); if(error)throw error;
      msg.innerHTML='<div class="note">Check your email for a sign-in link, then return here.</div>';
    }catch(e){ msg.innerHTML='<div class="err">'+esc(e.message||'Could not send the link.')+'</div>'; }
  };
  s.querySelector('#auth-google').onclick=async()=>{
    msg.innerHTML='<div class="hint">Redirecting to Google…</div>';
    try{ const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect}}); if(error)throw error; }
    catch(e){ msg.innerHTML='<div class="err">'+esc(e.message||'Google sign-in failed.')+'</div>'; }
  };
}
export async function boot(){
  initCloud();
  if(!CLOUD){ render(); layout(); return; }
  document.getElementById('app').style.display='none';
  document.querySelector('.tabbar').style.display='none';
  const fab=document.getElementById('fab'); if(fab)fab.style.display='none';
  const s=document.getElementById('auth-screen'); s.style.display='flex';
  s.innerHTML='<div class="auth-wrap"><div class="auth-logo">NomNom</div><div class="auth-tag">Loading…</div></div>';
  try{
    const {data}=await sb.auth.getSession();
    setUser((data&&data.session&&data.session.user)||null);
    sb.auth.onAuthStateChange((_e,sess)=>{ const u=(sess&&sess.user)||null; const changed=((u&&u.id)||null)!==((user&&user.id)||null); setUser(u); if(changed) onAuth(); });
    await onAuth();
  }catch(e){ setCloud(false); document.getElementById('app').style.display=''; document.querySelector('.tabbar').style.display=''; render(); layout(); }
}

