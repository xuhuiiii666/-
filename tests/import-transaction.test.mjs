import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage,loadTrainingModules,samplePlan,sampleWarmups } from './helpers.mjs';

const ROOT_KEY='training-tracker-state';
const LEGACY_KEYS=[
  'xuhui_training_v2_dailygrid',
  'xuhui_training_v2_dailygrid_importedPlan',
  'xuhui_training_v2_dailygrid_importedWarmups',
  'xuhui_training_v2_dailygrid_importerMigrated_v3',
  'training_warmup_collapsed'
];

class FailSecondRootWriteStorage extends MemoryStorage{
  constructor(seed={}){super(seed);this.rootWrites=0;}
  setItem(key,value){
    if(String(key)===ROOT_KEY){
      this.rootWrites++;
      if(this.rootWrites===2){const error=new Error('The quota has been exceeded.');error.name='QuotaExceededError';throw error;}
    }
    super.setItem(key,value);
  }
}

class FailEveryRootWriteStorage extends MemoryStorage{
  setItem(key,value){
    if(String(key)===ROOT_KEY){const error=new Error('The quota has been exceeded.');error.name='QuotaExceededError';throw error;}
    super.setItem(key,value);
  }
}

function boot(storage){
  const app=loadTrainingModules(storage);
  app.initializeTrainingTracker(samplePlan,sampleWarmups);
  return app;
}

function savedRoot(){
  const storage=new MemoryStorage(),app=boot(storage),program=app.getActiveProgram(),profile=app.getActiveProfile();
  const workoutId=program.days[0].workoutId;
  program.workoutLogs=[{actualDate:'2026-05-20',workoutId,planIndex:0,title:'下肢A',note:'训练备注',entries:[{type:'主训练',name:'前蹲',trackingName:'前蹲',set:1,weight:'60',unit:'kg',weightKg:60,reps:'5',rir:'3'}]}];
  program.actualDates={[workoutId]:'2026-05-20'};
  program.completed={[workoutId]:true};
  program.currentWorkoutDrafts={[workoutId]:{workoutId,note:'草稿备注',mains:[{exerciseId:'E1',sets:[{setId:'S1',weight:'62.5',unit:'kg',weightKg:62.5,reps:'5',rir:'2'}]}],warmups:[]}};
  program.currentSessionNote='当前备注';program.noteArchive=[{date:'2026-05-20',note:'训练备注'}];
  profile.exerciseTemplates=[{id:'T1',name:'前蹲'}];profile.warmupTemplates=[{id:'W1',name:'下肢热身'}];
  app.saveState();
  return storage.getItem(ROOT_KEY);
}

function importedProgram(app,name='96天计划.xlsx'){
  return app.createProgramFromPlan(samplePlan,{name,source:'long-form-daily-v1',sourceFileName:name});
}

test('T1. canonical ROOT 成功后 secondary template quota 不反转 Import 成功',()=>{
  const storage=new FailSecondRootWriteStorage(),app=boot(storage),alerts=[],toasts=[];
  LEGACY_KEYS.forEach((key,index)=>storage.data.set(key,JSON.stringify({index,keep:true})));
  const legacyBefore=Object.fromEntries(LEGACY_KEYS.map(key=>[key,storage.getItem(key)]));
  const result=app.addImportedProgram(importedProgram(app),true);
  assert.equal(result.created,true);
  const primaryRoot=storage.getItem(ROOT_KEY),programId=result.program.programId;
  app.BUILTIN_WARMUPS=sampleWarmups;app.rebuild=()=>{};app.renderCalendar=()=>{};app.renderHistory=()=>{};app.showTab=()=>{};
  app.alert=message=>alerts.push(message);app.showToast=message=>toasts.push(message);
  app.autoSeedTemplatesFromPlan=()=>{app.getActiveProfile().exerciseTemplates.push({id:'secondary',name:'自动模板'});app.saveState();};
  assert.doesNotThrow(()=>app.refreshAfterProgramImport('已导入为新的训练计划：2天。'));
  assert.equal(storage.rootWrites,2);
  assert.equal(storage.getItem(ROOT_KEY),primaryRoot);
  assert.equal(JSON.parse(primaryRoot).activeProgramId,programId);
  assert.match(alerts[0],/^已导入为新的训练计划：2天。/);
  assert.match(alerts[0],/训练计划已保存，但动作模板更新因存储空间不足未保存/);
  assert.ok(!alerts[0].includes('没有保存新计划'));
  assert.ok(toasts.some(message=>message.includes('训练计划已保存')));
  LEGACY_KEYS.forEach(key=>assert.equal(storage.getItem(key),legacyBefore[key]));
});

test('T2. canonical ROOT 本身 quota 时 Import 失败且旧 ROOT 字节与 activeProgram 不变',()=>{
  const raw=savedRoot(),storage=new FailEveryRootWriteStorage({[ROOT_KEY]:raw}),app=boot(storage);
  const activeBefore=app.trainingTrackerState.activeProgramId,runtimeBefore=JSON.stringify(app.trainingTrackerState);
  assert.throws(()=>app.addImportedProgram(importedProgram(app),true),error=>error&&error.code==='STORAGE_QUOTA_EXCEEDED');
  assert.equal(storage.getItem(ROOT_KEY),raw);
  assert.equal(app.trainingTrackerState.activeProgramId,activeBefore);
  assert.equal(JSON.stringify(app.trainingTrackerState),runtimeBefore);
});

test('T3. 成功导入只写 canonical ROOT，不新增或扩大 Legacy keys',()=>{
  const raw=savedRoot(),legacy=Object.fromEntries(LEGACY_KEYS.map((key,index)=>[key,JSON.stringify({index,data:'x'.repeat(index+1)})])),storage=new MemoryStorage({[ROOT_KEY]:raw,...legacy}),app=boot(storage);
  const result=app.addImportedProgram(importedProgram(app),true);
  assert.equal(result.created,true);
  LEGACY_KEYS.forEach(key=>assert.equal(storage.getItem(key),legacy[key]));
  assert.deepEqual(storage.keys().sort(),[ROOT_KEY,...LEGACY_KEYS].sort());
});

test('T4-T6. Legacy 清理仅删除五个白名单 key 且 ROOT 与关键训练数据完全不变',()=>{
  const raw=savedRoot(),legacy=Object.fromEntries(LEGACY_KEYS.map((key,index)=>[key,JSON.stringify({index,data:'历史'.repeat(index+1)})]));
  const storage=new MemoryStorage({[ROOT_KEY]:raw,...legacy,'training-tracker-state-pre-v6-backup':'keep-pre-v6','unknown-app-key':'keep-unknown'}),app=boot(storage);
  const beforeRoot=storage.getItem(ROOT_KEY),before=JSON.parse(beforeRoot),beforeStats=app.collectStateIntegrityStats(before);
  const beforeProgram=before.profiles[before.activeProfileId].programs[before.activeProgramId],beforeProfile=before.profiles[before.activeProfileId];
  const criticalBefore=JSON.stringify({logs:beforeProgram.workoutLogs,dates:beforeProgram.actualDates,completed:beforeProgram.completed,drafts:beforeProgram.currentWorkoutDrafts,notes:[beforeProgram.currentSessionNote,beforeProgram.noteArchive],templates:[beforeProfile.exerciseTemplates,beforeProfile.warmupTemplates,beforeProfile.warmupActionTemplates]});
  const expectedBytes=LEGACY_KEYS.reduce((total,key)=>total+Buffer.byteLength(storage.getItem(key),'utf8'),0),result=app.deleteMigratedLegacyData();
  assert.equal(result.deleted,true);assert.equal(result.releasedBytes,expectedBytes);assert.equal(JSON.stringify(result.removedKeys),JSON.stringify(LEGACY_KEYS));
  assert.equal(storage.getItem(ROOT_KEY),beforeRoot);
  LEGACY_KEYS.forEach(key=>assert.equal(storage.getItem(key),null));
  assert.equal(storage.getItem('training-tracker-state-pre-v6-backup'),'keep-pre-v6');assert.equal(storage.getItem('unknown-app-key'),'keep-unknown');
  const after=JSON.parse(storage.getItem(ROOT_KEY)),afterProgram=after.profiles[after.activeProfileId].programs[after.activeProgramId],afterProfile=after.profiles[after.activeProfileId];
  const criticalAfter=JSON.stringify({logs:afterProgram.workoutLogs,dates:afterProgram.actualDates,completed:afterProgram.completed,drafts:afterProgram.currentWorkoutDrafts,notes:[afterProgram.currentSessionNote,afterProgram.noteArchive],templates:[afterProfile.exerciseTemplates,afterProfile.warmupTemplates,afterProfile.warmupActionTemplates]});
  assert.deepEqual(app.collectStateIntegrityStats(after),beforeStats);assert.equal(criticalAfter,criticalBefore);
});

test('T7. 内容 fingerprint 完全一致时不会静默创建重复 Program',()=>{
  const storage=new MemoryStorage(),app=boot(storage),first=app.addImportedProgram(importedProgram(app,'96天计划.xlsx'),true),count=Object.keys(app.getActiveProfile().programs).length;
  const second=app.addImportedProgram(importedProgram(app,' 96天计划.xlsx '),true);
  assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(second.program.programId,first.program.programId);
  assert.equal(Object.keys(app.getActiveProfile().programs).length,count);
});

test('T8. 同名且 Workout 数量相同但内容更新时仍允许创建新的 Program',()=>{
  const storage=new MemoryStorage(),app=boot(storage),first=importedProgram(app,'96天计划.xlsx');
  assert.equal(app.addImportedProgram(first,true).created,true);
  const updated=importedProgram(app,'96天计划.xlsx');updated.days[0]['训练内容（组×次数/余力）']='前蹲 4x5（余力2）';
  assert.equal(app.findImportedProgramBySource(updated.sourceFileName,updated.days.length).programId,first.programId);
  assert.notEqual(app.programContentFingerprint(updated).hash,app.programContentFingerprint(first).hash);
  const result=app.addImportedProgram(updated,true);
  assert.equal(result.created,true);assert.notEqual(result.program.programId,first.programId);
  assert.equal(Object.keys(app.getActiveProfile().programs).length,3);
});
