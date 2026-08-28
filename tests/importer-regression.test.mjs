import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage,loadImporter,loadScript,createContext,samplePlan,sampleWarmups } from './helpers.mjs';

const xuhuiRows=[
  ['周次','日期','星期','阶段','训练主题','热身模板','训练内容（组×次数/余力）','组间休息/规则'],
  ['1','2026-01-01','周一','增肌期','下肢A','下肢热身','前蹲 3x5（余力3）\nRDL 3x8（余力2-3）','主项180秒']
];
const xiaoyueRows=[
  ['顺序日','周次','周内日','类型','主题','今日内容（整格照做）','完成日期/备注'],
  ['1','1','周一','训练日','下肢A','【功能/热身】\n踝背屈 2组x10次\n【主训练】\n前蹲｜3组x5次｜余力3｜休息：180秒','']
];

test('4. 徐晖格式正确导入',()=>{
  const app=loadImporter();
  const parsed=app.parseDailyGridSheet(xuhuiRows,{id:'xuhui',label:'徐晖版'});
  assert.equal(parsed.plan.length,1);
  assert.match(parsed.plan[0]['训练内容（组×次数/余力）'],/前蹲/);
  assert.equal(parsed.validation.valid,true);
});

test('5. 肖悦格式正确导入',()=>{
  const app=loadImporter();
  const parsed=app.parseDailyGridSheet(xiaoyueRows,{id:'xiaoyue',label:'肖悦版'});
  assert.equal(parsed.plan.length,1);
  assert.match(parsed.plan[0]['导入热身内容'],/踝背屈/);
  assert.match(parsed.plan[0]['训练内容（组×次数/余力）'],/前蹲/);
});

function fullContext(){
  const storage=new MemoryStorage();
  const context=createContext(storage);
  context.normalizeExcelRows=rows=>(rows||[]).filter(row=>row.some(Boolean)).map(row=>row.map(value=>String(value??'').trim()));
  loadScript(context,'storage.js');
  loadScript(context,'parser.js');
  loadScript(context,'importer.js');
  context.initializeTrainingTracker(samplePlan,sampleWarmups);
  return context;
}

test('6. 无法识别文件报错且当前计划完全不变',()=>{
  const app=fullContext();
  const before=JSON.stringify(app.trainingTrackerState);
  assert.throws(()=>app.parseDailyGridSheet([['姓名','地址'],['测试','未知']],{id:'unknown'}),error=>error.name==='ImportError');
  assert.equal(JSON.stringify(app.trainingTrackerState),before);
});

test('7. 解析失败绝不加载徐晖默认 PLAN',()=>{
  const app=fullContext();
  const custom=app.addProgram(app.createProgramFromPlan([{'训练主题':'用户自己的计划','训练内容（组×次数/余力）':'划船 3x8'}],{name:'用户计划',source:'excel'}),true);
  const activeBefore=app.trainingTrackerState.activeProgramId;
  const countBefore=Object.keys(app.getActiveProfile().programs).length;
  assert.throws(()=>app.parseWorkbookToImport({SheetNames:['导航'],Sheets:{导航:[['说明']] }},{name:'未知.xlsx'}));
  assert.equal(app.trainingTrackerState.activeProgramId,activeBefore);
  assert.equal(app.getActiveProgram().programId,custom.programId);
  assert.equal(app.getActiveProgram().days[0]['训练主题'],'用户自己的计划');
  assert.equal(Object.keys(app.getActiveProfile().programs).length,countBefore);
});
