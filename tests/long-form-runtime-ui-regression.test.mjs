import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {MemoryStorage,createContext,loadScript,loadTrainingModules} from './helpers.mjs';
import {longFormRows} from './fixtures/long-form-daily-fixture.mjs';
import {readXlsxWorkbook} from './xlsx-workbook-reader.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function rootForProgram(program,profileExtras={}){
  return {
    schemaVersion:6,
    activeProfileId:'profile_test',
    activeProgramId:program.programId,
    profiles:{
      profile_test:{
        profileId:'profile_test',
        programs:{[program.programId]:program},
        exerciseTemplates:profileExtras.exerciseTemplates||[],
        warmupTemplates:profileExtras.warmupTemplates||[],
        warmupActionTemplates:profileExtras.warmupActionTemplates||[],
        rmRecords:profileExtras.rmRecords||[]
      }
    },
    ui:{}
  };
}

function loadAppRuntime(program,profileExtras={},rootOverride=null){
  const storage=new MemoryStorage({'training-tracker-state':JSON.stringify(rootOverride||rootForProgram(program,profileExtras))});
  const context=createContext(storage);
  context.setTimeout=()=>0;
  context.clearTimeout=()=>{};
  context.setInterval=()=>0;
  context.clearInterval=()=>{};
  context.addEventListener=()=>{};
  context.scrollTo=()=>{};
  context.getComputedStyle=()=>({overflowY:'visible'});
  context.navigator={};
  context.document={
    readyState:'loading',
    addEventListener(){},
    getElementById(){return null;},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    createElement(){return {click(){},style:{},classList:{add(){},remove(){},toggle(){}}};},
    body:{appendChild(){},removeChild(){}},
    documentElement:{}
  };
  [
    'prescription.js','date-integrity.js','execution-reconciler.js','storage.js','templates.js',
    'parser.js','workout-view.js','history.js','section-parser.js','long-form-daily-adapter.js',
    'planner-import-v2.js','import-validator.js','plan-compiler.js','importer.js','program-store.js'
  ].forEach(file=>loadScript(context,file));
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(
    "rebuild();showTab('today');initWarmupPanel();initFloatingNoteDrag();bindGeneralTimerControls();",
    ''
  );
  vm.runInContext(source,context,{filename:'app.js'});
  return {context,storage};
}

function syntheticProgram(){
  const modules=loadTrainingModules();
  const parsed=modules.parseLongFormDailyGrid(longFormRows,{fileName:'匿名真实形状.xlsx',sheetName:'手机查看版_一日一格'});
  const program=modules.createProgramFromPlan(parsed.plan,{name:'匿名 Long-form',source:'long-form-daily-v1'});
  program.sharedSourceBlocks=JSON.parse(JSON.stringify(parsed.sharedSourceBlocks||{}));
  program.importSemanticStats=JSON.parse(JSON.stringify(parsed.semanticStats||{}));
  program.importFormat='long-form-daily-v1';
  return program;
}

function renderWorkout(runtime,workout){
  const exercises=runtime.parseExercises(workout['训练内容（组×次数/余力）']||'',workout);
  const cards=[];
  exercises.forEach((exercise,index)=>{
    const html=runtime.mainCardHTML(exercise,index,workout,false);
    cards.push({name:exercise.name,exerciseId:exercise.exerciseId,html});
  });
  return {exercises,cards,html:cards.map(card=>card.html).join('')};
}

test('UI-LF1. Long-form D1 renders all canonical main Exercise cards',()=>{
  const program=syntheticProgram(),runtime=loadAppRuntime(program).context,workout=program.days[0];
  const rendered=renderWorkout(runtime,workout);
  assert.ok(workout.exercises.length>0);
  assert.equal(rendered.cards.length,workout.exercises.length);
  assert.ok(rendered.cards.some(card=>card.name==='示例推举'));
  assert.ok(rendered.cards.some(card=>card.name==='示例稳定动作'));
  assert.match(rendered.html,/class="exercise mainCard/);
});

test('UI-LF2. only a real rest Workout may render zero main cards',()=>{
  const program=syntheticProgram(),runtime=loadAppRuntime(program).context,workout=program.days[2];
  const rendered=renderWorkout(runtime,workout);
  assert.equal(workout.workoutType,'rest');
  assert.equal(workout.exercises.length,0);
  assert.equal(rendered.cards.length,0);
});

test('UI-LF3. climbing Activity remains independent from main Exercise rendering',()=>{
  const program=syntheticProgram(),runtime=loadAppRuntime(program).context,workout=program.days[3];
  const rendered=renderWorkout(runtime,workout);
  assert.ok(workout.activities.some(activity=>activity.activityType==='climbing'));
  assert.equal(rendered.cards.length,workout.exercises.length);
});

test('UI-LF4. D5 keeps main cards, Superset and multi-stage drop rendering',()=>{
  const program=syntheticProgram(),runtime=loadAppRuntime(program).context,workout=program.days[4];
  const rendered=renderWorkout(runtime,workout);
  assert.ok(rendered.cards.length>0);
  assert.ok(workout.supersetRules.length>0);
  assert.ok(workout.exercises.some(exercise=>exercise.sets.some(set=>Array.isArray(set.segments)&&set.segments.length)));
  assert.match(rendered.html,/含多阶段递减组/);
});

test('UI-LF5. D6 Zone2 Activity does not suppress formal Exercise cards',()=>{
  const program=syntheticProgram(),runtime=loadAppRuntime(program).context,workout=program.days[5];
  const rendered=renderWorkout(runtime,workout);
  assert.ok(workout.activities.some(activity=>activity.activityType==='cardio'));
  assert.ok(workout.exercises.length>0);
  assert.equal(rendered.cards.length,workout.exercises.length);
});

test('UI-LF6. unavailable history helper cannot suppress Long-form main cards',()=>{
  const program=syntheticProgram(),runtime=loadAppRuntime(program).context,workout=program.days[0];
  runtime.lastReferenceHTML=undefined;
  const rendered=runtime.renderMainExerciseCards(workout,runtime.parseExercises(workout['训练内容（组×次数/余力）']||'',workout));
  assert.equal(rendered.renderedCount,workout.exercises.length);
  assert.match(rendered.html,/历史参考暂不可用/);
});

test('UI-LF7. one broken card does not discard the other canonical Exercise cards',()=>{
  const program=syntheticProgram(),runtime=loadAppRuntime(program).context,workout=program.days[0],errors=[];
  runtime.console={...console,error(...args){errors.push(args);}};
  const original=runtime.mainCardHTML;
  runtime.mainCardHTML=function(exercise,index,...args){if(index===0)throw new Error('forced single-card failure');return original(exercise,index,...args);};
  const rendered=runtime.renderMainExerciseCards(workout,runtime.parseExercises(workout['训练内容（组×次数/余力）']||'',workout));
  assert.equal(rendered.renderedCount,workout.exercises.length-1);
  assert.match(rendered.html,/部分动作显示失败/);
  assert.ok(errors.some(args=>String(args[0]).includes('exercise card failed')));
});

test('UI-LF8. zero rendered cards emits MAIN_EXERCISE_RENDER_FAILED without mutating Program',()=>{
  const program=syntheticProgram(),runtime=loadAppRuntime(program).context,workout=program.days[0],errors=[];
  const before=JSON.stringify(program);
  runtime.console={...console,error(...args){errors.push(args);}};
  runtime.mainCardHTML=function(){throw new Error('forced all-card failure');};
  const rendered=runtime.renderMainExerciseCards(workout,runtime.parseExercises(workout['训练内容（组×次数/余力）']||'',workout));
  assert.equal(rendered.renderedCount,0);
  assert.match(rendered.html,/MAIN_EXERCISE_RENDER_FAILED/);
  assert.ok(errors.some(args=>args[0]==='MAIN_EXERCISE_RENDER_FAILED'&&args[1].workoutId===workout.workoutId&&args[1].exerciseCount===workout.exercises.length));
  assert.equal(JSON.stringify(program),before);
});

const realWorkbookFile=process.env.REAL_LONGFORM_XLSX;
const realRootFile=process.env.REAL_TRAINING_ROOT;
test('UI-LF-REAL. real 96-day shape renders with legacy history and templates',{skip:!realWorkbookFile||!realRootFile},()=>{
  const modules=loadTrainingModules();
  const workbook=readXlsxWorkbook(realWorkbookFile);
  const parsed=modules.parseWorkbookToImport(workbook,{name:path.basename(realWorkbookFile)});
  const program=modules.createProgramFromPlan(parsed.plan,{name:path.basename(realWorkbookFile),source:'long-form-daily-v1',sourceFileName:path.basename(realWorkbookFile)});
  program.sharedSourceBlocks=JSON.parse(JSON.stringify(parsed.sharedSourceBlocks||{}));
  program.importSemanticStats=JSON.parse(JSON.stringify(parsed.semanticStats||{}));
  program.importFormat='long-form-daily-v1';
  const existingRoot=JSON.parse(fs.readFileSync(realRootFile,'utf8'));
  const profile=existingRoot.profiles[existingRoot.activeProfileId];
  profile.programs[program.programId]=program;
  existingRoot.activeProgramId=program.programId;
  const beforeProgram=JSON.stringify(program);
  const beforeFingerprint=modules.programContentFingerprint(program).hash;
  const beforeActualDates=JSON.stringify(program.actualDates||{});
  const allLogs=Object.values(profile.programs).flatMap(item=>item.workoutLogs||item.logs||[]);
  const weightedEntries=allLogs.reduce((count,log)=>count+(log.entries||[]).filter(entry=>entry.weight||Number(entry.weightKg)>0).length,0);
  assert.equal(allLogs.length,63);
  assert.equal(weightedEntries,1258);
  const runtime=loadAppRuntime(program,{},existingRoot).context;
  const totals={
    exercises:program.days.reduce((count,day)=>count+day.exercises.length,0),
    sets:program.days.reduce((count,day)=>count+day.exercises.reduce((sum,exercise)=>sum+exercise.sets.length,0),0)
  };
  assert.deepEqual(totals,{exercises:588,sets:1395});
  const d1=renderWorkout(runtime,program.days[0]);
  assert.equal(d1.cards.length,9);
  for(const name of ['杠铃卧推（高张力）','前蹲','单侧绳索侧平举（张力日）','高质量俯卧撑'])assert.ok(d1.cards.some(card=>card.name===name));
  const d3=renderWorkout(runtime,program.days[2]);
  assert.equal(program.days[2].workoutType,'rest');
  assert.equal(d3.cards.length,0);
  const d4=renderWorkout(runtime,program.days[3]);
  assert.ok(program.days[3].activities.some(activity=>activity.activityType==='climbing'));
  assert.equal(d4.cards.length,program.days[3].exercises.length);
  const d5=renderWorkout(runtime,program.days[4]);
  assert.equal(d5.cards.length,program.days[4].exercises.length);
  assert.ok(program.days[4].supersetRules.length>0);
  assert.ok(program.days[4].exercises.some(exercise=>exercise.sets.some(set=>Array.isArray(set.segments)&&set.segments.length)));
  const d6=renderWorkout(runtime,program.days[5]);
  assert.equal(d6.cards.length,program.days[5].exercises.length);
  assert.ok(program.days[5].activities.some(activity=>activity.activityType==='cardio'));
  program.days.forEach((workout,index)=>{
    const rendered=renderWorkout(runtime,workout);
    if(workout.workoutType==='rest')assert.equal(rendered.cards.length,0,`D${index+1} rest should not render main cards`);
    else if(workout.exercises.length)assert.equal(rendered.cards.length,workout.exercises.length,`D${index+1} lost main cards`);
  });
  assert.equal(JSON.stringify(program),beforeProgram);
  assert.equal(modules.programContentFingerprint(program).hash,beforeFingerprint);
  assert.equal(JSON.stringify(program.actualDates||{}),beforeActualDates);
  console.log('REAL_LONGFORM_UI',JSON.stringify({totals,fingerprint:beforeFingerprint,d1Cards:d1.cards.length,d5Cards:d5.cards.length,d6Cards:d6.cards.length,logs:allLogs.length,weightedEntries,allDaysRendered:true}));
});

export {loadAppRuntime,renderWorkout,rootForProgram};
