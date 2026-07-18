import {MET, QUICK} from '../data/met-table.js';
import {latestWeightKg, r0, r1, uid} from '../helpers.js';
import {save, state, viewDate} from '../state.js';
import {closeModal, openModal} from '../ui/nav.js';

/* ---------- EXERCISE ---------- */
export function openExercise(){
  const wkg=latestWeightKg();
  const acts=[...QUICK,...Object.keys(MET).filter(a=>!QUICK.includes(a))];
  let activity='Walking',intensity='moderate';
  const m=openModal('Add exercise',`
    <div class="field"><label>Activity</label>
      <div class="chips" id="ex-acts">${acts.map(a=>`<button class="chip${a==='Walking'?' sel':''}" data-act="${a}">${a}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Intensity</label>
      <div class="chips" id="ex-int">
        <button class="chip" data-int="light">Light</button>
        <button class="chip sel" data-int="moderate">Moderate</button>
        <button class="chip" data-int="vigorous">Vigorous</button>
      </div></div>
    <div class="field-row">
      <div class="field"><label>Minutes</label><input type="number" inputmode="numeric" id="ex-min" value="30"></div>
      <div class="field"><label>Your weight (kg)</label><input type="number" inputmode="decimal" id="ex-wt" value="${wkg?r1(wkg):''}" placeholder="log weight first"></div>
    </div>
    <div class="field"><label>Calories burned (editable)</label><input type="number" inputmode="numeric" id="ex-cal"></div>
    <div class="hint" id="ex-met"></div>
    <div class="field"><button class="btn btn-primary btn-block" id="ex-save">Log exercise</button></div>
  `);
  function recompute(){
    const met=MET[activity][intensity];
    const wt=+m.querySelector('#ex-wt').value||0;
    const min=+m.querySelector('#ex-min').value||0;
    const cal=met*wt*(min/60);
    m.querySelector('#ex-cal').value=r0(cal);
    m.querySelector('#ex-met').textContent=`${activity}, ${intensity}: ${met} MET${activity==='Badminton'&&intensity==='moderate'?' (social play)':''}`;
  }
  m.querySelectorAll('#ex-acts .chip').forEach(c=>c.onclick=()=>{activity=c.dataset.act;m.querySelectorAll('#ex-acts .chip').forEach(x=>x.classList.toggle('sel',x===c));recompute();});
  m.querySelectorAll('#ex-int .chip').forEach(c=>c.onclick=()=>{intensity=c.dataset.int;m.querySelectorAll('#ex-int .chip').forEach(x=>x.classList.toggle('sel',x===c));recompute();});
  m.querySelector('#ex-min').oninput=recompute;
  m.querySelector('#ex-wt').oninput=recompute;
  recompute();
  m.querySelector('#ex-save').onclick=()=>{
    const min=+m.querySelector('#ex-min').value||0;
    const cal=+m.querySelector('#ex-cal').value||0;
    state.exercise.push({id:uid(),date:viewDate,activity,intensity,minutes:min,met:MET[activity][intensity],caloriesBurned:cal});
    save();closeModal(m);
  };
}

