import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTrainingModules } from './helpers.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));

function day(number,options={}){
  const code=String(number).padStart(3,'0');
  const title=options.title||`训练 ${number}`;
  return {
    workoutId:options.workoutId||`runtime-${code}`,
    source:options.source||'structured-v1',
    sourceWorkoutId:options.sourceWorkoutId||`W${code}`,
    sourceWorkoutKey:options.sourceWorkoutKey||`structured:W${code}`,
    order:number,
    plannedDate:options.plannedDate||'',
    title,
    '训练主题':title,
    exercises:[]
  };
}

function weightedEntry(name,weight){
  return {type:'主训练',name,trackingName:name,set:1,weight:String(weight),unit:'kg',weightKg:weight,reps:'5',rir:'2'};
}

function affectedProgram(){
  const days=[day(1),day(2),day(3),day(44,{title:'当前计划下肢 B'})];
  const current=days[3];
  return {
    programId:'program-anonymous',name:'匿名计划',source:'structured-v1',days,
    currentIndex:3,currentWorkoutId:current.workoutId,
    actualDates:{[days[0].workoutId]:'2026-08-20',[days[2].workoutId]:'2026-08-29',[current.workoutId]:'2026-06-06'},
    dateAnchors:{[days[0].workoutId]:'2026-08-20',[days[2].workoutId]:'2026-08-29',[current.workoutId]:'2026-06-06'},
    completed:{[days[2].workoutId]:true,[current.workoutId]:false},sessionStartedAt:{},
    currentWorkoutDrafts:{
      [current.workoutId]:{workoutId:current.workoutId,updatedAt:'2026-08-29T10:33:00.000Z',note:'今日备注',warmups:[],mains:[{exerciseId:'exercise-current',name:'匿名动作',trackName:'匿名动作',sets:[{setId:'set-current',weight:'72.5',weightKg:72.5,reps:'5',rir:'2',rest:120}]}]}
    },
    currentWorkoutLogDraft:{planIndex:3,title:'旧计划肩部日',actualDate:'2026-06-06',date:'2026-06-06',entries:[weightedEntry('旧动作',55)]},
    workoutLogs:[
      {workoutId:days[0].workoutId,sourceWorkoutKey:days[0].sourceWorkoutKey,actualDate:'2026-08-20',planIndex:0,title:days[0].title,entries:[weightedEntry('深蹲',60)]},
      {workoutId:days[2].workoutId,sourceWorkoutKey:days[2].sourceWorkoutKey,actualDate:'2026-08-29',planIndex:2,title:days[2].title,status:'已完成',entries:[weightedEntry('深蹲',65)]},
      {workoutId:current.workoutId,sourceWorkoutKey:'structured:OLD044',actualDate:'2026-06-06',planIndex:3,title:'旧计划肩部日',status:'已完成',entries:[weightedEntry('旧动作',55)]}
    ],
    exerciseHistory:{},settings:{mainRest:180,assistRest:90},currentSessionNote:'今日备注',noteArchive:[{date:'2026-08-20',note:'保留'}]
  };
}

function replacementProgram(sourceKeys){
  return {
    programId:'replacement',name:'替换计划',source:'structured-v1',
    days:sourceKeys.map((key,index)=>day(index+1,{workoutId:`new-${index+1}`,sourceWorkoutId:key.replace('structured:',''),sourceWorkoutKey:key,title:`新训练 ${index+1}`})),
    currentIndex:0,currentWorkoutDrafts:{},actualDates:{},dateAnchors:{},completed:{},sessionStartedAt:{},workoutLogs:[]
  };
}

test('D1. sourceWorkoutKey 稳定且不依赖运行时 workoutId',()=>{
  const app=loadTrainingModules();
  const first={workoutId:'random-a',source:'legacy-import',order:44,title:'下肢 B'};
  const second={workoutId:'random-b',source:'legacy-import',order:44,title:'下肢 B'};
  assert.equal(app.deriveSourceWorkoutKey(first,43,first.source),app.deriveSourceWorkoutKey(second,43,second.source));
  assert.equal(app.deriveSourceWorkoutKey({source:'structured-v1',sourceWorkoutId:'W044'},43,'structured-v1'),'structured:W044');
});

test('D2. 日志绑定不允许只用 planIndex',()=>{
  const app=loadTrainingModules(),program=affectedProgram();
  assert.equal(app.findUniqueWorkoutForRecord(program,{planIndex:3}),null);
  assert.equal(app.findUniqueWorkoutForRecord(program,{planIndex:3,title:program.days[3].title}).workoutId,program.days[3].workoutId);
});

test('D3. 同 workoutId 但标题/来源冲突的 #44 actualDate 被识别为孤立',()=>{
  const app=loadTrainingModules(),report=app.inspectProgramDateIntegrity(affectedProgram());
  assert.equal(report.conflictingActualDates.length,1);
  assert.ok(report.orphanActualDates.some(item=>item.index===3&&item.date==='2026-06-06'));
  assert.ok(report.unmatchedLogs.some(item=>item.logIndex===2));
});

test('D4. 已完成 Workout 的 actualDate 永不会被修复器删除',()=>{
  const app=loadTrainingModules(),program=affectedProgram();
  program.workoutLogs[1].sourceWorkoutKey='structured:OTHER';
  const repaired=app.repairProgramDateState(program,{scheduledDateResolver:()=>''}).program;
  assert.equal(repaired.actualDates[program.days[2].workoutId],'2026-08-29');
});

test('D5. 可信日志保护 actualDate，不会因未 completed 被删',()=>{
  const app=loadTrainingModules(),program=affectedProgram();
  program.completed[program.days[0].workoutId]=false;
  const repaired=app.repairProgramDateState(program,{scheduledDateResolver:()=>''}).program;
  assert.equal(repaired.actualDates[program.days[0].workoutId],'2026-08-20');
});

test('D6. dry-run 只移除孤立日期并重建当前日志草稿',()=>{
  const app=loadTrainingModules(),program=affectedProgram();
  program.currentWorkoutDrafts[program.days[3].workoutId].note='';program.currentWorkoutDrafts[program.days[3].workoutId].sets=[];
  program.currentWorkoutDrafts[program.days[3].workoutId].mains[0].sets=[{setId:'set-current',weight:'',weightKg:0,reps:'5',rir:'2',targetRepsMin:5,targetRepsMax:5,targetRirMin:2,targetRirMax:2,rest:120}];
  program.workoutLogs=program.workoutLogs.slice(0,2);
  const cleanBefore=clone(program);
  const result=app.repairProgramDateState(program,{dryRun:true,scheduledDateResolver:()=> '2026-08-30'});
  assert.equal(program.actualDates[program.days[3].workoutId],'2026-06-06');
  assert.equal(result.program.actualDates[program.days[3].workoutId],undefined);
  assert.equal(result.program.currentWorkoutLogDraft.workoutId,program.days[3].workoutId);
  assert.equal(result.program.currentWorkoutLogDraft.actualDate,'');
  assert.equal(result.program.currentWorkoutLogDraft.scheduledDate,'2026-08-30');
  assert.equal(result.program.currentWorkoutLogDraft.entries[0].weightKg,0);
  assert.equal(JSON.stringify(program),JSON.stringify(cleanBefore));
});

test('D7. 日期修复不改 workoutLogs 数量、重量或训练内容',()=>{
  const app=loadTrainingModules(),program=affectedProgram();
  const logs=JSON.stringify(program.workoutLogs),days=JSON.stringify(program.days);
  const result=app.repairProgramDateState(program,{scheduledDateResolver:()=> '2026-08-30'});
  assert.equal(JSON.stringify(result.program.workoutLogs),logs);
  assert.equal(JSON.stringify(result.program.days),days);
  assert.equal(result.program.workoutLogs.flatMap(log=>log.entries).reduce((sum,entry)=>sum+Number(entry.weightKg||0),0),180);
});

test('D8. lastActual 只从有证据的 actualDate 推导',()=>{
  const app=loadTrainingModules(),program=affectedProgram(),last=app.deriveLastActualState(program);
  assert.equal(last.date,'2026-08-29');
  assert.equal(last.index,2);
});

test('D9. 缺 workoutId 的 Legacy 草稿只有唯一标题匹配时才绑定',()=>{
  const app=loadTrainingModules(),program=affectedProgram();
  program.currentWorkoutLogDraft={title:program.days[3].title,planIndex:3,entries:[]};
  assert.equal(app.currentWorkoutLogDraftFor(program).title,program.days[3].title);
  program.days.push(day(45,{title:program.days[3].title}));
  assert.equal(app.currentWorkoutLogDraftFor(program),null);
});

test('D10. 替换 Program 只迁移完全相同 sourceWorkoutKey 的执行状态',()=>{
  const app=loadTrainingModules(),old=affectedProgram(),sameKey=old.days[0].sourceWorkoutKey,different='structured:NEW002';
  old.actualDates={[old.days[0].workoutId]:'2026-08-20',[old.days[1].workoutId]:'2026-08-21'};
  old.completed={[old.days[0].workoutId]:true,[old.days[1].workoutId]:true};
  const merged=app.mergeReplacementProgramState(old,replacementProgram([sameKey,different]));
  assert.equal(merged.actualDates['new-1'],'2026-08-20');
  assert.equal(merged.completed['new-1'],true);
  assert.equal(merged.actualDates['new-2'],undefined);
  assert.equal(merged.completed['new-2'],undefined);
  assert.equal(JSON.stringify(merged.workoutLogs),JSON.stringify(old.workoutLogs));
});

test('D11. 替换 Program 不会因相同数组位置继承日期',()=>{
  const app=loadTrainingModules(),old=affectedProgram(),next=replacementProgram(['structured:X001','structured:X002','structured:X003','structured:X044']);
  const merged=app.mergeReplacementProgramState(old,next);
  assert.deepEqual(Object.keys(merged.actualDates),[]);
  assert.deepEqual(Object.keys(merged.currentWorkoutDrafts),[]);
  assert.equal(merged.currentIndex,0);
});

test('D12. 导入为新 Program 时日期、日志、草稿均为空',()=>{
  const app=loadTrainingModules(),created=app.createProgramFromPlan(replacementProgram(['structured:N001']).days,{name:'新计划',source:'structured-v1'});
  assert.equal(created.workoutLogs.length,0);
  assert.deepEqual(Object.keys(created.actualDates),[]);
  assert.deepEqual(Object.keys(created.currentWorkoutDrafts),[]);
  assert.equal(created.currentWorkoutLogDraft,null);
});

test('D13. 修复后 exerciseHistory 仍由完整 logs 重建且取最新重量',()=>{
  const app=loadTrainingModules(),result=app.repairProgramDateState(affectedProgram(),{scheduledDateResolver:()=>''});
  const history=app.buildExerciseHistoryFromLogs(result.program.workoutLogs);
  assert.equal(history['深蹲'].length,2);
  assert.equal(history['深蹲'].at(-1).sets[0].weightKg,65);
});

test('D14. 日期修复不修改根级模板、RM 和备注',()=>{
  const app=loadTrainingModules(),program=affectedProgram(),root={profiles:{p:{exerciseTemplates:[{name:'深蹲'}],warmupTemplates:[{name:'热身'}],rmRecords:[{name:'深蹲',oneRm:100}],programs:{x:program}}}};
  const before=clone(root);root.profiles.p.programs.x=app.repairProgramDateState(program,{scheduledDateResolver:()=>''}).program;
  assert.equal(JSON.stringify(root.profiles.p.exerciseTemplates),JSON.stringify(before.profiles.p.exerciseTemplates));
  assert.equal(JSON.stringify(root.profiles.p.warmupTemplates),JSON.stringify(before.profiles.p.warmupTemplates));
  assert.equal(JSON.stringify(root.profiles.p.rmRecords),JSON.stringify(before.profiles.p.rmRecords));
  assert.equal(JSON.stringify(root.profiles.p.programs.x.noteArchive),JSON.stringify(before.profiles.p.programs.x.noteArchive));
});

test('D15. 114 Workout 加 84 Workout 多 Program 压缩时不产生重复 alias',()=>{
  const app=loadTrainingModules(),large=affectedProgram();
  large.days=Array.from({length:114},(_,index)=>day(index+1));large.currentIndex=0;large.currentWorkoutId=large.days[0].workoutId;
  const imported={...replacementProgram(Array.from({length:84},(_,index)=>`structured:I${String(index+1).padStart(3,'0')}`)),programId:'program-imported'};
  const root={schemaVersion:6,activeProfileId:'p',activeProgramId:'program-anonymous',profiles:{p:{profileId:'p',programs:{'program-anonymous':large,'program-imported':imported},exerciseTemplates:[],warmupTemplates:[],warmupActionTemplates:[],rmRecords:[]}},ui:{}};
  const compact=app.compactState(root),serialized=JSON.stringify(compact);
  assert.equal(compact.profiles.p.programs['program-anonymous'].days.length,114);
  assert.equal(compact.profiles.p.programs['program-imported'].days.length,84);
  assert.equal('plan' in compact.profiles.p.programs['program-anonymous'],false);
  assert.equal('logs' in compact.profiles.p.programs['program-anonymous'],false);
  assert.ok(serialized.length<500000);
});
