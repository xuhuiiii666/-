import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTrainingModules} from './helpers.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
function workout(id,index,title=`训练 ${index+1}`){return {workoutId:id,source:'legacy-import',sourceWorkoutKey:`legacy:${index+1}:${title.replace(/\s/g,'').toLowerCase()}`,title,'训练主题':title,exercises:[]};}
function entry(weight=60){return {type:'主训练',name:'前蹲',trackingName:'前蹲',set:1,weight:String(weight),unit:'kg',weightKg:weight,reps:'5',rir:'2'};}
function log(overrides={}){return {workoutId:'old-id',planIndex:0,title:'训练 1',actualDate:'2026-08-29',entries:[entry()],...overrides};}
function program(overrides={}){const days=[workout('current-1',0),workout('current-2',1)];return {programId:'p',source:'legacy-import',days,currentIndex:1,currentWorkoutId:days[1].workoutId,actualDates:{},dateAnchors:{},completed:{},sessionStartedAt:{},currentWorkoutDrafts:{},currentWorkoutLogDraft:null,workoutLogs:[],settings:{},currentSessionNote:'',noteArchive:[],...overrides};}

test('R1. orphan 与唯一 sourceWorkoutKey 可以 SAFE_REBIND',()=>{
  const app=loadTrainingModules(),p=program();p.actualDates={'old-id':'2026-08-29'};p.workoutLogs=[log({sourceWorkoutKey:p.days[0].sourceWorkoutKey})];
  const result=app.reconcileProgramExecutionState(p,p.workoutLogs);
  assert.equal(result.safeRebind.length,1);assert.equal(result.safeRebind[0].toWorkoutId,'current-1');assert.equal(result.proposedState.actualDates['current-1'],'2026-08-29');assert.equal(result.proposedState.actualDates['old-id'],undefined);
});

test('R2. planIndex 与 normalized title 同时唯一一致才能 SAFE_REBIND',()=>{
  const app=loadTrainingModules(),p=program();p.actualDates={'current-1':'2026-06-06'};p.workoutLogs=[log({workoutId:'another-old-id',actualDate:'2026-08-29'})];
  const result=app.reconcileProgramExecutionState(p,p.workoutLogs);
  assert.equal(result.safeRebind.filter(item=>item.hadActualDate).length,1);assert.equal(result.proposedState.actualDates['current-1'],'2026-08-29');
});

test('R3. 只有 index 相同但 title 冲突时不自动绑定',()=>{
  const app=loadTrainingModules(),p=program(),history=log({title:'完全不同的旧训练'}),match=app.matchLogToWorkout(p,history);
  assert.equal(match.status,'unmapped');p.actualDates={'current-1':'2026-06-06'};p.workoutLogs=[{...history,workoutId:'current-1'}];const result=app.reconcileProgramExecutionState(p,p.workoutLogs);
  assert.equal(result.safeRebind.length,0);assert.equal(result.ambiguous.filter(item=>item.hadActualDate).length,1);assert.equal(result.proposedState.actualDates['current-1'],'2026-06-06');
});

test('R4. 只有 title 相同但 planIndex 不一致时不自动绑定',()=>{
  const app=loadTrainingModules(),p=program(),match=app.matchLogToWorkout(p,log({planIndex:1,title:'训练 1'}));
  assert.equal(match.status,'unmapped');
});

test('R5. 无日志、未开始、无真实输入的 stale actualDate 可以 SAFE_REMOVE',()=>{
  const app=loadTrainingModules(),p=program();p.actualDates={'current-2':'2026-06-06'};p.currentWorkoutDrafts['current-2']={updatedAt:'2026-08-29T10:00:00Z',note:'',mains:[{sets:[{reps:'5',rir:'2',targetRepsMin:5,targetRepsMax:5,targetRirMin:2,targetRirMax:2,weight:'',weightKg:0,completed:false}]}],warmups:[]};
  const result=app.reconcileProgramExecutionState(p,[]);assert.equal(result.safeRemove.length,1);assert.equal(result.proposedState.actualDates['current-2'],undefined);
});

test('R6. orphan 日期对账永远不删除含重量历史日志',()=>{
  const app=loadTrainingModules(),p=program();p.actualDates={'current-2':'2026-06-06'};p.workoutLogs=[log({title:'旧计划动作',planIndex:1,workoutId:'current-2'})];const before=JSON.stringify(p.workoutLogs),hash=app.hashWorkoutLogs(p.workoutLogs);
  const result=app.reconcileProgramExecutionState(p,p.workoutLogs);assert.equal(JSON.stringify(result.proposedState.workoutLogs),before);assert.equal(app.hashWorkoutLogs(result.proposedState.workoutLogs),hash);assert.equal(app.countWeightedWorkoutLogEntries(result.proposedState.workoutLogs),1);
});

test('R7. 多日期历史属于 AMBIGUOUS 且不自动修改',()=>{
  const app=loadTrainingModules(),p=program();p.actualDates={'current-1':'2026-08-20'};p.workoutLogs=[log({workoutId:'a',actualDate:'2026-08-20'}),log({workoutId:'b',actualDate:'2026-08-29'})];
  const result=app.reconcileProgramExecutionState(p,p.workoutLogs);assert.equal(result.ambiguous.filter(item=>item.workoutId==='current-1').length,1);assert.equal(result.proposedState.actualDates['current-1'],'2026-08-20');
});

test('R8. 计划默认 reps/RIR 不属于真实训练输入',()=>{
  const app=loadTrainingModules(),draft={note:'',mains:[{sets:[{weight:'',weightKg:0,reps:'5',rir:'2-3',targetRepsMin:5,targetRepsMax:5,targetRirMin:2,targetRirMax:3,completed:false}]}],warmups:[]};assert.equal(app.hasMeaningfulTrainingInput(draft),false);
});

test('R9. 输入 weight 属于真实训练输入',()=>{const app=loadTrainingModules();assert.equal(app.hasMeaningfulTrainingInput({mains:[{sets:[{weight:'60',weightKg:60}]}]}),true);});
test('R10. 完成 set 属于真实训练输入',()=>{const app=loadTrainingModules();assert.equal(app.hasMeaningfulTrainingInput({mains:[{sets:[{completed:true}]}]}),true);});

test('R11. 只进入页面不创建 actualDate',()=>{
  const app=loadTrainingModules();assert.equal(app.shouldCreateActualDateForAction('page-enter',{}),false);assert.equal(app.shouldCreateActualDateForAction('training-input',{field:'unit',value:'kg'}),false);
});

test('R12. 第一次真实输入创建 sessionStartedAt 和 actualDate',()=>{
  const app=loadTrainingModules(),p=program(),patch=app.createStartedExecutionState(p,'current-2','2026-08-30','2026-08-30T09:00:00.000Z');assert.equal(app.shouldCreateActualDateForAction('training-input',{field:'weight',value:'62.5'}),true);assert.equal(p.actualDates['current-2'],undefined);assert.equal(patch.actualDates['current-2'],'2026-08-30');assert.equal(patch.sessionStartedAt['current-2'].actualDate,'2026-08-30');
});

test('R13. repair 前后 workoutLogs hash 完全一致',()=>{
  const app=loadTrainingModules(),p=program();p.actualDates={'current-2':'2026-06-06'};p.workoutLogs=[log()];const before=app.hashWorkoutLogs(p.workoutLogs),result=app.repairProgramDateState(p,{scheduledDateResolver:()=> '2026-08-30'});assert.equal(result.diff.workoutLogsHashBefore,before);assert.equal(result.diff.workoutLogsHashAfter,before);
});

test('R14. repair 前后 weighted entries 完全一致',()=>{
  const app=loadTrainingModules(),p=program();p.actualDates={'current-2':'2026-06-06'};p.workoutLogs=[log(),log({workoutId:'b',actualDate:'2026-08-30',entries:[entry(65)]})];const result=app.repairProgramDateState(p,{scheduledDateResolver:()=> '2026-08-31'});assert.equal(result.diff.weightedEntriesBefore,2);assert.equal(result.diff.weightedEntriesAfter,2);
});

test('R15. SAFE_REMOVE 后 #2 scheduledDate 由日期引擎顺推',()=>{
  const app=loadTrainingModules(),p=program();p.actualDates={'current-1':'2026-08-29','current-2':'2026-06-06'};p.completed={'current-1':true};const result=app.repairProgramDateState(p,{scheduledDateResolver:(candidate,index)=>app.calculateScheduledWorkoutDate(candidate.days,index,candidate.actualDates,candidate.dateAnchors,'','2026-08-29')});assert.equal(result.program.actualDates['current-2'],undefined);assert.equal(result.program.currentWorkoutLogDraft,null);assert.equal(app.calculateScheduledWorkoutDate(result.program.days,1,result.program.actualDates,result.program.dateAnchors,'','2026-08-29'),'2026-08-30');
});

test('R16. lastActual 保持真正最后训练日期',()=>{
  const app=loadTrainingModules(),p=program();p.actualDates={'current-1':'2026-08-29','current-2':'2026-06-06'};p.completed={'current-1':true};const result=app.repairProgramDateState(p,{});assert.equal(result.program.lastActualIndex,0);assert.equal(result.program.lastActualDate,'2026-08-29');
});

test('R17. 无法映射的旧历史仍能查询动作重量',()=>{
  const app=loadTrainingModules(),p=program();p.workoutLogs=[log({title:'旧计划',planIndex:99,entries:[entry(72.5)]})];const result=app.reconcileProgramExecutionState(p,p.workoutLogs),history=app.buildExerciseHistoryFromLogs(result.proposedState.workoutLogs);assert.equal(result.stats.unmappedLogs,1);assert.equal(history['前蹲'][0].sets[0].weightKg,72.5);
});
