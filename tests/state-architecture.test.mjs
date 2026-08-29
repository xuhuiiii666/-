import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage,loadStorage,samplePlan,sampleWarmups } from './helpers.mjs';

function boot(storage){
  const context=loadStorage(storage);
  context.initializeTrainingTracker(samplePlan,sampleWarmups);
  return context;
}

test('1. 新建训练刷新后仍存在',()=>{
  const storage=new MemoryStorage();
  let app=boot(storage);
  const workout=app.createCustomWorkout('周末自选训练');
  const id=workout.workoutId;
  app=boot(storage);
  assert.ok(app.getActiveProgram().days.some(day=>day.workoutId===id&&day.source==='custom'));
  assert.deepEqual(storage.keys(),['training-tracker-state']);
});

test('2. 新建动作切换页面和重载后仍存在',()=>{
  const storage=new MemoryStorage();
  let app=boot(storage);
  const workout=app.createCustomWorkout('动作持久化');
  const exercise=app.addExerciseToWorkout(workout.workoutId,{source:'custom',name:'抬脚跟停顿前蹲',sets:[{rest:120}]});
  const other=app.createProgramFromPlan(samplePlan,{name:'另一个计划'});
  app.addProgram(other,true);
  app.activateProgram(app.trainingTrackerState.profiles.profile_default.programs[workout.workoutId]?.programId||Object.keys(app.getActiveProfile().programs).find(id=>app.getActiveProfile().programs[id].days.some(day=>day.workoutId===workout.workoutId)));
  app=boot(storage);
  const saved=Object.values(app.getActiveProfile().programs).flatMap(program=>program.days).find(day=>day.workoutId===workout.workoutId);
  assert.equal(saved.exercises[0].exerciseId,exercise.exerciseId);
});

test('3. 删除一组再添加，setId 保持唯一',()=>{
  const app=boot(new MemoryStorage());
  const exercise=app.normalizeExerciseEntity({name:'前蹲',sets:[{rest:90},{rest:90},{rest:90}]},0);
  exercise.sets.splice(1,1);
  exercise.sets.push(app.normalizeSetEntity({rest:120},exercise.sets.length));
  const ids=exercise.sets.map(set=>set.setId);
  assert.equal(new Set(ids).size,ids.length);
});

test('8. 两个 Program 同时保存且互不覆盖',()=>{
  const storage=new MemoryStorage();
  let app=boot(storage);
  const first=app.getActiveProgram();
  const second=app.addProgram(app.createProgramFromPlan([samplePlan[1]],{name:'计划B'}),true);
  assert.notEqual(first.programId,second.programId);
  app=boot(storage);
  const programs=Object.values(app.getActiveProfile().programs);
  assert.equal(programs.length,2);
  assert.equal(programs.find(p=>p.programId===first.programId).days.length,2);
  assert.equal(programs.find(p=>p.programId===second.programId).days.length,1);
});

test('9. 切换 Program 后 currentWorkout 和 logs 各自独立',()=>{
  const app=boot(new MemoryStorage());
  const first=app.getActiveProgram();
  first.currentIndex=1;first.currentWorkoutId=first.days[1].workoutId;first.logs.push({title:'A记录'});app.saveState();
  const second=app.addProgram(app.createProgramFromPlan(samplePlan,{name:'计划B'}),true);
  second.currentIndex=0;second.logs.push({title:'B记录'});app.saveState();
  app.activateProgram(first.programId);
  assert.equal(app.getActiveProgram().currentWorkoutId,first.days[1].workoutId);
  assert.equal(JSON.stringify(app.getActiveProgram().logs.map(log=>log.title)),JSON.stringify(['A记录']));
  app.activateProgram(second.programId);
  assert.equal(JSON.stringify(app.getActiveProgram().logs.map(log=>log.title)),JSON.stringify(['B记录']));
});

test('10. 旧 localStorage 迁移后日志、重量和序号状态不丢',()=>{
  const legacy={logs:[{actualDate:'2026-05-20',title:'腿日',entries:[{name:'前蹲',weight:'60',weightKg:60,reps:'5',rir:'3'}]}],currentIndex:1,actualDates:{0:'2026-05-20'},completed:{0:true},currentWorkoutDrafts:{0:{mains:[]}},customWarmups:{idx_0:'旧热身'},exerciseTemplates:[{id:'t1',name:'前蹲'}]};
  const storage=new MemoryStorage({xuhui_training_v2_dailygrid:JSON.stringify(legacy),xuhui_training_v2_dailygrid_importedPlan:JSON.stringify(samplePlan)});
  const app=boot(storage);
  assert.equal(app.getActiveProgram().workoutLogs[0].entries[0].weightKg,60);
  assert.equal(app.getActiveProfile().exerciseTemplates[0].name,'前蹲');
  const firstWorkoutId=app.getActiveProgram().days[0].workoutId;
  assert.equal(app.getActiveProgram().actualDates[firstWorkoutId],'2026-05-20');
  assert.equal(app.getActiveProgram().completed[firstWorkoutId],true);
  assert.ok(app.getActiveProgram().currentWorkoutDrafts[firstWorkoutId]);
  assert.equal(app.getActiveProgram().customWarmups['workout_'+firstWorkoutId],'旧热身');
  assert.deepEqual(storage.keys().sort(),['xuhui_training_v2_dailygrid','xuhui_training_v2_dailygrid_importedPlan'].sort());
  assert.equal(app.inspectTrainingStorage().legacy.xuhui_training_v2_dailygrid.exists,true);
});
