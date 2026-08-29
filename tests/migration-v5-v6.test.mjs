import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage,loadStorage,loadTrainingModules,samplePlan,sampleWarmups } from './helpers.mjs';

function v5State(){
  const workout21={workoutId:'workout_21',source:'imported',title:'第21练','训练主题':'第21练',exercises:[]};
  const workout22={workoutId:'workout_22',source:'imported',title:'第22练','训练主题':'第22练',exercises:[{exerciseId:'exercise_squat',source:'plan',name:'前蹲',trackingName:'前蹲',originalName:'前蹲',sets:[{setId:'set_1',setNo:1,weight:'',unit:'kg',weightKg:0,reps:'5',rir:'3',rest:150},{setId:'set_2',setNo:2,weight:'',unit:'kg',weightKg:0,reps:'5',rir:'3',rest:150}]}]};
  const customWorkout={workoutId:'workout_custom',source:'custom',title:'用户胸背训练','训练主题':'用户胸背训练',exercises:[{exerciseId:'exercise_custom',source:'custom',name:'用户自建划船',trackingName:'用户自建划船',originalName:'用户自建划船',sets:[{setId:'set_custom',setNo:1,weight:'45',unit:'kg',weightKg:45,reps:'8',rir:'2',rest:90}]}]};
  const logs=[{actualDate:'2026-08-20',date:'2026-08-20',planIndex:20,title:'第21练',status:'已完成',completedAt:'2026-08-20T12:00:00.000Z',note:'状态稳定',entries:[
    {type:'主训练',name:'前蹲',trackingName:'前蹲',set:1,weight:'70',unit:'kg',weightKg:70,reps:'5',rir:'3',rest:'150'},
    {type:'主训练',name:'前蹲',trackingName:'前蹲',set:2,weight:'72.5',unit:'kg',weightKg:72.5,reps:'5',rir:'2',rest:'150'}
  ]}];
  const programA={programId:'program_a',name:'徐晖12周计划',source:'excel',days:[workout21,workout22,customWorkout],currentIndex:1,currentWorkoutId:'workout_22',selectedCalendarIndex:1,actualDates:{workout_21:'2026-08-20'},dateAnchors:{workout_21:'2026-08-20'},completed:{workout_21:true},currentWorkoutDrafts:{workout_22:{workoutId:'workout_22',planIndex:1,note:'训练做到一半',mains:[{exerciseId:'exercise_squat',name:'前蹲',sets:[{setId:'set_1',setNo:1,weight:'70',unit:'kg',weightKg:70,reps:'5',rir:'3',rest:150,completed:true},{setId:'set_2',setNo:2,weight:'72.5',unit:'kg',weightKg:72.5,reps:'5',rir:'2',rest:150,completed:true},{setId:'set_extra',setNo:3,weight:'',unit:'kg',weightKg:0,reps:'5',rir:'',rest:180,completed:false}]}],warmups:[]}},workoutLogs:logs,exerciseHistory:{'前蹲':[{date:'2026-08-20',sets:[{weight:'70',weightKg:70,reps:'5',rir:'3'}]}]},currentSessionNote:'今天膝盖感觉正常',settings:{mainRest:210,assistRest:100},startDate:'2026-08-01'};
  const programB={programId:'program_b',name:'自定义计划B',source:'custom',days:[{workoutId:'workout_b1',source:'custom',title:'B计划训练','训练主题':'B计划训练',exercises:[]}],currentIndex:0,currentWorkoutId:'workout_b1',actualDates:{},dateAnchors:{},completed:{},currentWorkoutDrafts:{},workoutLogs:[{actualDate:'2026-08-22',title:'B记录',entries:[{type:'主训练',name:'卧推',weight:'80',unit:'kg',weightKg:80,reps:'5',rir:'2'}]}],settings:{mainRest:180,assistRest:90}};
  return {schemaVersion:5,activeProfileId:'profile_user',activeProgramId:'program_a',profiles:{profile_user:{profileId:'profile_user',name:'用户档案',programs:{program_a:programA,program_b:programB},exerciseTemplates:[{id:'tpl_1',name:'前蹲',category:'腿'},{id:'tpl_2',name:'卧推',category:'胸'}],warmupTemplates:[{id:'warm_tpl_1',name:'腿部热身'}],warmupActionTemplates:[{id:'warm_action_1',name:'踝背屈'}],rmRecords:[{name:'前蹲',oneRm:100,date:'2026-08-20'}]}},ui:{lastTab:'today'}};
}
function migrate(source=v5State()){
  const storage=new MemoryStorage({'training-tracker-state':JSON.stringify(source)});
  const app=loadStorage(storage);app.initializeTrainingTracker(samplePlan,sampleWarmups);return {app,storage,source};
}

test('M1. v5 当前 Program 升级后 activeProgramId 不变',()=>{
  const {app}=migrate();assert.equal(app.trainingTrackerState.activeProgramId,'program_a');
});

test('M2. v5 当前训练 #22 升级后仍为同一 workoutId',()=>{
  const {app}=migrate();assert.equal(app.getActiveProgram().currentWorkoutId,'workout_22');assert.equal(app.getActiveProgram().currentIndex,1);
});

test('M3. 半途训练草稿的重量、组 ID 与完成状态完全保留',()=>{
  const {app}=migrate();const sets=app.getActiveProgram().currentWorkoutDrafts.workout_22.mains[0].sets;
  assert.equal(JSON.stringify(sets),JSON.stringify(v5State().profiles.profile_user.programs.program_a.currentWorkoutDrafts.workout_22.mains[0].sets));
});

test('M4. workoutLogs 数量及每个历史 entry 数值逐字不变',()=>{
  const {app}=migrate();const before=v5State().profiles.profile_user.programs.program_a.workoutLogs;
  assert.equal(JSON.stringify(app.getActiveProgram().workoutLogs),JSON.stringify(before));
});

test('M5. v5 exerciseHistory 与上次同名参考仍正确',()=>{
  const {app}=migrate();assert.equal(app.getActiveProgram().exerciseHistory['前蹲'][0].sets[0].weightKg,70);
  const modules=loadTrainingModules(new MemoryStorage({'training-tracker-state':JSON.stringify(v5State())}));modules.initializeTrainingTracker(samplePlan,sampleWarmups);
  assert.equal(modules.getLastExercisePerformance('前蹲').sets[1].weightKg,72.5);
});

test('M6. 用户自建 Workout 升级后仍存在',()=>{
  const {app}=migrate();assert.ok(app.getActiveProgram().days.some(day=>day.workoutId==='workout_custom'&&day.source==='custom'));
});

test('M7. 用户自建 Exercise 及重量升级后仍存在',()=>{
  const {app}=migrate();const exercise=app.getActiveProgram().days.find(day=>day.workoutId==='workout_custom').exercises[0];assert.equal(exercise.exerciseId,'exercise_custom');assert.equal(exercise.sets[0].weightKg,45);
});

test('M8. 用户动作模板数量不能减少',()=>{
  const {app}=migrate();assert.equal(app.getActiveProfile().exerciseTemplates.length,2);
});

test('M9. 热身模板和热身动作模板数量不能减少',()=>{
  const {app}=migrate();assert.equal(app.getActiveProfile().warmupTemplates.length,1);assert.equal(app.getActiveProfile().warmupActionTemplates.length,1);
});

test('M10. 多个 Program 升级后状态与日志相互隔离',()=>{
  const {app}=migrate();const profile=app.getActiveProfile();assert.equal(Object.keys(profile.programs).length,2);assert.equal(profile.programs.program_a.workoutLogs[0].entries[0].weightKg,70);assert.equal(profile.programs.program_b.workoutLogs[0].entries[0].weightKg,80);
});

test('M11. 迁移失败时正式根状态不被覆盖',()=>{
  const source=v5State(),raw=JSON.stringify(source),storage=new MemoryStorage({'training-tracker-state':raw}),app=loadStorage(storage);
  app.normalizeExerciseWithPrescription=()=>{throw new Error('模拟迁移失败');};
  assert.throws(()=>app.initializeTrainingTracker(samplePlan,sampleWarmups),/模拟迁移失败/);
  assert.equal(storage.getItem('training-tracker-state'),raw);
  assert.equal(storage.getItem('training-tracker-state-pre-v6-backup'),null);
});

test('M12. pre-v6 安全快照可以恢复且不会被删除',()=>{
  const {app,storage}=migrate();app.getActiveProgram().currentWorkoutId='workout_custom';app.saveState();
  const restored=app.restorePreV6Backup();assert.equal(restored.activeProgramId,'program_a');assert.equal(app.getActiveProgram().currentWorkoutId,'workout_22');assert.ok(storage.getItem('training-tracker-state-pre-v6-backup'));
});

test('M13. 已有用户打开新版不会触发 DEFAULT_PLAN',()=>{
  const {app}=migrate();assert.equal(Object.keys(app.getActiveProfile().programs).length,2);assert.equal(Object.values(app.getActiveProfile().programs).some(program=>program.source==='builtin'),false);
});

test('M14. localStorage 完全为空时才初始化示例计划',()=>{
  const storage=new MemoryStorage(),app=loadStorage(storage);app.initializeTrainingTracker(samplePlan,sampleWarmups);assert.equal(Object.keys(app.getActiveProfile().programs).length,1);assert.equal(app.getActiveProgram().source,'builtin');assert.equal(app.getActiveProgram().days.length,samplePlan.length);assert.equal(storage.getItem('training-tracker-state-pre-v6-backup'),null);
});

test('M15. Structured Import v1 存在但网页升级不会自动导入计划',()=>{
  const storage=new MemoryStorage({'training-tracker-state':JSON.stringify(v5State())}),app=loadTrainingModules(storage);app.initializeTrainingTracker(samplePlan,sampleWarmups);assert.equal(typeof app.detectStructuredFormat,'function');assert.equal(Object.keys(app.getActiveProfile().programs).length,2);assert.equal(app.trainingTrackerState.activeProgramId,'program_a');
});

test('M16. 迁移完整性 before/after 所有关键统计一致',()=>{
  const {app}=migrate();const integrity=app.trainingTrackerState.migrationIntegrity;
  assert.equal(JSON.stringify(integrity.before),JSON.stringify(integrity.after));
  assert.equal(integrity.after.programs,2);assert.equal(integrity.after.workouts,4);assert.equal(integrity.after.workoutLogs,2);assert.equal(integrity.after.historyEntries,3);assert.equal(integrity.after.weightedEntries,3);assert.equal(integrity.after.exerciseTemplates,2);assert.equal(integrity.after.warmupTemplates,2);assert.equal(integrity.after.currentDraftSets,3);
});
