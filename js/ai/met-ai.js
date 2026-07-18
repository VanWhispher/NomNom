import {geminiJSON} from './recipe.js';
import {MET} from '../data/met-table.js';

/* ---------- AI: MET lookup for a free-typed "Other" sport ---------- */
export async function aiSportMET(sport){
  const prompt=`Give the metabolic equivalent (MET) values for the physical activity "${sport}" at three effort levels, using standard Compendium of Physical Activities figures. Reference points: slow walking ~2.8, brisk walking ~4.3, jogging ~7, running ~9.8, cycling ~6-10, vigorous swimming ~9.5. Respond with ONLY JSON, no markdown: {"activity":"","light":0,"moderate":0,"vigorous":0}. If it is not a real physical activity, set all three values to 0.`;
  const out=await geminiJSON([{text:prompt}],512);
  const cl=v=>{ const n=+v; return isFinite(n)&&n>0?Math.round(n*10)/10:0; };
  const met={light:cl(out.light),moderate:cl(out.moderate),vigorous:cl(out.vigorous)};
  if(!met.light && !met.moderate && !met.vigorous) throw new Error('That doesn’t look like an exercise — try another word.');
  const base=met.moderate||met.vigorous||met.light;   // fill any gaps sensibly
  if(!met.light)    met.light=Math.max(1,Math.round(base*0.7*10)/10);
  if(!met.moderate) met.moderate=base;
  if(!met.vigorous) met.vigorous=Math.round(base*1.3*10)/10;
  return met;
}
