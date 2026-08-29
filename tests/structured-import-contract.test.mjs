import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage,loadTrainingModules,samplePlan,sampleWarmups } from './helpers.mjs';

const dataHeaders=['schemaVersion','programName','workoutId','顺序','plannedDate','训练主题','section','exerciseId','动作顺序','动作名称','组数','次数下限','次数上限','RIR下限','RIR上限','建议重量','单位','休息下限秒','休息上限秒','动作秒数','动作备注','超级组ID','是否热身'];
const setHeaders=['workoutId','exerciseId','组号','setType','次数下限','次数上限','RIR下限','RIR上限','休息下限秒','休息上限秒','重量调整类型','重量调整值','技术提示'];

function baseData(){
  return [dataHeaders,
    ['1','外部AI计划','W001','1','2026-09-01','下肢A','功能模块','W001-E01','1','踝背屈','2','10','12','','','','kg','30','45','20','膝盖向前','','是'],
    ['1','外部AI计划','W001','1','2026-09-01','下肢A','主项','W001-E02','2','抬脚跟停顿前蹲','4','5','5','2','3','62.5','kg','150','210','','保持足弓','','否'],
    ['1','外部AI计划','W001','1','2026-09-01','下肢A','主辅助','W001-E03','3','腿举','3','8','10','2','3','','kg','90','120','','控制离心','','否']
  ];
}
function baseSets(){
  return [setHeaders,
    ['W001','W001-E02','1','technique','5','5','3','3','150','180','','','动作速度稳定'],
    ['W001','W001-E02','2','working','5','5','2','3','180','210','','',''],
    ['W001','W001-E02','3','backoff','5','5','2','3','150','180','percent','-15','动作质量优先'],
    ['W001','W001-E02','4','dropset','8','10','1','2','60','90','percent','-20','连续完成递减组']
  ];
}
function workbook(data=baseData(),sets=baseSets(),includeSets=true){
  const Sheets={'训练器数据_v1':data};
  const SheetNames=['训练器数据_v1'];
  if(includeSets){Sheets['组计划_v1']=sets;SheetNames.push('组计划_v1');}
  return {SheetNames,Sheets};
}
function boot(storage=new MemoryStorage()){
  const app=loadTrainingModules(storage);
  app.initializeTrainingTracker(samplePlan,sampleWarmups);
  return app;
}
function mutateData(mutator){
  const rows=baseData().map(row=>row.slice());
  mutator(rows,dataHeaders);
  return rows;
}
function mutateSets(mutator){
  const rows=baseSets().map(row=>row.slice());
  mutator(rows,setHeaders);
  return rows;
}

test('S1. 合法 Structured Import 正常生成新的 Program',()=>{
  const app=boot();
  const original=app.getActiveProgram();
  const parsed=app.parseWorkbookToImport(workbook(),{name:'外部计划.xlsx'});
  const program=app.createProgramFromPlan(parsed.plan,{name:parsed.programName,source:'structured-v1'});
  app.addProgram(program,true);
  assert.equal(app.getActiveProgram().name,'外部AI计划');
  assert.equal(app.getActiveProgram().days[0].workoutId,'W001');
  assert.ok(app.getActiveProfile().programs[original.programId]);
});

test('S2. 没有组计划的动作全部生成 working sets',()=>{
  const parsed=boot().parseWorkbookToImport(workbook(baseData(),null,false),{name:'普通计划.xlsx'});
  assert.ok(parsed.plan[0].exercises.every(exercise=>exercise.sets.every(set=>set.setType==='working')));
});

test('S3. technique 直接来自组计划_v1',()=>{
  const exercise=boot().parseWorkbookToImport(workbook(),{name:'计划.xlsx'}).plan[0].exercises.find(item=>item.exerciseId==='W001-E02');
  assert.equal(exercise.sets[0].setType,'technique');
  assert.equal(exercise.sets[0].techniqueCue,'动作速度稳定');
});

test('S4. working 直接来自组计划_v1',()=>{
  const exercise=boot().parseWorkbookToImport(workbook(),{name:'计划.xlsx'}).plan[0].exercises.find(item=>item.exerciseId==='W001-E02');
  assert.equal(exercise.sets[1].setType,'working');
});

test('S5. backoff -15 percent 正确覆盖主表默认处方',()=>{
  const set=boot().parseWorkbookToImport(workbook(),{name:'计划.xlsx'}).plan[0].exercises.find(item=>item.exerciseId==='W001-E02').sets[2];
  assert.equal(set.setType,'backoff');
  assert.equal(set.loadAdjustmentType,'percent');
  assert.equal(set.loadAdjustmentValue,-15);
});

test('S6. dropset 正确生成递减组',()=>{
  const set=boot().parseWorkbookToImport(workbook(),{name:'计划.xlsx'}).plan[0].exercises.find(item=>item.exerciseId==='W001-E02').sets[3];
  assert.equal(set.setType,'dropset');
  assert.equal(set.loadAdjustmentValue,-20);
});

test('S7. 时间型动作把动作秒数写入每一组',()=>{
  const exercise=boot().parseWorkbookToImport(workbook(),{name:'计划.xlsx'}).plan[0].exercises.find(item=>item.exerciseId==='W001-E01');
  assert.equal(exercise.duration,20);
  assert.deepEqual(exercise.sets.map(set=>set.duration),[20,20]);
});

test('S8. 【主项】不生成动作',()=>{
  const rows=mutateData((data,headers)=>{data[2][headers.indexOf('动作名称')]='【主项】';});
  assert.throws(()=>boot().parseWorkbookToImport(workbook(rows,null,false),{name:'错误.xlsx'}),/校验失败/);
});

test('S9. 【主辅助】不生成动作',()=>{
  const rows=mutateData((data,headers)=>{data[3][headers.indexOf('动作名称')]='【主辅助】';});
  assert.throws(()=>boot().parseWorkbookToImport(workbook(rows,null,false),{name:'错误.xlsx'}),/校验失败/);
});

test('S10. 非法 section 拒绝',()=>{
  const rows=mutateData((data,headers)=>{data[2][headers.indexOf('section')]='肩部动作';});
  const report=boot().validateStructuredWorkbook(workbook(rows,null,false));
  assert.ok(report.errors.some(error=>error.includes('section 不受支持')));
});

test('S11. 非法 setType 拒绝',()=>{
  const rows=mutateSets((sets,headers)=>{sets[1][headers.indexOf('setType')]='heavy';});
  const report=boot().validateStructuredWorkbook(workbook(baseData(),rows));
  assert.ok(report.errors.some(error=>error.includes('setType 只能是')));
});

test('S12. 重复 exerciseId 拒绝',()=>{
  const rows=mutateData((data,headers)=>{data[3][headers.indexOf('exerciseId')]='W001-E02';});
  const report=boot().validateStructuredWorkbook(workbook(rows,null,false));
  assert.ok(report.errors.some(error=>error.includes('exerciseId 必须在整个工作簿中唯一')));
});

test('S13. 组计划错误引用拒绝',()=>{
  const rows=mutateSets((sets,headers)=>{sets[1][headers.indexOf('exerciseId')]='W001-E99';});
  const report=boot().validateStructuredWorkbook(workbook(baseData(),rows));
  assert.ok(report.errors.some(error=>error.includes('找不到对应动作')));
});

test('S14. 组号超出动作组数拒绝',()=>{
  const rows=mutateSets((sets,headers)=>{sets[1][headers.indexOf('组号')]='5';});
  const report=boot().validateStructuredWorkbook(workbook(baseData(),rows));
  assert.ok(report.errors.some(error=>error.includes('组号超过动作组数')));
});

test('S15. Structured Import 失败后当前 Program 完全不变化',()=>{
  const app=boot();
  const before=JSON.stringify(app.trainingTrackerState);
  const rows=mutateData((data,headers)=>{data[2][headers.indexOf('RIR上限')]='20';});
  assert.throws(()=>app.parseWorkbookToImport(workbook(rows,null,false),{name:'错误.xlsx'}));
  assert.equal(JSON.stringify(app.trainingTrackerState),before);
});

test('S16. 没有 Structured Sheet 时 Legacy Import 继续正常',()=>{
  const rows=[['周次','日期','星期','阶段','训练主题','热身模板','训练内容（组×次数/余力）','组间休息/规则'],['1','2026-09-01','周一','阶段','下肢A','下肢热身','前蹲 3x5（余力3）','主项180秒']];
  const parsed=boot().parseWorkbookToImport({SheetNames:['逐日执行'],Sheets:{'逐日执行':rows}},{name:'徐晖旧版.xlsx'});
  assert.equal(parsed.plan.length,1);
  assert.match(parsed.plan[0]['训练内容（组×次数/余力）'],/前蹲/);
});

test('S17. 预览合法 Structured Import 不写入现有 v6 localStorage',()=>{
  const storage=new MemoryStorage();
  const app=boot(storage);
  const before=storage.getItem('training-tracker-state');
  app.parseWorkbookToImport(workbook(),{name:'只预览.xlsx'});
  assert.equal(storage.getItem('training-tracker-state'),before);
});

test('S18. 非法 workoutId 和非法布尔值明确拒绝',()=>{
  const rows=mutateData((data,headers)=>{data[1][headers.indexOf('workoutId')]='训练 1';data[1][headers.indexOf('是否热身')]='可能';});
  const report=boot().validateStructuredWorkbook(workbook(rows,null,false));
  assert.ok(report.errors.some(error=>error.includes('workoutId 不合法')));
  assert.ok(report.errors.some(error=>error.includes('是否热身只能是')));
});

test('S19. 同一动作重复组号拒绝',()=>{
  const rows=mutateSets((sets,headers)=>{sets[2][headers.indexOf('组号')]='1';});
  const report=boot().validateStructuredWorkbook(workbook(baseData(),rows));
  assert.ok(report.errors.some(error=>error.includes('同一动作组号重复')));
});

test('S20. 超级组ID只有一个动作时拒绝',()=>{
  const rows=mutateData((data,headers)=>{data[2][headers.indexOf('超级组ID')]='SS1';});
  const report=boot().validateStructuredWorkbook(workbook(rows,null,false));
  assert.ok(report.errors.some(error=>error.includes('至少需要两个动作')));
});
