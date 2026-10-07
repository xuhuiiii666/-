import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTrainingModules} from './helpers.mjs';

const name='绳索侧平举';
const entry=(set,weight,extra={})=>({type:'主训练',name,trackingName:name,set,weight:String(weight),unit:'kg',reps:'12',rir:'2',setType:'working',...extra});
function root(logs,days=[]){return {activeProfileId:'p',activeProgramId:'new',profiles:{p:{programs:{old:{days,workoutLogs:logs},new:{days:[],workoutLogs:[]}}}}};}
const log=(entries,extra={})=>({actualDate:'2026-10-04',workoutId:'old-day',title:'训练日',entries,...extra});
const find=(data,n=name)=>loadTrainingModules().getLastOrdinaryWorkingSet(data,n);

test('WR1 last ordinary set, not highest weight or final drop segment',()=>{
  const data=root([log([entry(1,20),entry(2,17.5),entry(3,15),entry('4A',15,{segment:'A'}),entry('4C',5,{segment:'C',setType:'dropset'})])]);
  assert.equal(find(data).weight,'15');assert.equal(find(data).setNo,3);
});
test('WR2 warmup technique top backoff and drop are never working references',()=>{
  for(const setType of ['warmup','technique','top','backoff','dropset'])assert.equal(find(root([log([entry(1,60,{setType})])])),null);
});
test('WR3 latest eligible session across Programs, only active profile',()=>{
  const data=root([log([entry(1,20)],{actualDate:'2026-09-01'})]);
  data.profiles.p.programs.new.workoutLogs=[log([entry(1,25)],{actualDate:'2026-10-01'})];
  data.profiles.other={programs:{p:{workoutLogs:[log([entry(1,100)],{actualDate:'2026-11-01'})]}}};
  assert.equal(find(data).weight,'25');assert.equal(find(data).programId,'new');
});
test('WR4 only exact safe annotations are ignored, movement variants remain distinct',()=>{
  const m=loadTrainingModules(),key=m.normalizeHistoryExerciseName;
  assert.equal(key('  绳索侧平举【本块增量】  '),key(name));
  assert.equal(key('ＲＤＬ（技术）'),key('rdl(技术)'));
  assert.equal(key('绳索侧平举｛本块增量｝'),key(name));
  assert.notEqual(key('卧推（窄握）'),key('卧推'));
  assert.notEqual(key('卧推（停顿）'),key('卧推'));
  assert.notEqual(key('哑铃卧推'),key('杠铃卧推'));
  assert.notEqual(key('单侧绳索侧平举'),key(name));
  assert.equal(find(root([log([entry(1,15)])]),name+'【本块增量】').weight,'15');
});
test('WR5 a bracket annotation shares visible history without modifying source logs',()=>{
  const m=loadTrainingModules(),data=root([log([entry(1,15)]),log([entry(1,20,{name:name+'【本块增量】',trackingName:name+'【本块增量】'})])]);
  const before=JSON.stringify(data);assert.equal(m.findExerciseHistoryAcrossPrograms(data,name).length,2);assert.equal(JSON.stringify(data),before);
});
test('WR6 unknown legacy set types do not silently become working',()=>{
  assert.equal(find(root([log([entry(1,60,{setType:undefined})])])),null);
});
const oldDay=()=>({workoutId:'old-day',sourceWorkoutKey:'D1',title:'训练日',exercises:[{exerciseId:'E1',name,trackingName:name,line:'原始处方 3组',section:'辅助',sets:[{setId:'S1',setNo:1,setType:'working'},{setId:'S2',setNo:2,setType:'backoff'}]}]});
const legacyEntry=(set,weight)=>entry(set,weight,{setType:undefined,target:'原始处方 3组'});
test('WR7 legacy source prescription resolves working but excludes backoff',()=>{
  const result=find(root([log([legacyEntry(1,60),legacyEntry(2,50)],{sourceWorkoutKey:'D1'})],[oldDay()]));
  assert.equal(result.weight,'60');
});
test('WR8 reused workout ID or changed source line cannot infer old set types',()=>{
  for(const change of [d=>d.title='另一个训练',d=>d.sourceWorkoutKey='D2',d=>d.exercises[0].line='动作模板']){
    const d=oldDay();change(d);assert.equal(find(root([log([legacyEntry(1,60)],{sourceWorkoutKey:'D1'})],[d])),null);
  }
});
test('WR9 skill retention and non-working exercises are excluded',()=>{
  assert.equal(find(root([log([entry(1,60,{trainingRole:'skill-retention'})])])),null);
  assert.equal(find(root([log([entry(1,60,{countsAsWorkingSet:false})])])),null);
});
test('WR10 units and fractional weights retain source precision',()=>{
  const result=find(root([log([entry(1,62.25,{unit:'lb'})])]));assert.equal(result.weight,'62.25');assert.equal(result.unit,'lb');
  assert.equal(result.weightKg,62.25*0.45359237);
});
test('WR11 missing/invalid weights and preview/draft logs are ignored',()=>{
  for(const weight of ['',0,-1,'not-a-number'])assert.equal(find(root([log([entry(1,weight)])])),null);
  for(const status of ['草稿','预览','draft'])assert.equal(find(root([log([entry(1,60)],{status})])),null);
});
test('WR12 read-only lookup retains ROOT, IDs and historical data exactly',()=>{
  const data=root([log([legacyEntry(1,60)])],[oldDay()]),before=JSON.stringify(data);
  assert.equal(find(data).weight,'60');assert.equal(JSON.stringify(data),before);
});
test('WR13 both superset members use their own history',()=>{
  const data=root([log([entry(1,12.5),entry(2,15),entry(1,20,{name:'绳索下压',trackingName:'绳索下压'}),entry(2,22.5,{name:'绳索下压',trackingName:'绳索下压'})])]);
  assert.equal(find(data).weight,'15');assert.equal(find(data,'绳索下压').weight,'22.5');
});
test('WR14 ambiguous assisted load and generic legacy template cannot prefill',()=>{
  const assisted='引体向上（必要时辅助）';
  assert.equal(find(root([log([entry(1,37,{name:assisted,trackingName:assisted})])]),assisted),null);
  const day=oldDay();day.exercises[0].line='动作模板';
  assert.equal(find(root([log([legacyEntry(1,60)].map(e=>({...e,target:'动作模板'})))],[day])),null);
});
