import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadImporter,loadTrainingModules,MemoryStorage} from './helpers.mjs';
import {plannerV2Workbook,headers,sheetNames} from './fixtures/planner-v2-fixture.mjs';
import {readXlsxWorkbook} from './xlsx-workbook-reader.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
function named(name,note='',tracking=''){
  const book=plannerV2Workbook(),row=book.Sheets[sheetNames.exercises][1];
  for(const [field,value]of Object.entries({name,note,trackingName:tracking}))row[headers.exercises.indexOf(field)]=value;
  return book;
}
function parse(book,app=loadImporter()){return app.parseWorkbookToImport(book,{name:'匿名.xlsx'});}
function first(book){return parse(book).plan[0].exercises[0];}
for(const [label,input,name,note]of [
  ['plain','杠铃卧推','杠铃卧推',''],
  ['Chinese round','杠铃卧推（控制下降3秒）','杠铃卧推','控制下降3秒'],
  ['English round','杠铃卧推(注意呼吸)','杠铃卧推','注意呼吸'],
  ['Chinese square','深蹲【RPE 8】','深蹲','RPE 8'],
  ['multiple','罗马尼亚硬拉\n（注意髋部后移）\n【保持背部稳定】','罗马尼亚硬拉','注意髋部后移；保持背部稳定'],
  ['nested','卧推（注意呼吸（不要憋气））','卧推','注意呼吸（不要憋气）']
])test(`PN ${label}: name and note remain separate`,()=>{
  const exercise=first(named(input));assert.equal(exercise.name,name);assert.equal(exercise.trackingName,name);assert.equal(exercise.note,note);
});
test('PN existing note is preserved and duplicate remarks are appended once',()=>{
  const exercise=first(named('卧推（注意呼吸）【保持稳定】（保持稳定）','原备注；注意呼吸'));
  assert.equal(exercise.note,'原备注；注意呼吸；保持稳定');
});
test('PN changed notes keep canonical name and all stable source/runtime IDs',()=>{
  const a=first(named('杠铃卧推（下降3秒）')),b=first(named('杠铃卧推（下降2秒）'));
  assert.equal(a.name,b.name);assert.equal(a.trackingName,b.trackingName);assert.equal(a.exerciseId,b.exerciseId);assert.equal(a.sourceExerciseKey,b.sourceExerciseKey);
  assert.deepEqual(Array.from(a.sets,s=>s.setId),Array.from(b.sets,s=>s.setId));assert.notEqual(a.note,b.note);
});
test('PN named exercise variations remain distinct',()=>{
  const values=['杠铃卧推','窄握杠铃卧推','暂停杠铃卧推'].map(name=>first(named(name+'（注意呼吸）')).trackingName);
  assert.equal(new Set(values).size,3);
});
test('PN an explicit independent trackingName is never rewritten',()=>{
  const exercise=first(named('杠铃卧推（注意呼吸）','','暂停杠铃卧推(历史身份)'));
  assert.equal(exercise.name,'杠铃卧推');assert.equal(exercise.trackingName,'暂停杠铃卧推(历史身份)');
});
test('PN explicit trackingName equal to annotated name is preserved and warned in preview',()=>{
  const app=loadImporter(),raw='杠铃卧推（下降3秒）',value=parse(named(raw,'',raw),app);
  assert.equal(value.plan[0].exercises[0].trackingName,raw);
  assert.equal(value.plan[0].exercises[0].name,'杠铃卧推');
  assert.ok(value.report.warnings.some(w=>/显式 trackingName/.test(w)));
  assert.match(app.importPrecheckText(value),/显式 trackingName/);
});
test('PN explicit plain trackingName is preserved without tracking warning',()=>{
  const value=parse(named('杠铃卧推（下降3秒）','','独立历史身份'));
  assert.equal(value.plan[0].exercises[0].trackingName,'独立历史身份');
  assert.ok(!value.report.warnings.some(w=>/显式 trackingName/.test(w)));
});
test('PN whitespace trackingName derives canonical name without mutating source',()=>{
  const book=named('杠铃卧推（下降2秒）','','  '),before=JSON.stringify(book);
  assert.equal(first(book).trackingName,'杠铃卧推');assert.equal(JSON.stringify(book),before);
});
test('PN trackingName column remains mandatory despite blank value compatibility',()=>{
  const book=clone(named('杠铃卧推')),rows=book.Sheets[sheetNames.exercises],index=headers.exercises.indexOf('trackingName');
  for(const row of rows)row.splice(index,1);
  assert.throws(()=>parse(book),e=>e.code==='PLANNER_V2_VALIDATION_FAILED');
});
test('PN same canonical name does not merge distinct Exercise records or IDs',()=>{
  const book=named('卧推（注意呼吸）'),row=book.Sheets[sheetNames.exercises][2];
  row[headers.exercises.indexOf('name')]='卧推（保持稳定）';row[headers.exercises.indexOf('trackingName')]='卧推（保持稳定）';
  const exercises=parse(book).plan[0].exercises;
  assert.equal(exercises.length,7);assert.equal(exercises[0].name,exercises[1].name);assert.notEqual(exercises[0].exerciseId,exercises[1].exerciseId);
  assert.notEqual(exercises[0].sets[0].setId,exercises[1].sets[0].setId);
});
for(const name of ['（注意呼吸）','【RPE 8】','卧推（注意呼吸','卧推【注意呼吸）'])test(`PN invalid name ${name} requires review without fallback`,()=>{
  assert.throws(()=>parse(named(name)),e=>e.code==='PLANNER_V2_VALIDATION_FAILED'&&e.report.errors.some(x=>/人工确认/.test(x)));
});
for(const annotation of ['3x5','3组','8次','60kg','-15%','30秒','RIR 2'])test(`PN structured parameter ${annotation} requires proper prescription fields`,()=>{
  const book=named(`卧推（${annotation}）`),before=JSON.stringify(book.Sheets[sheetNames.sets]);
  assert.throws(()=>parse(book),e=>e.code==='PLANNER_V2_VALIDATION_FAILED'&&e.report.errors.some(x=>/组计划_v2/.test(x)));
  assert.equal(JSON.stringify(book.Sheets[sheetNames.sets]),before);
});
test('PN only exercise name is interpreted; workbook source and other fields stay intact',()=>{
  const book=named('卧推（注意呼吸）'),before=JSON.stringify(book);
  book.Sheets[sheetNames.plan][1][headers.plan.indexOf('programName')]='匿名（说明）';
  book.Sheets[sheetNames.workouts][1][headers.workouts.indexOf('title')]='力量日【标题】';
  const source=JSON.stringify(book),value=parse(book);
  assert.equal(value.programName,'匿名（说明）');assert.equal(value.plan[0].title,'力量日【标题】');assert.equal(JSON.stringify(book),source);assert.ok(before);
});
test('PN canonical name can query historical weights without changing stored history',()=>{
  const app=loadTrainingModules(),storage=app.localStorage;app.initializeTrainingTracker([],[]);
  const program=app.getActiveProgram();program.workoutLogs=[{actualDate:'2026-01-01',entries:[{type:'主训练',trackingName:'杠铃卧推',name:'杠铃卧推',weight:'60',weightKg:60,reps:'5',rir:'3'}]}];
  const before=JSON.stringify(program.workoutLogs),exercise=first(named('杠铃卧推（下降3秒）'));
  const last=app.getLastExercisePerformance(exercise.trackingName);assert.equal(last.sets[0].weightKg,60);assert.equal(JSON.stringify(program.workoutLogs),before);
  assert.equal(storage.keys().includes('training-tracker-state'),false);
});
test('PN repeated import and note revisions preserve the existing Program, draft and logs',()=>{
  const storage=new MemoryStorage(),app=loadTrainingModules(storage);app.initializeTrainingTracker([],[]);
  const imported=app.programFromParsedImport(parse(named('杠铃卧推（下降3秒）'),app));app.addImportedProgram(imported,true);
  const original=app.getActiveProgram(),id=original.programId,wid=original.days[0].workoutId;
  original.workoutLogs=[{logId:'SAVED',actualDate:'2026-01-01',entries:[{trackingName:'杠铃卧推',weight:'60',weightKg:60}]}];
  original.currentWorkoutDrafts[wid]={workoutId:wid,mains:[{exerciseId:original.days[0].exercises[0].exerciseId,sets:[{setId:original.days[0].exercises[0].sets[0].setId,weight:'62.5'}]}]};
  app.saveRootCandidate(clone(app.trainingTrackerState));const before=JSON.stringify(app.getActiveProfile().programs[id]);
  const repeat=app.programFromParsedImport(parse(named('杠铃卧推（下降3秒）'),app));assert.equal(app.addImportedProgram(repeat,true).created,false);
  const revised=app.programFromParsedImport(parse(named('杠铃卧推（下降2秒）'),app));app.addImportedProgram(revised,false);
  assert.equal(app.trainingTrackerState.activeProgramId,id);assert.equal(JSON.stringify(app.getActiveProfile().programs[id]),before);
});
test('PN old Planner workbook remains compatible',()=>{
  const value=parse(plannerV2Workbook());assert.equal(value.report.errors.length,0);assert.equal(value.report.warnings.length,0);assert.equal(value.report.semanticStatus,'PASS');
});
const output=new URL('../outputs/planner-v2-standard-20261014/',import.meta.url);
test('PN delivered blank template has exact frozen sheets and headers, but no executable plan',()=>{
  const app=loadImporter(),book=readXlsxWorkbook(fileURLToPath(new URL('训练计划导入模板-V2.xlsx',output)));
  assert.deepEqual(book.SheetNames,['填写说明',...Object.values(sheetNames)]);
  for(const [key,name]of Object.entries(sheetNames))assert.deepEqual(book.Sheets[name][0],headers[key]);
  const report=app.validatePlannerV2Workbook(book,app.normalizeExcelRows,{allowEmpty:true});assert.equal(report.structureValid,true);assert.equal(report.errors.length,0);assert.equal(report.semanticValid,false);
  assert.throws(()=>parse(book),e=>e.code==='PLANNER_V2_VALIDATION_FAILED');
});
test('PN delivered example imports with all anonymous special structures and zero errors/warnings',()=>{
  const app=loadImporter(),book=readXlsxWorkbook(fileURLToPath(new URL('训练计划导入示例-V2.xlsx',output))),value=parse(book,app);
  assert.equal(value.format,'planner-v2');assert.equal(value.report.errors.length,0);assert.equal(value.report.warnings.length,0);assert.equal(value.report.semanticStatus,'PASS');
  assert.equal(value.plan.length,4);assert.ok(value.plan[0].exercises[0].note.includes('下降3秒'));
  const types=value.plan.flatMap(w=>w.exercises.flatMap(e=>e.sets.map(s=>s.setType)));
  for(const type of ['working','warmup','technique','top','backoff','dropset'])assert.ok(types.includes(type));
  assert.equal(value.report.stats.supersets,1);assert.equal(value.report.stats.dropSegments,3);assert.equal(value.report.stats.activitySegments,5);
  assert.ok(value.plan.flatMap(w=>w.exercises.flatMap(e=>e.sets)).every(s=>s.weight===''&&s.weightKg===0));
  assert.ok(fs.existsSync(new URL('训练计划导入说明.md',output)));
});
