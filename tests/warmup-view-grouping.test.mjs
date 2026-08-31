import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadTrainingModules} from './helpers.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function mainWarmup(segments){
  return {activityId:'day-1:activity:01',activityType:'warmup',warmupType:'ramp',title:'主项热身',durationMinSec:480,durationMaxSec:600,segments};
}
function workout(activities){
  return {workoutId:'day-1',workoutType:'strength',activities,exercises:[
    {exerciseId:'exercise-bench',name:'卧推',trainingRole:'main',sets:[{setId:'set-bench-1'}]},
    {exerciseId:'exercise-squat',name:'前蹲',trainingRole:'main',sets:[{setId:'set-squat-1'},{setId:'set-squat-2'}]},
    {exerciseId:'exercise-skill',name:'基本功',trainingRole:'skill-retention',sets:[{setId:'set-skill-1'}]}
  ]};
}
function entitySnapshot(day){
  return {
    exercises:day.exercises.length,
    sets:day.exercises.reduce((sum,exercise)=>sum+(exercise.sets||[]).length,0),
    exerciseIds:day.exercises.map(exercise=>exercise.exerciseId),
    setIds:day.exercises.flatMap(exercise=>(exercise.sets||[]).map(set=>set.setId))
  };
}

test('W1. 同一主项四个 warmup item 收为一个 display group',()=>{
  const app=loadTrainingModules(),day=workout([mainWarmup([
    {segmentNo:1,label:'卧推',instruction:'空杆×15'},
    {segmentNo:2,label:'',instruction:'工作重量50%×8'},
    {segmentNo:3,label:'',instruction:'工作重量65%×5'},
    {segmentNo:4,label:'',instruction:'工作重量75%×3'}
  ])]);
  const groups=app.groupWarmupItemsForDisplay(day);
  assert.equal(groups.length,1);assert.equal(groups[0].title,'卧推｜主项热身');assert.equal(groups[0].items.length,4);
});

test('W2. 卧推与前蹲形成两个独立父模块',()=>{
  const app=loadTrainingModules(),day=workout([mainWarmup([
    {segmentNo:1,label:'卧推',instruction:'空杆×15'},
    {segmentNo:2,label:'',instruction:'递增×5'},
    {segmentNo:3,label:'前蹲',instruction:'空杆×8'},
    {segmentNo:4,label:'',instruction:'递增×3'}
  ])]);
  const groups=app.groupWarmupItemsForDisplay(day);
  assert.deepEqual(Array.from(groups,group=>group.title),['卧推｜主项热身','前蹲｜主项热身']);
  assert.deepEqual(Array.from(groups,group=>group.items.length),[2,2]);
});

test('W3. 通用准备保持独立，不并入主项',()=>{
  const app=loadTrainingModules(),day=workout([
    {activityId:'general',activityType:'warmup',title:'功能准备',segments:[{segmentNo:1,label:'',instruction:'猫牛与胸椎活动'}]},
    mainWarmup([{segmentNo:1,label:'卧推',instruction:'空杆×15'}])
  ]);
  const groups=app.groupWarmupItemsForDisplay(day);
  assert.deepEqual(Array.from(groups,group=>group.title),['通用准备','卧推｜主项热身']);
});

test('W4. skill-retention Exercise 不进入 warmup display group',()=>{
  const app=loadTrainingModules(),day=workout([mainWarmup([{segmentNo:1,label:'卧推',instruction:'空杆×15'}])]);
  const groups=app.groupWarmupItemsForDisplay(day);
  assert.equal(groups.flatMap(group=>group.items).some(item=>/基本功/.test(item.instruction)),false);
  assert.equal(day.exercises.find(exercise=>exercise.trainingRole==='skill-retention').exerciseId,'exercise-skill');
});

test('W5. 显示分组保留来源 ID，并为无实体段生成稳定且唯一的显示 ID',()=>{
  const app=loadTrainingModules(),day=workout([mainWarmup([
    {segmentNo:1,label:'卧推',instruction:'空杆×15',exerciseId:'source-exercise',setId:'source-set'},
    {segmentNo:2,label:'',instruction:'递增×5'}
  ])]);
  const first=app.groupWarmupItemsForDisplay(day),second=app.groupWarmupItemsForDisplay(day),items=first[0].items;
  assert.equal(items[0].viewExerciseId,'source-exercise');assert.equal(items[0].viewSetId,'source-set');
  assert.equal(items[1].viewExerciseId,second[0].items[1].viewExerciseId);
  assert.equal(items[1].viewSetId,second[0].items[1].viewSetId);
  assert.equal(new Set(items.map(item=>item.viewExerciseId)).size,items.length);
});

test('W6. 分组是纯 View 派生，Exercise/Set 数量、ID 与原数据完全不变',()=>{
  const app=loadTrainingModules(),day=workout([mainWarmup([
    {segmentNo:1,label:'卧推',instruction:'空杆×15'},
    {segmentNo:2,label:'前蹲',instruction:'空杆×8'}
  ])]),before=entitySnapshot(day),raw=JSON.stringify(day),fingerprint=app.programContentFingerprint({days:[day]}).hash;
  app.groupWarmupItemsForDisplay(day);
  assert.equal(JSON.stringify(day),raw);assert.deepEqual(entitySnapshot(day),before);
  assert.equal(app.programContentFingerprint({days:[day]}).hash,fingerprint);
});

test('W7. 紧凑子阶段用稳定 card/set ID 写回对应草稿实体',()=>{
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.match(source,/data-card-id="\$\{escapeHtml\(viewExerciseId\)\}"/);
  assert.match(source,/warmupSetHTML\([^\n]+stage\.viewSetId/);
  assert.match(source,/saved\.exerciseId&&cards\.find/);
  assert.match(source,/updateSetValue\(card\?\(card\.getAttribute\('data-card-id'\)/);
});

test('W8. 攀岩热身收为一个父模块，390px 样式允许内容收缩且不横向撑开',()=>{
  const app=loadTrainingModules(),groups=app.groupWarmupItemsForDisplay({workoutType:'攀岩',activities:[{
    activityId:'climb-warmup',activityType:'warmup',title:'攀岩热身',segments:[
      {segmentNo:1,label:'',instruction:'手指与肩胛准备'},
      {segmentNo:2,label:'',instruction:'简单线进入'}
    ]
  }]});
  assert.equal(groups.length,1);assert.equal(groups[0].title,'攀岩热身');assert.equal(groups[0].items.length,2);
  const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
  assert.match(css,/\.warmupDisplayGroup\{[^}]*min-width:0/);
  assert.match(css,/@media\(max-width:430px\)[\s\S]*\.warmupStageHead/);
});
