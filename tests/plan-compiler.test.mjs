import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage,loadTrainingModules } from './helpers.mjs';

const oldHeaders=['schemaVersion','programName','workoutId','顺序','plannedDate','训练主题','section','exerciseId','动作顺序','动作名称','组数','次数下限','次数上限','RIR下限','RIR上限','建议重量','单位','休息下限秒','休息上限秒','动作秒数','动作备注','超级组ID','是否热身'];

function minimalHandoff(){
  return {
    programName:'接口测试周期',
    description:'只用于编译器测试',
    workouts:[
      {
        title:'训练日A',order:1,plannedDate:'2026-09-01',targetDurationMin:60,notes:'测试',
        exercises:[
          {name:'示例动作A',section:'功能模块',trainingRole:'skill-acquisition',order:1,sets:2,durationSec:20,restMinSec:30,restMaxSec:45},
          {name:'示例动作B',section:'主项',trainingRole:'pattern',order:2,sets:4,repsMin:5,repsMax:6,rirMin:2,rirMax:3,restMinSec:150,restMaxSec:180,recommendedWeight:20,unit:'kg',setPrescriptions:[
            {setNo:1,setType:'technique',repsMin:5,repsMax:5,rirMin:3,rirMax:3,restMinSec:120,restMaxSec:150,techniqueCue:'示例技术提示'},
            {setNo:4,setType:'backoff',repsMin:8,repsMax:10,rirMin:1,rirMax:2,restMinSec:90,restMaxSec:120,loadAdjustmentType:'percent',loadAdjustmentValue:-15,techniqueCue:'示例 backoff'}
          ]},
          {name:'示例动作C',section:'辅助',trainingRole:'isolation',order:3,sets:3,repsMin:10,repsMax:12,rirMin:2,rirMax:2,restMinSec:60,restMaxSec:90},
          {name:'示例动作D',section:'辅助',trainingRole:'isolation',order:4,sets:3,repsMin:10,repsMax:12,rirMin:2,rirMax:2,restMinSec:60,restMaxSec:90}
        ],
        supersets:[{groupName:'示例超级组',members:[3,4],mode:'alternating',transitionMinSec:0,transitionMaxSec:15,roundRestMinSec:75,roundRestMaxSec:90,note:'示例规则'}]
      },
      {
        title:'训练日B',order:2,targetDurationMin:45,
        exercises:[{name:'示例动作B',section:'主辅助',trainingRole:'hypertrophy',order:1,sets:3,repsMin:8,repsMax:10,rirMin:1,rirMax:2,restMinSec:90,restMaxSec:120}]
      }
    ]
  };
}

function compile(input=minimalHandoff(),storage=new MemoryStorage()){
  const app=loadTrainingModules(storage);
  return {app,result:app.compileTrainingPlan(input),storage};
}

test('C1. 最小 handoff 输入可以成功 compile',()=>{
  const {result}=compile();
  assert.equal(result.format,'training-plan-handoff-v1');
  assert.equal(result.program.workouts.length,2);
});

test('C2. 自动生成唯一 workoutId',()=>{
  const ids=compile().result.program.workouts.map(workout=>workout.workoutId);
  assert.deepEqual(Array.from(ids),['W001','W002']);
  assert.equal(new Set(ids).size,ids.length);
});

test('C3. 自动生成唯一 exerciseId',()=>{
  const ids=compile().result.program.workouts.flatMap(workout=>workout.exercises.map(exercise=>exercise.exerciseId));
  assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual(Array.from(ids.slice(0,4)),['W001-E01','W001-E02','W001-E03','W001-E04']);
});

test('C4. 自动生成 supersetId',()=>{
  const rule=compile().result.program.workouts[0].supersets[0];
  assert.equal(rule.supersetId,'SS01');
  assert.deepEqual(Array.from(rule.memberExerciseIds),['W001-E03','W001-E04']);
});

test('C5. Set Prescription 正确映射到组计划_v1',()=>{
  const rows=compile().result.workbookData.Sheets['组计划_v1'];
  assert.equal(rows.length,3);
  assert.deepEqual(Array.from(rows[1].slice(0,4)),['W001','W001-E02',1,'technique']);
  assert.equal(rows[2][3],'backoff');
  assert.equal(rows[2][10],'percent');
  assert.equal(rows[2][11],-15);
});

test('C6. alternating superset 正确映射到超级组规则_v1',()=>{
  const rows=compile().result.workbookData.Sheets['超级组规则_v1'];
  assert.equal(rows.length,2);
  assert.deepEqual(Array.from(rows[1].slice(0,8)),['W001','SS01','示例超级组','alternating',0,15,75,90]);
});

test('C7. trainingRole 正确写入并重新导入',()=>{
  const {app,result}=compile();
  const parsed=app.parseWorkbookToImport(result.workbookData,{name:'编译.xlsx'});
  assert.deepEqual(Array.from(parsed.plan[0].exercises,e=>e.trainingRole),['skill-acquisition','pattern','isolation','isolation']);
});

test('C8. targetDurationMin 正确写入并重新导入',()=>{
  const {app,result}=compile();
  const parsed=app.parseWorkbookToImport(result.workbookData,{name:'编译.xlsx'});
  assert.equal(parsed.plan[0].targetDurationMin,60);
  assert.equal(parsed.plan[1].targetDurationMin,45);
});

test('C9. 时间型动作正确',()=>{
  const {app,result}=compile();
  const parsed=app.parseWorkbookToImport(result.workbookData,{name:'编译.xlsx'});
  const exercise=parsed.plan[0].exercises[0];
  assert.equal(exercise.duration,20);
  assert.deepEqual(Array.from(exercise.sets,set=>set.duration),[20,20]);
});

test('C10. 生成的 workbook 可以被 Structured Import 重新导入',()=>{
  const {app,result}=compile();
  const parsed=app.parseWorkbookToImport(result.workbookData,{name:'编译.xlsx'});
  assert.equal(parsed.format,'structured-v1');
  assert.equal(parsed.plan.length,2);
  assert.equal(parsed.plan[0].supersetRules[0].mode,'alternating');
});

test('C11. compiler 生成结果 validator 为 0 errors',()=>{
  const result=compile().result;
  assert.ok(result.structuredValidation);
  assert.deepEqual(Array.from(result.structuredValidation.errors),[]);
  assert.equal(result.structuredValidation.stats.supersetRules,1);
});

test('C12. 旧 IMPORT_FORMAT_V1 文件仍兼容',()=>{
  const app=loadTrainingModules();
  const rows=[oldHeaders,[1,'旧Structured','W001',1,'2026-09-01','旧训练日','主项','W001-E01',1,'旧动作',3,5,5,2,3,20,'kg',90,120,'','旧备注','','FALSE']];
  const workbook={SheetNames:['训练器数据_v1'],Sheets:{'训练器数据_v1':rows}};
  const parsed=app.parseWorkbookToImport(workbook,{name:'旧Structured.xlsx'});
  assert.equal(parsed.format,'structured-v1');
  assert.equal(parsed.plan[0].exercises[0].trainingRole,'');
  assert.equal(parsed.plan[0].targetDurationMin,null);
});

test('C13. 训练规划 AI 不提供 ID 也能从 JSON 文本生成',()=>{
  const input=minimalHandoff();
  assert.equal('workoutId' in input.workouts[0],false);
  assert.equal('exerciseId' in input.workouts[0].exercises[0],false);
  const result=compile(JSON.stringify(input)).result;
  assert.equal(result.program.workouts[0].workoutId,'W001');
});

test('C14. 同一 Workout 重复动作名称不影响 ID 唯一性',()=>{
  const input=minimalHandoff();
  input.workouts[0].exercises[3].name=input.workouts[0].exercises[2].name;
  input.workouts[0].supersets[0].members=[3,4];
  const exercises=compile(input).result.program.workouts[0].exercises;
  assert.equal(exercises[2].name,exercises[3].name);
  assert.notEqual(exercises[2].exerciseId,exercises[3].exerciseId);
});

test('C15. 同名动作位于不同 Workout 可以正常存在',()=>{
  const result=compile().result;
  const first=result.program.workouts[0].exercises.find(exercise=>exercise.name==='示例动作B');
  const second=result.program.workouts[1].exercises.find(exercise=>exercise.name==='示例动作B');
  assert.equal(first.exerciseId,'W001-E02');
  assert.equal(second.exerciseId,'W002-E01');
});

test('C16. 生成 Excel workbook data 不修改 localStorage',()=>{
  const storage=new MemoryStorage({'training-tracker-state':'sentinel'});
  compile(minimalHandoff(),storage);
  assert.equal(storage.getItem('training-tracker-state'),'sentinel');
});

test('C17. 加载编译器后 Legacy Import 继续正常',()=>{
  const app=loadTrainingModules();
  const rows=[['周次','日期','星期','训练主题','训练内容（组×次数/余力）'],['1','2026-09-01','周一','Legacy训练日','示例动作 3x5（余力3）']];
  const parsed=app.parseWorkbookToImport({SheetNames:['逐日执行'],Sheets:{'逐日执行':rows}},{name:'旧版.xlsx'});
  assert.equal(parsed.source,'file');
  assert.equal(parsed.plan.length,1);
});
