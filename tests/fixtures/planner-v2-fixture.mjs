export const sheetNames={
  plan:'计划信息_v2',workouts:'训练日_v2',exercises:'动作_v2',sets:'组计划_v2',supersets:'超级组_v2',drops:'递减组_v2',activities:'活动_v2',activitySegments:'活动阶段_v2',instructions:'说明块_v2'
};

export const headers={
  plan:['protocol','schemaVersion','planKey','planVersion','programName','description','startDate','locale','note'],
  workouts:['planKey','planVersion','workoutKey','order','plannedDate','week','dayInWeek','workoutType','title','targetDurationMin','note'],
  exercises:['planKey','planVersion','workoutKey','exerciseKey','order','section','trainingRole','exerciseType','name','trackingName','unit','supersetKey','supersetOrder','countsAsWorkingSet','countsAsHypertrophySet','techniqueCue','note'],
  sets:['planKey','planVersion','workoutKey','exerciseKey','setKey','setNo','setType','targetWeight','weightUnit','repsMin','repsMax','rirMin','rirMax','restMinSec','restMaxSec','durationSec','loadAdjustmentType','loadAdjustmentValue','techniqueCue','note'],
  supersets:['planKey','planVersion','workoutKey','supersetKey','name','mode','transitionMinSec','transitionMaxSec','roundRestMinSec','roundRestMaxSec','note'],
  drops:['planKey','planVersion','workoutKey','exerciseKey','parentSetKey','dropSegmentKey','segmentOrder','label','loadAdjustmentType','loadAdjustmentMin','loadAdjustmentMax','repsMin','repsMax','rirMin','rirMax','transitionMinSec','transitionMaxSec','techniqueCue','note'],
  activities:['planKey','planVersion','workoutKey','activityKey','order','activityType','name','durationMinSec','durationMaxSec','rpeMin','rpeMax','zone','measureMin','measureMax','measureUnit','instruction','note'],
  activitySegments:['planKey','planVersion','workoutKey','activityKey','activitySegmentKey','segmentOrder','segmentType','name','targetWeight','weightUnit','repsMin','repsMax','rirMin','rirMax','restMinSec','restMaxSec','durationSec','measureMin','measureMax','measureUnit','techniqueCue','instruction','note'],
  instructions:['planKey','planVersion','instructionKey','scopeType','scopeKey','order','instructionType','content']
};

const P='SAMPLE_PLAN',V='1.0';
const row=(header,values)=>header.map(key=>values[key]??'');

export function plannerV2Workbook(){
  const data={
    plan:[row(headers.plan,{protocol:'planner-import-v2',schemaVersion:2,planKey:P,planVersion:V,programName:'Planner v2 匿名完整示例',description:'仅用于协议测试',startDate:'2026-09-01',locale:'zh-CN',note:'示例数据可删除'})],
    workouts:[
      row(headers.workouts,{planKey:P,planVersion:V,workoutKey:'W001',order:1,plannedDate:'2026-09-01',week:1,dayInWeek:1,workoutType:'strength-cardio',title:'示例力量与有氧',targetDurationMin:75}),
      row(headers.workouts,{planKey:P,planVersion:V,workoutKey:'W002',order:2,plannedDate:'2026-09-02',week:1,dayInWeek:2,workoutType:'climbing',title:'示例攀岩',targetDurationMin:60}),
      row(headers.workouts,{planKey:P,planVersion:V,workoutKey:'W003',order:3,plannedDate:'2026-09-03',week:1,dayInWeek:3,workoutType:'rest',title:'示例休息日'}),
      row(headers.workouts,{planKey:P,planVersion:V,workoutKey:'W004',order:4,plannedDate:'2026-09-04',week:1,dayInWeek:4,workoutType:'deload-strength',title:'示例减载力量',targetDurationMin:45})
    ],
    exercises:[
      row(headers.exercises,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E01',order:1,section:'main',trainingRole:'pattern',exerciseType:'resistance',name:'示例主项甲',trackingName:'示例主项甲',unit:'kg',countsAsWorkingSet:'TRUE',countsAsHypertrophySet:'TRUE',techniqueCue:'保持稳定轨迹'}),
      row(headers.exercises,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E02',order:2,section:'main-assistance',trainingRole:'hypertrophy',exerciseType:'resistance',name:'示例主辅助',trackingName:'示例主辅助',unit:'kg',countsAsWorkingSet:'TRUE',countsAsHypertrophySet:'TRUE'}),
      row(headers.exercises,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E03',order:3,section:'assistance',trainingRole:'hypertrophy',exerciseType:'resistance',name:'超级组动作甲',trackingName:'超级组动作甲',unit:'kg',supersetKey:'W001-SS01',supersetOrder:1,countsAsWorkingSet:'TRUE',countsAsHypertrophySet:'TRUE'}),
      row(headers.exercises,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E04',order:4,section:'assistance',trainingRole:'hypertrophy',exerciseType:'bodyweight',name:'超级组动作乙',trackingName:'超级组动作乙',supersetKey:'W001-SS01',supersetOrder:2,countsAsWorkingSet:'TRUE',countsAsHypertrophySet:'TRUE'}),
      row(headers.exercises,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E05',order:5,section:'isolation',trainingRole:'isolation',exerciseType:'resistance',name:'多阶段递减示例',trackingName:'多阶段递减示例',unit:'kg',countsAsWorkingSet:'TRUE',countsAsHypertrophySet:'TRUE'}),
      row(headers.exercises,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E06',order:6,section:'skill',trainingRole:'skill-acquisition',exerciseType:'bodyweight',name:'技能学习示例',trackingName:'技能学习示例',countsAsWorkingSet:'FALSE',countsAsHypertrophySet:'FALSE'}),
      row(headers.exercises,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E07',order:7,section:'skill',trainingRole:'skill-retention',exerciseType:'timed',name:'技能保留示例',trackingName:'技能保留示例',countsAsWorkingSet:'FALSE',countsAsHypertrophySet:'FALSE'}),
      row(headers.exercises,{planKey:P,planVersion:V,workoutKey:'W004',exerciseKey:'W004-E01',order:1,section:'main',trainingRole:'pattern',exerciseType:'resistance',name:'减载主项示例',trackingName:'减载主项示例',unit:'kg',countsAsWorkingSet:'TRUE',countsAsHypertrophySet:'FALSE'})
    ],
    sets:[
      row(headers.sets,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E01',setKey:'W001-E01-S01',setNo:1,setType:'technique',targetWeight:20,weightUnit:'kg',repsMin:8,repsMax:8,rirMin:4,rirMax:5,restMinSec:45,restMaxSec:60,techniqueCue:'动作速度稳定'}),
      row(headers.sets,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E01',setKey:'W001-E01-S02',setNo:2,setType:'top',targetWeight:60,weightUnit:'kg',repsMin:5,repsMax:5,rirMin:2,rirMax:3,restMinSec:150,restMaxSec:180}),
      row(headers.sets,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E01',setKey:'W001-E01-S03',setNo:3,setType:'backoff',repsMin:6,repsMax:6,rirMin:2,rirMax:3,restMinSec:120,restMaxSec:150,loadAdjustmentType:'percent',loadAdjustmentValue:-15}),
      row(headers.sets,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E02',setKey:'W001-E02-S01',setNo:1,setType:'working',repsMin:8,repsMax:10,rirMin:2,rirMax:3,restMinSec:90,restMaxSec:120}),
      row(headers.sets,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E03',setKey:'W001-E03-S01',setNo:1,setType:'working',repsMin:10,repsMax:12,rirMin:2,rirMax:3,restMinSec:0,restMaxSec:15}),
      row(headers.sets,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E04',setKey:'W001-E04-S01',setNo:1,setType:'working',repsMin:10,repsMax:12,rirMin:2,rirMax:3,restMinSec:90,restMaxSec:120}),
      row(headers.sets,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E05',setKey:'W001-E05-S01',setNo:1,setType:'dropset',repsMin:8,repsMax:10,rirMin:1,rirMax:2,restMinSec:90,restMaxSec:120}),
      row(headers.sets,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E06',setKey:'W001-E06-S01',setNo:1,setType:'technique',repsMin:3,repsMax:5,rirMin:4,rirMax:5,restMinSec:45,restMaxSec:60}),
      row(headers.sets,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E07',setKey:'W001-E07-S01',setNo:1,setType:'technique',durationSec:30,restMinSec:30,restMaxSec:45}),
      row(headers.sets,{planKey:P,planVersion:V,workoutKey:'W004',exerciseKey:'W004-E01',setKey:'W004-E01-S01',setNo:1,setType:'working',repsMin:5,repsMax:5,rirMin:4,rirMax:5,restMinSec:90,restMaxSec:120})
    ],
    supersets:[row(headers.supersets,{planKey:P,planVersion:V,workoutKey:'W001',supersetKey:'W001-SS01',name:'示例超级组',mode:'alternating',transitionMinSec:0,transitionMaxSec:15,roundRestMinSec:90,roundRestMaxSec:120,note:'交替完成'})],
    drops:[
      row(headers.drops,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E05',parentSetKey:'W001-E05-S01',dropSegmentKey:'W001-E05-S01-D01',segmentOrder:1,label:'主段',repsMin:8,repsMax:10,rirMin:1,rirMax:2,techniqueCue:'动作完整'}),
      row(headers.drops,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E05',parentSetKey:'W001-E05-S01',dropSegmentKey:'W001-E05-S01-D02',segmentOrder:2,label:'降重一',loadAdjustmentType:'percent',loadAdjustmentMin:-25,loadAdjustmentMax:-20,repsMin:8,repsMax:10,rirMin:1,rirMax:2,transitionMinSec:10,transitionMaxSec:15}),
      row(headers.drops,{planKey:P,planVersion:V,workoutKey:'W001',exerciseKey:'W001-E05',parentSetKey:'W001-E05-S01',dropSegmentKey:'W001-E05-S01-D03',segmentOrder:3,label:'降重二',loadAdjustmentType:'percent',loadAdjustmentMin:-25,loadAdjustmentMax:-20,repsMin:10,repsMax:12,rirMin:0,rirMax:1,transitionMinSec:10,transitionMaxSec:15})
    ],
    activities:[
      row(headers.activities,{planKey:P,planVersion:V,workoutKey:'W001',activityKey:'W001-A01',order:1,activityType:'warmup',name:'示例主项甲｜主项热身',durationMinSec:420,durationMaxSec:600}),
      row(headers.activities,{planKey:P,planVersion:V,workoutKey:'W001',activityKey:'W001-A02',order:2,activityType:'warmup',name:'示例主辅助｜主项热身',durationMinSec:300,durationMaxSec:420}),
      row(headers.activities,{planKey:P,planVersion:V,workoutKey:'W001',activityKey:'W001-A03',order:3,activityType:'cardio',name:'Zone2',durationMinSec:1200,durationMaxSec:1800,rpeMin:3,rpeMax:4,zone:'Zone2',instruction:'保持可对话强度'}),
      row(headers.activities,{planKey:P,planVersion:V,workoutKey:'W002',activityKey:'W002-A01',order:1,activityType:'climbing',name:'示例攀岩',durationMinSec:2700,durationMaxSec:3600,rpeMin:5,rpeMax:7,measureMin:4,measureMax:6,measureUnit:'routes'}),
      row(headers.activities,{planKey:P,planVersion:V,workoutKey:'W003',activityKey:'W003-A01',order:1,activityType:'recovery',name:'主动恢复',durationMinSec:600,durationMaxSec:900,rpeMin:1,rpeMax:2})
    ],
    activitySegments:[
      row(headers.activitySegments,{planKey:P,planVersion:V,workoutKey:'W001',activityKey:'W001-A01',activitySegmentKey:'W001-A01-P01',segmentOrder:1,segmentType:'warmup-stage',name:'空杆准备',targetWeight:20,weightUnit:'kg',repsMin:10,repsMax:12,restMinSec:30,restMaxSec:45,techniqueCue:'稳定轨迹'}),
      row(headers.activitySegments,{planKey:P,planVersion:V,workoutKey:'W001',activityKey:'W001-A01',activitySegmentKey:'W001-A01-P02',segmentOrder:2,segmentType:'warmup-stage',name:'递增准备',repsMin:5,repsMax:6,restMinSec:45,restMaxSec:60,instruction:'逐级增加重量'}),
      row(headers.activitySegments,{planKey:P,planVersion:V,workoutKey:'W001',activityKey:'W001-A02',activitySegmentKey:'W001-A02-P01',segmentOrder:1,segmentType:'warmup-stage',name:'轻重量准备',repsMin:8,repsMax:10,restMinSec:30,restMaxSec:45}),
      row(headers.activitySegments,{planKey:P,planVersion:V,workoutKey:'W002',activityKey:'W002-A01',activitySegmentKey:'W002-A01-P01',segmentOrder:1,segmentType:'drill',name:'脚法练习',measureMin:2,measureMax:3,measureUnit:'routes',instruction:'选择简单路线'}),
      row(headers.activitySegments,{planKey:P,planVersion:V,workoutKey:'W002',activityKey:'W002-A01',activitySegmentKey:'W002-A01-P02',segmentOrder:2,segmentType:'route-block',name:'路线练习',measureMin:2,measureMax:3,measureUnit:'routes',instruction:'保留动作质量'})
    ],
    instructions:[
      row(headers.instructions,{planKey:P,planVersion:V,instructionKey:'W001-I01',scopeType:'workout',scopeKey:'W001',order:1,instructionType:'execution',content:'今天以动作质量优先'}),
      row(headers.instructions,{planKey:P,planVersion:V,instructionKey:'W001-I02',scopeType:'exercise',scopeKey:'W001-E01',order:1,instructionType:'record',content:'记录顶组主观速度'}),
      row(headers.instructions,{planKey:P,planVersion:V,instructionKey:'W002-I01',scopeType:'activity',scopeKey:'W002-A01',order:1,instructionType:'stop',content:'动作质量明显下降时停止'})
    ]
  };
  const Sheets={'填写说明':[['Planner Import v2 测试说明']]},SheetNames=['填写说明'];
  Object.keys(sheetNames).forEach(key=>{Sheets[sheetNames[key]]=[headers[key],...data[key]];SheetNames.push(sheetNames[key]);});
  return {SheetNames,Sheets};
}

export function blankPlannerV2Workbook(){
  const workbook=plannerV2Workbook();
  Object.keys(sheetNames).forEach(key=>{workbook.Sheets[sheetNames[key]]=key==='plan'?[headers.plan,row(headers.plan,{protocol:'planner-import-v2',schemaVersion:2,planKey:'PLAN_KEY',planVersion:'1.0',programName:'请填写计划名称',locale:'zh-CN'})]:[headers[key]];});
  return workbook;
}
