import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage,loadStorage,loadTrainingModules,samplePlan,sampleWarmups } from './helpers.mjs';

class TrackingStorage extends MemoryStorage{
  constructor(seed={}){super(seed);this.writes=0;}
  setItem(key,value){this.writes++;super.setItem(key,value);}
}
class QuotaStorage extends MemoryStorage{
  constructor(seed,limit){super(seed);this.limit=limit;}
  setItem(key,value){
    if(String(key)==='training-tracker-state'&&String(value).length>this.limit){const error=new Error('The quota has been exceeded.');error.name='QuotaExceededError';throw error;}
    super.setItem(key,value);
  }
}

function workout(id,title='训练'){
  return {workoutId:id,source:'custom',title,'训练主题':title,exercises:[{exerciseId:id+'-E1',source:'custom',name:'动作 '+id,trackingName:'动作 '+id,originalName:'动作 '+id,sets:[{setId:id+'-S1',setNo:1,weight:'60',unit:'kg',weightKg:60,reps:'5',rir:'2',rest:90}]}]};
}
function rootFixture(dayCount=3,logCount=4){
  const days=Array.from({length:dayCount},(_,i)=>workout('W'+String(i+1).padStart(3,'0'),'训练 '+(i+1)));
  const logs=Array.from({length:logCount},(_,i)=>({actualDate:'2026-01-'+String((i%28)+1).padStart(2,'0'),workoutId:days[i%days.length].workoutId,planIndex:i%days.length,title:days[i%days.length].title,entries:[{type:'主训练',name:'深蹲',trackingName:'深蹲',set:1,weight:String(60+i),unit:'kg',weightKg:60+i,reps:'5',rir:'2'}]}));
  const history={'深蹲':logs.map(log=>({date:log.actualDate,sets:log.entries.map(entry=>({...entry}))}))};
  const program={programId:'program_a',name:'大数据计划',source:'custom',days,currentIndex:1,currentWorkoutId:days[1]?.workoutId||days[0].workoutId,currentWorkoutDrafts:{[days[0].workoutId]:{workoutId:days[0].workoutId,mains:[{exerciseId:days[0].exercises[0].exerciseId,sets:days[0].exercises[0].sets.map(set=>({...set}))}],warmups:[]}},actualDates:{[days[0].workoutId]:'2026-01-01'},dateAnchors:{[days[0].workoutId]:'2026-01-01'},completed:{[days[0].workoutId]:true},workoutLogs:logs,exerciseHistory:history,currentSessionNote:'保留备注',noteArchive:[{date:'2026-01-01',note:'保留备注'}],settings:{mainRest:180,assistRest:90}};
  program.plan=JSON.parse(JSON.stringify(days));program.logs=JSON.parse(JSON.stringify(logs));program.trainingLogs=JSON.parse(JSON.stringify(logs));program.rawRows=Array.from({length:100},()=>['原始导入行','x'.repeat(100)]);
  return {schemaVersion:6,activeProfileId:'profile_a',activeProgramId:'program_a',profiles:{profile_a:{profileId:'profile_a',programs:{program_a:program},exerciseTemplates:[{id:'t1',name:'深蹲'}],warmupTemplates:[{id:'w1',name:'热身'}],warmupActionTemplates:[],rmRecords:[{name:'深蹲',oneRm:100}]}},ui:{},builtinWarmups:sampleWarmups};
}

test('H1. inspectTrainingStorage 只读且返回关键统计',()=>{
  const raw=JSON.stringify(rootFixture()),preV6=JSON.stringify({...rootFixture(),schemaVersion:5}),legacy=JSON.stringify({plan:samplePlan}),storage=new TrackingStorage({'training-tracker-state':raw,'training-tracker-state-pre-v6-backup':preV6,xuhui_training_v2_dailygrid:legacy}),app=loadStorage(storage);
  const before=[...storage.data.entries()];const report=app.inspectTrainingStorage();
  assert.equal(report.root.programs,1);assert.equal(report.root.workouts,3);assert.equal(report.root.workoutLogs,4);assert.equal(report.root.weightedEntries,4);assert.equal(report.root.currentWorkoutDrafts,1);assert.equal(report.root.currentWorkoutId,'W002');
  app.exportRawTrainingState();app.exportRawPreV6Backup();app.exportRawLegacyStorageKey('xuhui_training_v2_dailygrid');
  assert.deepEqual([...storage.data.entries()],before);assert.equal(storage.writes,0);
});

test('H2. Schema v6 启动只读，不自动回写 localStorage',()=>{
  for(const seed of [
    {'training-tracker-state':JSON.stringify(rootFixture())},
    {'training-tracker-state':JSON.stringify({...rootFixture(),schemaVersion:5})},
    {xuhui_training_v2_dailygrid:JSON.stringify({plan:samplePlan})},
    {}
  ]){
    const storage=new TrackingStorage(seed),app=loadStorage(storage);app.initializeTrainingTracker(samplePlan,sampleWarmups);assert.equal(storage.writes,0);
  }
});

test('H3. compactState 删除重复 alias、derived history 和 raw rows',()=>{
  const app=loadStorage(),source=rootFixture(),compact=app.compactState(source,{builtinWarmups:sampleWarmups});
  const program=compact.profiles.profile_a.programs.program_a;
  assert.equal('plan' in program,false);assert.equal('logs' in program,false);assert.equal('trainingLogs' in program,false);assert.equal('exerciseHistory' in program,false);assert.equal('rawRows' in program,false);assert.equal('builtinWarmups' in compact,false);
});

test('H4. compactState 保留日志、重量、草稿、日期、模板、RM 与备注',()=>{
  const app=loadStorage(),source=rootFixture(),compact=app.compactState(source,{builtinWarmups:sampleWarmups});
  assert.doesNotThrow(()=>app.validateCompactedState(source,compact));
  const program=compact.profiles.profile_a.programs.program_a;
  assert.equal(program.workoutLogs[3].entries[0].weightKg,63);assert.equal(program.currentWorkoutDrafts.W001.mains[0].sets[0].weightKg,60);assert.equal(program.actualDates.W001,'2026-01-01');assert.equal(program.currentSessionNote,'保留备注');assert.equal(compact.profiles.profile_a.exerciseTemplates.length,1);assert.equal(compact.profiles.profile_a.rmRecords.length,1);
});

test('H5. 大数据 fixture 压缩后体积显著下降且实体数量不变',()=>{
  const source=rootFixture(220,365),app=loadStorage(),compact=app.compactState(source,{builtinWarmups:sampleWarmups});
  app.validateCompactedState(source,compact);const before=JSON.stringify(source).length,after=JSON.stringify(compact).length;
  assert.ok(after<before*0.65,`expected compact ratio < 0.65, got ${after/before}`);assert.equal(compact.profiles.profile_a.programs.program_a.days.length,220);assert.equal(compact.profiles.profile_a.programs.program_a.workoutLogs.length,365);
});

test('H6. saveState 只持久化 compact 副本，运行时历史仍在',()=>{
  const source=rootFixture(),storage=new MemoryStorage({'training-tracker-state':JSON.stringify(source)}),app=loadStorage(storage);app.initializeTrainingTracker(samplePlan,sampleWarmups);app.saveState();
  const stored=JSON.parse(storage.getItem('training-tracker-state')).profiles.profile_a.programs.program_a;
  assert.equal(stored.exerciseHistory,undefined);assert.equal(stored.plan,undefined);assert.equal(stored.logs,undefined);assert.ok(app.getActiveProgram().exerciseHistory['深蹲']);
});

test('H7. QuotaExceededError 被单独识别',()=>{
  const app=loadStorage();for(const error of [Object.assign(new Error('The quota has been exceeded.'),{name:'QuotaExceededError'}),Object.assign(new Error('quota'),{name:'NS_ERROR_DOM_QUOTA_REACHED'}),Object.assign(new Error('DOMException quota'),{code:22})])assert.equal(app.isStorageQuotaError(error),true);
});

test('H8. 导入 Program 遇到 quota 时当前根状态与 activeProgram 不变',()=>{
  const source=rootFixture(),raw=JSON.stringify(source),storage=new QuotaStorage({'training-tracker-state':raw},raw.length+20),app=loadStorage(storage);app.initializeTrainingTracker(samplePlan,sampleWarmups);
  const beforeRuntime=JSON.stringify(app.trainingTrackerState),beforeActive=app.trainingTrackerState.activeProgramId,beforeProgram=JSON.stringify(app.getActiveProgram());
  assert.throws(()=>app.addProgram(app.normalizeProgram({name:'新计划',days:Array.from({length:20},(_,i)=>workout('N'+i))}),true),error=>error&&error.code==='STORAGE_QUOTA_EXCEEDED');
  assert.equal(app.trainingTrackerState.activeProgramId,beforeActive);assert.equal(JSON.stringify(app.trainingTrackerState),beforeRuntime);assert.equal(JSON.stringify(app.getActiveProgram()),beforeProgram);assert.equal(storage.getItem('training-tracker-state'),raw);
});

test('H9. currentWorkoutId 优先于旧 currentIndex 恢复当前训练',()=>{
  const source=rootFixture();source.profiles.profile_a.programs.program_a.currentIndex=0;source.profiles.profile_a.programs.program_a.currentWorkoutId='W003';
  const app=loadStorage(new MemoryStorage({'training-tracker-state':JSON.stringify(source)}));app.initializeTrainingTracker(samplePlan,sampleWarmups);assert.equal(app.getActiveProgram().currentIndex,2);assert.equal(app.getActiveProgram().currentWorkoutId,'W003');
});

test('H10. 上肢和下肢标题中的技术不会覆盖训练类型',()=>{
  const app=loadTrainingModules();
  assert.equal(app.classifyTrainingDay({'训练主题':'上肢A｜卧推技术+胸肩三头'}).label,'上肢A');
  assert.equal(app.classifyTrainingDay({'训练主题':'上肢B｜背阔背厚+后束二头技术'}).label,'上肢B');
  assert.equal(app.classifyTrainingDay({'训练主题':'下肢A｜前蹲技术'}).label,'下肢A');
  assert.equal(app.classifyTrainingDay({'训练主题':'后链｜硬拉技术日'}).label,'技术/硬拉');
});

test('H11. 结构化训练类型字段优先于标题猜测',()=>{
  const app=loadTrainingModules();assert.equal(app.classifyTrainingDay({trainingType:'上肢B','训练主题':'含技术字样'}).label,'上肢B');
});

test('H12. 重复 plannedDate 不会让所有未来 Workout 显示同一天',()=>{
  const app=loadTrainingModules(),days=Array.from({length:4},(_,i)=>({workoutId:'W'+i,plannedDate:'2026-08-29'}));
  assert.deepEqual(days.map((_,i)=>app.calculateScheduledWorkoutDate(days,i,{},{} ,'','2026-08-29')),['2026-08-29','2026-08-30','2026-08-31','2026-09-01']);
});

test('H13. actualDate 锁定且后续未完成训练从最近实际日期顺推',()=>{
  const app=loadTrainingModules(),days=Array.from({length:5},(_,i)=>({workoutId:'W'+i,plannedDate:''})),actual={W1:'2026-08-29'};
  assert.equal(app.calculateScheduledWorkoutDate(days,1,actual,{},'2026-08-20','2026-08-29'),'2026-08-29');assert.equal(app.calculateScheduledWorkoutDate(days,2,actual,{},'2026-08-20','2026-08-29'),'2026-08-30');assert.equal(app.calculateScheduledWorkoutDate(days,4,actual,{},'2026-08-20','2026-08-29'),'2026-09-01');
});

test('H14. 缺少 plannedDate 时仍按 startDate 逐日顺推',()=>{
  const app=loadTrainingModules(),days=Array.from({length:3},(_,i)=>({workoutId:'W'+i}));assert.deepEqual(days.map((_,i)=>app.calculateScheduledWorkoutDate(days,i,{},{} ,'2026-08-29','2026-08-29')),['2026-08-29','2026-08-30','2026-08-31']);
});

test('H15. 存储根 key 保持 training-tracker-state',()=>{const app=loadStorage();assert.equal(app.TRAINING_TRACKER_STORAGE_KEY,'training-tracker-state');});

test('H16. Structured 已识别但保存 quota 时显示专用错误',()=>{
  const app=loadTrainingModules(),error=Object.assign(new Error('The quota has been exceeded.'),{name:'QuotaExceededError'});
  assert.equal(app.importApplyErrorMessage(error),'训练计划已经识别成功，但浏览器本地存储空间不足，因此没有保存新计划。当前计划未修改。');
});

test('H17. 周期备份仍包含动作历史，但 localStorage 不重复保存',()=>{
  const source=rootFixture(),storage=new MemoryStorage({'training-tracker-state':JSON.stringify(source)}),app=loadTrainingModules(storage);app.initializeTrainingTracker(samplePlan,sampleWarmups);
  const backup=app.buildCycleBackupObject(),backupProgram=backup.state.profiles.profile_a.programs.program_a,storedProgram=JSON.parse(storage.getItem('training-tracker-state')).profiles.profile_a.programs.program_a;
  assert.ok(backupProgram.exerciseHistory['深蹲']);assert.equal(storedProgram.exerciseHistory,undefined);assert.equal(backupProgram.workoutLogs.length,4);
});

test('H18. Legacy key 诊断能统计计划、日志和重量',()=>{
  const legacy={plan:samplePlan,logs:[{entries:[{name:'前蹲',weight:'60',weightKg:60,reps:'5'}]}],currentWorkoutDrafts:{0:{mains:[]}},exerciseTemplates:[{name:'前蹲'}]};
  const storage=new MemoryStorage({xuhui_training_v2_dailygrid:JSON.stringify(legacy)}),app=loadStorage(storage),report=app.inspectTrainingStorage().legacy.xuhui_training_v2_dailygrid;
  assert.equal(report.exists,true);assert.equal(report.workouts,2);assert.equal(report.workoutLogs,1);assert.equal(report.weightedEntries,1);assert.equal(report.currentWorkoutDrafts,1);assert.equal(report.exerciseTemplates,1);
});
