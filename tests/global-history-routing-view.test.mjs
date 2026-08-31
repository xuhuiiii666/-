import test from 'node:test';
import assert from 'node:assert/strict';
import {loadImporter,loadTrainingModules} from './helpers.mjs';
import {longFormRows,workbookFromLongFormRows} from './fixtures/long-form-daily-fixture.mjs';

function weightedLog(index,count=20){
  return {actualDate:`2026-05-${String(index%28+1).padStart(2,'0')}`,planIndex:index,title:'旧训练',entries:Array.from({length:count},(_,set)=>({type:'主训练',name:set===0?'杠铃卧推':'旧动作',trackingName:set===0?'杠铃卧推':'旧动作',set:set+1,weight:String(60+index),unit:'kg',weightKg:60+index,reps:'5',rir:'2'}))};
}
function realRootShape(app){
  const oldLogs=Array.from({length:63},(_,index)=>weightedLog(index,index===62?18:20));
  const oldProgram={programId:'old-114',name:'旧114日计划',days:Array.from({length:114},(_,i)=>({workoutId:`old-${i}`})),workoutLogs:oldLogs,actualDates:{'old-1':'2026-05-20'},completed:{'old-1':true},currentWorkoutDrafts:{},currentSessionNote:'旧备注'};
  const parsed=app.parseLongFormDailyGrid(longFormRows,{fileName:'96天计划.xlsx',sheetName:'手机查看版_一日一格'});
  const newProgram=app.createProgramFromPlan(parsed.plan,{programId:'new-96',name:'正确96日计划',source:'long-form-daily-v1',sourceFileName:'96天计划.xlsx'});
  return {schemaVersion:6,activeProfileId:'p',activeProgramId:'new-96',profiles:{p:{profileId:'p',programs:{'old-114':oldProgram,'new-96':newProgram},exerciseTemplates:[],warmupTemplates:[],warmupActionTemplates:[],rmRecords:[]}},ui:{}};
}
function weightedCount(logs){return logs.flatMap(log=>log.entries||[]).filter(entry=>String(entry.weight||'')||Number(entry.weightKg)>0).length;}

test('G1. 真实长格式列结构稳定选择 Long-form adapter',()=>{
  const app=loadImporter(),parsed=app.parseWorkbookToImport(workbookFromLongFormRows(),{name:'96天计划.xlsx'});
  assert.equal(parsed.format,'long-form-daily-v1');assert.equal(parsed.adapter,'Long-form Daily Grid');
});
test('G2. Long-form detector 命中后绝不继续 Legacy',()=>{
  const app=loadImporter();let legacyCalls=0;app.parseDailyGridSheet=()=>{legacyCalls++;throw new Error('不应调用');};
  const parsed=app.parseWorkbookToImport(workbookFromLongFormRows(),{name:'96天计划.xlsx'});
  assert.equal(parsed.format,'long-form-daily-v1');assert.equal(legacyCalls,0);
});
test('G3. Preview 明确显示 adapter 类型',()=>{
  const app=loadImporter(),parsed=app.parseWorkbookToImport(workbookFromLongFormRows(),{name:'96天计划.xlsx'});
  assert.match(app.importPrecheckText(parsed,'96天计划.xlsx'),/导入方式：Long-form Daily Grid/);
});
test('G4. Long-form 训练日包含结构化热身',()=>{const app=loadImporter(),parsed=app.parseLongFormDailyGrid(longFormRows,{sheetName:'手机查看版_一日一格'});assert.ok(parsed.semanticStats.warmups>0);});
test('G5. Long-form 训练日包含 Activity',()=>{const app=loadImporter(),parsed=app.parseLongFormDailyGrid(longFormRows,{sheetName:'手机查看版_一日一格'});assert.ok(parsed.semanticStats.warmups+parsed.semanticStats.cardio+parsed.semanticStats.climbing>0);});
test('G6. 旧 Legacy 文件仍走 Legacy',()=>{const app=loadImporter(),rows=[['顺序日','周次','周内日','类型','主题','今日内容（整格照做）','完成日期/备注'],[1,1,'周一','训练日','旧格式','【功能/热身】\n踝活动 2组×10次\n【主训练】\n深蹲｜3组×5次｜余力3｜休180秒','']];const parsed=app.parseWorkbookToImport({SheetNames:['手机查看版_一日一格'],Sheets:{'手机查看版_一日一格':rows}},{name:'旧计划.xlsx'});assert.notEqual(parsed.format,'long-form-daily-v1');assert.equal(parsed.adapter,'Legacy Import');});
test('G7. 正确 Long-form 与错误 Legacy 96 Program fingerprint 不同',()=>{const app=loadTrainingModules(),parsed=app.parseLongFormDailyGrid(longFormRows,{fileName:'同名.xlsx',sheetName:'手机查看版_一日一格'}),correct=app.createProgramFromPlan(parsed.plan,{name:'同名.xlsx',source:'long-form-daily-v1',sourceFileName:'同名.xlsx'}),wrong=app.createProgramFromPlan(parsed.plan.map(day=>({'训练主题':day['训练主题'],'训练内容（组×次数/余力）':day['训练内容（组×次数/余力）']})),{name:'同名.xlsx',source:'excel',sourceFileName:'同名.xlsx'});assert.notEqual(app.programContentFingerprint(correct).hash,app.programContentFingerprint(wrong).hash);});
test('G8. 正确 Long-form 可以作为全新 Program 加入且不覆盖错误版本',()=>{const app=loadTrainingModules(),root=realRootShape(app);app.trainingTrackerState=root;const profile=root.profiles.p,count=Object.keys(profile.programs).length,parsed=app.parseLongFormDailyGrid(longFormRows,{fileName:'96天计划.xlsx',sheetName:'手机查看版_一日一格'}),program=app.createProgramFromPlan(parsed.plan,{name:'正确版本2',source:'long-form-daily-v1'});profile.programs[program.programId]=program;assert.equal(Object.keys(profile.programs).length,count+1);assert.ok(profile.programs['old-114']);assert.ok(profile.programs['new-96']);});
test('G9. 全部历史聚合为 63 条',()=>{const app=loadTrainingModules(),root=realRootShape(app);assert.equal(app.collectAllWorkoutLogs(root).length,63);});
test('G10. 当前新 Program 历史为 0',()=>{const app=loadTrainingModules(),root=realRootShape(app);assert.equal(app.collectProgramWorkoutLogs(root,root.activeProgramId).length,0);});
test('G11. 切回旧 Program 当前历史为 63',()=>{const app=loadTrainingModules(),root=realRootShape(app);root.activeProgramId='old-114';assert.equal(app.collectProgramWorkoutLogs(root,root.activeProgramId).length,63);});
test('G12. 全局历史聚合不修改任何原日志',()=>{const app=loadTrainingModules(),root=realRootShape(app),before=JSON.stringify(root.profiles.p.programs['old-114'].workoutLogs);app.collectAllWorkoutLogs(root);assert.equal(JSON.stringify(root.profiles.p.programs['old-114'].workoutLogs),before);});
test('G13. 新 Program 同名卧推可读取旧 Program 最近重量',()=>{const app=loadTrainingModules(),root=realRootShape(app);app.trainingTrackerState=root;app.state=root.profiles.p.programs['new-96'];const last=app.getLastExercisePerformance('杠铃卧推（高张力）');assert.ok(last);assert.equal(last.programId,'old-114');assert.equal(last.date,'2026-05-28');assert.equal(last.sets[0].weightKg,115);});
test('G14. 结构化 Long-form warmup 优先于旧模板',()=>{const app=loadTrainingModules(),day=app.parseLongFormDailyGrid(longFormRows,{sheetName:'手机查看版_一日一格'}).plan[0],resolved=app.resolveWorkoutWarmup(day,{templates:[{name:day['热身模板'],steps:'旧模板'}]});assert.equal(resolved.kind,'structured');assert.ok(resolved.items.length);assert.doesNotMatch(resolved.text,/旧模板/);});
test('G15. 未知模板显示未设置而不是休息日',()=>{const app=loadTrainingModules(),resolved=app.resolveWorkoutWarmup({'类型':'力量训练','热身模板':'不存在'},{templates:[]});assert.equal(resolved.kind,'none');assert.equal(resolved.text,'');assert.equal(app.isRestWorkout({'类型':'力量训练'}),false);});
test('G16. 真正 rest Workout 返回恢复说明且零热身动作',()=>{const app=loadTrainingModules(),day=app.parseLongFormDailyGrid(longFormRows,{sheetName:'手机查看版_一日一格'}).plan[2],resolved=app.resolveWorkoutWarmup(day,{sharedSourceBlocks:{}});assert.equal(resolved.kind,'rest');assert.equal(resolved.items.length,0);assert.match(resolved.text,/完全休息|恢复/);});
test('G17. 攀岩日使用自己的结构化热身',()=>{const app=loadTrainingModules(),day=app.parseLongFormDailyGrid(longFormRows,{sheetName:'手机查看版_一日一格'}).plan[3],resolved=app.resolveWorkoutWarmup(day,{templates:[{name:'下肢热身',steps:'力量模板'}]});assert.equal(resolved.kind,'structured');assert.ok(resolved.items.some(item=>/攀岩|腕|肩胛|横移/.test(item.line)));});
test('G18. D5 multi-stage 与 superset 保持原样',()=>{const app=loadTrainingModules(),day=app.parseLongFormDailyGrid(longFormRows,{sheetName:'手机查看版_一日一格'}).plan[4];assert.equal(day.supersetRules.length,2);assert.ok(day.exercises.some(ex=>ex.sets.some(set=>Array.isArray(set.segments)&&set.segments.length>1)));});
test('G19. 聚合与正确 Program dry-run 不改变旧日志、重量和日期',()=>{const app=loadTrainingModules(),root=realRootShape(app),old=root.profiles.p.programs['old-114'],before={logs:JSON.stringify(old.workoutLogs),dates:JSON.stringify(old.actualDates),completed:JSON.stringify(old.completed),drafts:JSON.stringify(old.currentWorkoutDrafts),note:old.currentSessionNote};app.collectAllWorkoutLogs(root);app.findExerciseHistoryAcrossPrograms(root,'杠铃卧推');assert.equal(JSON.stringify(old.workoutLogs),before.logs);assert.equal(weightedCount(old.workoutLogs),1258);assert.equal(JSON.stringify(old.actualDates),before.dates);assert.equal(JSON.stringify(old.completed),before.completed);assert.equal(JSON.stringify(old.currentWorkoutDrafts),before.drafts);assert.equal(old.currentSessionNote,before.note);});
