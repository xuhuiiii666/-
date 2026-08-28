import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage,loadTrainingModules,samplePlan,sampleWarmups } from './helpers.mjs';

const dataHeaders=['schemaVersion','programName','workoutId','顺序','plannedDate','训练主题','section','exerciseId','动作顺序','动作名称','组数','次数下限','次数上限','RIR下限','RIR上限','建议重量','单位','休息下限秒','休息上限秒','动作秒数','动作备注','超级组ID','是否热身'];
const setHeaders=['workoutId','exerciseId','组号','setType','次数下限','次数上限','RIR下限','RIR上限','休息下限秒','休息上限秒','重量调整类型','重量调整值','技术提示'];
const dataRows=[dataHeaders,
  ['1','十二周计划','w1','1','2026-09-01','下肢A','功能模块','warm1','1','踝背屈','2','10','12','','','','kg','30','45','','膝盖向前','','是'],
  ['1','十二周计划','w1','1','2026-09-01','下肢A','主项','ex1','2','抬脚跟停顿前蹲','4','5','5','2','3','62.5','kg','150','210','','保持足弓','','否'],
  ['1','十二周计划','w1','1','2026-09-01','下肢A','主辅助','ex2','3','腿举','3','8','10','2','3','','kg','90','120','','控制离心','','否']
];
const specialRows=[setHeaders,
  ['w1','ex1','1','technique','5','5','3','3','150','180','','','动作速度稳定'],
  ['w1','ex1','2','working','5','5','2','3','180','210','','',''],
  ['w1','ex1','3','backoff','5','5','2','3','150','180','percent','-15','动作质量优先']
];
function workbook(includeSets=true,rows=dataRows){
  const Sheets={'训练器数据_v1':rows};
  const SheetNames=['训练器数据_v1'];
  if(includeSets){Sheets['组计划_v1']=specialRows;SheetNames.push('组计划_v1');}
  return {SheetNames,Sheets};
}
function boot(storage=new MemoryStorage()){
  const app=loadTrainingModules(storage);app.initializeTrainingTracker(samplePlan,sampleWarmups);return app;
}

test('11. 旧计划在 Schema 6 中仍可打开且补为 working',()=>{
  const app=boot();
  const exercise=app.normalizeExerciseEntity({name:'卧推',sets:[{weight:'80',weightKg:80,reps:'5',rir:'2'}]},0);
  assert.equal(exercise.sets[0].setType,'working');
  assert.equal(exercise.sets[0].weightKg,80);
});

test('12. Structured Import v1 正确生成 Program 数据',()=>{
  const app=boot();
  const parsed=app.parseWorkbookToImport(workbook(),{name:'结构化计划.xlsx'});
  assert.equal(parsed.format,'structured-v1');
  assert.equal(parsed.plan.length,1);
  assert.equal(parsed.plan[0].workoutId,'w1');
  assert.equal(parsed.report.errors.length,0);
});

test('13. 【主项】和【主辅助】标记绝不生成动作卡',()=>{
  const app=boot();
  const badRows=[dataHeaders,[...dataRows[2].slice(0,9),'【主项】',...dataRows[2].slice(10)]];
  const report=app.validateStructuredWorkbook(workbook(false,badRows));
  assert.ok(report.errors.some(message=>message.includes('section 标记')));
  const parsed=app.parseWorkbookToImport(workbook(),{name:'结构化计划.xlsx'});
  assert.equal(parsed.plan[0].exercises.some(ex=>/^【/.test(ex.name)),false);
});

test('14. 组计划生成 technique working backoff',()=>{
  const app=boot();
  const exercise=app.parseWorkbookToImport(workbook(),{name:'结构化计划.xlsx'}).plan[0].exercises.find(ex=>ex.exerciseId==='ex1');
  assert.deepEqual(exercise.sets.slice(0,3).map(set=>set.setType),['technique','working','backoff']);
});

test('15. backoff -15 在组处方 UI 中清晰显示',()=>{
  const app=boot();
  const html=app.setPrescriptionSummaryHTML({setNo:3,setType:'backoff',targetRepsMin:5,targetRepsMax:5,targetRirMin:2,targetRirMax:3,targetRestMin:150,targetRestMax:180,loadAdjustmentType:'percent',loadAdjustmentValue:-15});
  assert.match(html,/回退组/);assert.match(html,/↓15%/);
});

test('16. 没有组计划工作表时自动生成普通工作组',()=>{
  const app=boot();
  const parsed=app.parseWorkbookToImport(workbook(false),{name:'普通结构化.xlsx'});
  const exercise=parsed.plan[0].exercises.find(ex=>ex.exerciseId==='ex1');
  assert.ok(exercise.sets.every(set=>set.setType==='working'));
  assert.equal(parsed.report.warnings.length,1);
});

test('17. Structured 严重错误阻止导入且当前 Program 不变',()=>{
  const app=boot();const before=JSON.stringify(app.trainingTrackerState);
  const broken=dataRows.map(row=>row.slice());broken[2][broken[0].indexOf('RIR上限')]='20';
  assert.throws(()=>app.parseWorkbookToImport(workbook(false,broken),{name:'错误.xlsx'}),error=>error.name==='ImportError'&&error.code==='STRUCTURED_VALIDATION_FAILED');
  assert.equal(JSON.stringify(app.trainingTrackerState),before);
});

test('18. 发现 structured sheet 后失败不会 fallback 到旧解析或默认计划',()=>{
  const app=boot();const current=app.getActiveProgram().programId;
  assert.throws(()=>app.parseWorkbookToImport({SheetNames:['训练器数据_v1','手机查看版'],Sheets:{'训练器数据_v1':[['错误']],手机查看版:[['顺序日','今日内容']]}},{name:'混合.xlsx'}));
  assert.equal(app.getActiveProgram().programId,current);
});

test('19. Schema v5 升级保留 workoutLogs 中的重量',()=>{
  const state={schemaVersion:5,activeProfileId:'p',activeProgramId:'program1',profiles:{p:{profileId:'p',programs:{program1:{programId:'program1',name:'旧计划',days:samplePlan,workoutLogs:[{actualDate:'2026-05-20',entries:[{type:'主训练',name:'前蹲',weight:'60',weightKg:60,reps:'5',rir:'3'}]}]}}}}};
  const storage=new MemoryStorage({'training-tracker-state':JSON.stringify(state)});const app=boot(storage);
  assert.equal(app.getActiveProgram().workoutLogs[0].entries[0].weightKg,60);
  assert.equal(app.trainingTrackerState.schemaVersion,6);
});

test('20. exerciseHistory 保留多次历史且上次同名取最新重量',()=>{
  const app=boot();
  const logs=[
    {actualDate:'2026-05-20',title:'腿日1',entries:[{type:'主训练',name:'前蹲',trackingName:'前蹲',set:1,weight:'60',weightKg:60,reps:'5',rir:'3'}]},
    {actualDate:'2026-05-27',title:'腿日2',entries:[{type:'主训练',name:'前蹲',trackingName:'前蹲',set:1,weight:'65',weightKg:65,reps:'5',rir:'2'}]}
  ];
  app.state.workoutLogs=logs;app.state.exerciseHistory=app.buildExerciseHistoryFromLogs(logs);
  assert.equal(app.getExerciseHistoryRecords('前蹲').length,2);
  assert.equal(app.getLastExercisePerformance('前蹲').sets[0].weightKg,65);
  assert.equal(app.getExerciseHistoryRecords('前蹲')[1].sets[0].weightKg,60);
});

test('21. 修改单组处方是局部纯更新，不触发 rebuild',()=>{
  const app=boot();let rebuilds=0;app.rebuild=()=>{rebuilds++;};
  const exercise=app.normalizeExerciseWithPrescription({name:'前蹲',sets:[{setId:'s1',weight:'60'}]});
  const changed=app.updateSetPrescription(exercise,'s1',{setType:'top',techniqueCue:'稳定'});
  assert.equal(changed.setType,'top');assert.equal(rebuilds,0);
});

test('22. 标准模板下载生成三个固定工作表',()=>{
  const app=boot();const names=[];let fileName='';
  app.XLSX={utils:{book_new:()=>({}),aoa_to_sheet:rows=>({rows}),book_append_sheet:(book,sheet,name)=>{names.push(name);}},writeFile:(book,name)=>{fileName=name;}};
  app.downloadStandardPlanTemplate();
  assert.deepEqual(names,['填写说明','训练器数据_v1','组计划_v1']);
  assert.equal(fileName,'训练器标准训练计划_v1.xlsx');
});
