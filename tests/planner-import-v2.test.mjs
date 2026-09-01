import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {loadImporter,loadTrainingModules,MemoryStorage} from './helpers.mjs';
import {plannerV2Workbook,blankPlannerV2Workbook,headers,sheetNames} from './fixtures/planner-v2-fixture.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const app=()=>loadImporter();

test('PV2-01. 官方完整示例 0 ERROR 且 Semantic PASS',()=>{
  const report=app().validatePlannerV2Workbook(plannerV2Workbook(),app().normalizeExcelRows);
  assert.equal(report.errors.length,0);assert.equal(report.semanticStatus,'PASS');assert.equal(report.stats.workouts,4);
});

test('PV2-02. 空白母模板结构 PASS，但不满足正式导入门槛',()=>{
  const runtime=app(),report=runtime.validatePlannerV2Workbook(blankPlannerV2Workbook(),runtime.normalizeExcelRows,{allowEmpty:true});
  assert.equal(report.structureValid,true);assert.equal(report.errors.length,0);assert.equal(report.semanticValid,false);assert.ok(report.warnings.length);
});

test('PV2-03. v2 标识优先接管，即使混入 v1 Sheet 也不会 fallback',()=>{
  const runtime=app(),workbook=plannerV2Workbook();workbook.SheetNames.push('训练器数据_v1');workbook.Sheets['训练器数据_v1']=[['bad']];
  assert.throws(()=>runtime.parseWorkbookToImport(workbook,{name:'v2.xlsx'}),error=>error.code==='PLANNER_V2_VALIDATION_FAILED'&&error.report.errors.some(item=>item.includes('不允许额外工作表')));
});

test('PV2-04. 出现 v2 标识但验证失败时禁止 fallback',()=>{
  const runtime=app(),workbook=plannerV2Workbook();workbook.Sheets[sheetNames.plan][1][0]='wrong-protocol';
  assert.throws(()=>runtime.parseWorkbookToImport(workbook,{name:'错误.xlsx'}),error=>error.code==='PLANNER_V2_VALIDATION_FAILED');
});

test('PV2-05. Preview 包含协议要求的所有统计',()=>{
  const runtime=app(),parsed=runtime.parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}),text=runtime.importPrecheckText(parsed,'示例.xlsx');
  for(const expected of ['导入方式：Planner Import v2','Schema：2','planKey：SAMPLE_PLAN','planVersion：1.0','Workout：4','Exercise：8','Set：10','Activity：5','Activity Segment：5','Superset：1','Drop Segment：3','Instruction：3','Errors：0','Warnings：0','Semantic validation：PASS'])assert.match(text,new RegExp(expected));
});

test('PV2-06. 稳定来源键和运行时 ID 分离',()=>{
  const parsed=app().parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}),day=parsed.plan[0],exercise=day.exercises[0],set=exercise.sets[0];
  assert.equal(day.sourceWorkoutKey,'planner-v2:SAMPLE_PLAN:W001');assert.equal(exercise.sourceExerciseKey,'planner-v2:SAMPLE_PLAN:W001-E01');assert.equal(set.sourceSetKey,'planner-v2:SAMPLE_PLAN:W001-E01-S01');assert.notEqual(day.workoutId,'W001');assert.notEqual(exercise.exerciseId,'W001-E01');assert.notEqual(set.setId,'W001-E01-S01');
});

test('PV2-07. targetWeight 只保存为处方，不污染实际重量',()=>{
  const set=app().parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}).plan[0].exercises[0].sets[0];
  assert.equal(set.targetWeight,20);assert.equal(set.targetWeightUnit,'kg');assert.equal(set.weight,'');assert.equal(set.weightKg,0);
});

test('PV2-08. technique / top / backoff / working 映射正确',()=>{
  const exercises=app().parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}).plan[0].exercises;
  assert.deepEqual(Array.from(exercises[0].sets,set=>set.setType),['technique','top','backoff']);assert.equal(exercises[0].sets[2].loadAdjustmentValue,-15);assert.equal(exercises[1].sets[0].setType,'working');
});

test('PV2-09. 多阶段递减保留独立 Segment 和 source key',()=>{
  const set=app().parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}).plan[0].exercises.find(item=>item.plannerExerciseKey==='W001-E05').sets[0];
  assert.equal(set.setType,'dropset');assert.equal(set.segments.length,3);assert.equal(set.segments[1].loadAdjustmentMin,-25);assert.equal(set.segments[1].sourceDropSegmentKey,'planner-v2:SAMPLE_PLAN:W001-E05-S01-D02');
});

test('PV2-10. Superset 由 source key 成员关系生成',()=>{
  const day=app().parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}).plan[0],rule=day.supersetRules[0];
  assert.equal(rule.mode,'alternating');assert.equal(rule.members.length,2);assert.ok(rule.members.every(id=>day.exercises.some(exercise=>exercise.exerciseId===id)));
});

test('PV2-11. 两个主项热身和 Activity Segment 保持独立',()=>{
  const day=app().parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}).plan[0],warmups=day.activities.filter(item=>item.activityType==='warmup');
  assert.equal(warmups.length,2);assert.deepEqual(Array.from(warmups,item=>item.segments.length),[2,1]);assert.equal(warmups[0].segments[0].targetWeight,20);assert.equal(warmups[0].segments[0].weight,'');
});

test('PV2-12. Zone2 与攀岩是 Activity，不生成假 Exercise',()=>{
  const parsed=app().parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}),zone=parsed.plan[0].activities.find(item=>item.activityType==='cardio'),climb=parsed.plan[1].activities[0];
  assert.equal(zone.zone,'Zone2');assert.equal(climb.activityType,'climbing');assert.equal(climb.drills.length,2);assert.equal(parsed.plan[1].exercises.length,0);
});

test('PV2-13. skill acquisition / retention 保留规范角色',()=>{
  const exercises=app().parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}).plan[0].exercises;
  assert.ok(exercises.some(item=>item.trainingRole==='skill-acquisition'));assert.ok(exercises.some(item=>item.trainingRole==='skill-retention'));
});

test('PV2-14. scoped Instruction 分别挂载 Workout / Exercise / Activity',()=>{
  const parsed=app().parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}),day=parsed.plan[0],climb=parsed.plan[1].activities[0];
  assert.equal(day.instructions.length,1);assert.equal(day.exercises[0].instructions.length,1);assert.equal(climb.instructions.length,1);assert.equal(day.exercises.some(item=>item.name.includes('说明')),false);
});

test('PV2-15. rest Workout 只保留 recovery Activity',()=>{
  const day=app().parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}).plan[2];assert.equal(day.workoutType,'rest');assert.equal(day.exercises.length,0);assert.deepEqual(Array.from(day.activities,item=>item.activityType),['recovery']);
});

test('PV2-16. rest Workout 出现正式动作时报错',()=>{
  const runtime=app(),workbook=plannerV2Workbook(),row=clone(workbook.Sheets[sheetNames.exercises][1]);row[headers.exercises.indexOf('workoutKey')]='W003';row[headers.exercises.indexOf('exerciseKey')]='W003-E01';row[headers.exercises.indexOf('order')]=1;workbook.Sheets[sheetNames.exercises].push(row);
  const setRow=clone(workbook.Sheets[sheetNames.sets][1]);setRow[headers.sets.indexOf('workoutKey')]='W003';setRow[headers.sets.indexOf('exerciseKey')]='W003-E01';setRow[headers.sets.indexOf('setKey')]='W003-E01-S01';workbook.Sheets[sheetNames.sets].push(setRow);
  assert.ok(runtime.validatePlannerV2Workbook(workbook,runtime.normalizeExcelRows).errors.some(error=>error.includes('rest Workout W003 不能包含 Exercise')));
});

test('PV2-17. 外键、enum、连续组号和范围错误均被拒绝',()=>{
  const runtime=app(),workbook=plannerV2Workbook(),row=workbook.Sheets[sheetNames.sets][2];row[headers.sets.indexOf('exerciseKey')]='MISSING';row[headers.sets.indexOf('setNo')]=4;row[headers.sets.indexOf('setType')]='heavy';row[headers.sets.indexOf('rirMax')]=20;
  const errors=runtime.validatePlannerV2Workbook(workbook,runtime.normalizeExcelRows).errors.join('\n');assert.match(errors,/找不到 exerciseKey/);assert.match(errors,/setType 只能是/);assert.match(errors,/RIR不能大于 10/);assert.match(errors,/Set setNo/);
});

test('PV2-18. Preview 和校验完全只读',()=>{
  const storage=new MemoryStorage({'training-tracker-state':'ORIGINAL'}),runtime=loadImporter(storage);runtime.parseWorkbookToImport(plannerV2Workbook(),{name:'只读.xlsx'});assert.equal(storage.getItem('training-tracker-state'),'ORIGINAL');
});

test('PV2-19. Schema v6 normalize 保留 Planner 字段且不写实际重量',()=>{
  const runtime=loadTrainingModules(),parsed=runtime.parseWorkbookToImport(plannerV2Workbook(),{name:'示例.xlsx'}),program=runtime.createProgramFromPlan(parsed.plan,{name:parsed.programName,source:'planner-v2'}),set=program.days[0].exercises[0].sets[0];
  assert.equal(runtime.TRAINING_TRACKER_SCHEMA_VERSION,6);assert.equal(program.days[0].sourceWorkoutKey,'planner-v2:SAMPLE_PLAN:W001');assert.equal(set.targetWeight,20);assert.equal(set.weight,'');assert.equal(set.weightKg,0);
});

test('PV2-20. Structured v1 / Long-form / Legacy 路由仍存在且位于 v2 之后',()=>{
  const source=fs.readFileSync(new URL('../importer.js',import.meta.url),'utf8'),v2=source.indexOf('detectPlannerV2Format(workbook)'),v1=source.indexOf('detectStructuredFormat(workbook)',v2),longform=source.indexOf('detectLongFormDailyGrid',v1),legacy=source.indexOf('parseDailyGridSheet(selected.rows',longform);
  assert.ok(v2>=0&&v1>v2&&longform>v1&&legacy>longform);
});

test('PV2-21. SPEC 列定义、Runtime Schema 和测试 Fixture 完全一致',()=>{
  const runtime=app(),spec=fs.readFileSync(new URL('../planner-protocol/PLANNER_IMPORT_V2_SPEC.md',import.meta.url),'utf8');
  Object.keys(sheetNames).forEach(key=>{const name=sheetNames[key],match=spec.match(new RegExp(`<!-- PLANNER_V2_COLUMNS:${name}=([^\\n]+) -->`));assert.ok(match,`${name} 缺少 SPEC 列标记`);const specHeaders=match[1].trim().split('|');assert.deepEqual(specHeaders,headers[key]);assert.deepEqual(Array.from(runtime.PLANNER_V2_HEADERS[key]),headers[key]);});
});

test('PV2-22. Excel Manifest 锁定两份实际 Workbook 的 Sheet 与列',()=>{
  const path=new URL('../planner-protocol/templates/workbook-manifest-v2.json',import.meta.url);assert.ok(fs.existsSync(path),'缺少 Workbook manifest');
  const manifest=JSON.parse(fs.readFileSync(path,'utf8'));for(const file of manifest.files){const bytes=fs.readFileSync(new URL(`../planner-protocol/templates/${file.fileName}`,import.meta.url));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);for(const [key,name] of Object.entries(sheetNames))assert.deepEqual(file.headers[name],headers[key]);}
});

test('PV2-23. Planner Import v2.0 协议冻结与 Release Manifest 哈希一致',()=>{
  const runtime=app(),spec=fs.readFileSync(new URL('../planner-protocol/PLANNER_IMPORT_V2_SPEC.md',import.meta.url),'utf8'),manifest=fs.readFileSync(new URL('../planner-protocol/PLANNER_V2_RELEASE_MANIFEST.md',import.meta.url),'utf8');
  assert.equal(runtime.PLANNER_V2_PROTOCOL,'planner-import-v2');assert.equal(runtime.PLANNER_V2_PROTOCOL_VERSION,'2.0');assert.match(spec,/Status：`FROZEN`/);assert.match(spec,/Protocol Version：`2\.0`/);
  for(const file of ['PLANNER_IMPORT_V2_SPEC.md','AI_PLAN_GENERATOR_PROMPT.md','templates/训练计划导入母模板_v2.xlsx','templates/训练计划导入完整示例_v2.xlsx']){const bytes=fs.readFileSync(new URL(`../planner-protocol/${file}`,import.meta.url)),digest=crypto.createHash('sha256').update(bytes).digest('hex');assert.match(manifest,new RegExp(digest));}
});
