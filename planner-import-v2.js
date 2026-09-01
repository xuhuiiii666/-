/* Planner Import v2 workbook contract, validation and read-only conversion. */
(function(global){
  'use strict';

  var PROTOCOL='planner-import-v2';
  var PROTOCOL_VERSION='2.0';
  var SCHEMA_VERSION='2';
  var GUIDE_SHEET='填写说明';
  var SHEETS={
    plan:'计划信息_v2',workouts:'训练日_v2',exercises:'动作_v2',sets:'组计划_v2',
    supersets:'超级组_v2',drops:'递减组_v2',activities:'活动_v2',activitySegments:'活动阶段_v2',instructions:'说明块_v2'
  };
  var HEADERS={
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
  var REQUIRED={
    plan:['protocol','schemaVersion','planKey','planVersion','programName'],
    workouts:['planKey','planVersion','workoutKey','order','workoutType','title'],
    exercises:['planKey','planVersion','workoutKey','exerciseKey','order','section','trainingRole','exerciseType','name','trackingName','countsAsWorkingSet','countsAsHypertrophySet'],
    sets:['planKey','planVersion','workoutKey','exerciseKey','setKey','setNo','setType'],
    supersets:['planKey','planVersion','workoutKey','supersetKey','mode'],
    drops:['planKey','planVersion','workoutKey','exerciseKey','parentSetKey','dropSegmentKey','segmentOrder'],
    activities:['planKey','planVersion','workoutKey','activityKey','order','activityType','name'],
    activitySegments:['planKey','planVersion','workoutKey','activityKey','activitySegmentKey','segmentOrder','segmentType','name'],
    instructions:['planKey','planVersion','instructionKey','scopeType','scopeKey','order','instructionType','content']
  };
  var ENUMS={
    workoutType:['strength','strength-cardio','climbing','deload-strength','deload-climbing','rest'],
    section:['main','main-assistance','assistance','isolation','core','rehab','skill'],
    trainingRole:['pattern','hypertrophy','isolation','skill-acquisition','skill-retention'],
    exerciseType:['resistance','bodyweight','timed'],
    setType:['working','technique','warmup','top','backoff','dropset'],
    supersetMode:['alternating'],
    activityType:['warmup','cardio','climbing','skill','recovery'],
    activitySegmentType:['warmup-stage','drill','route-block'],
    loadAdjustmentType:['percent','absolute'],
    weightUnit:['kg','lb'],
    measureUnit:['reps','seconds','meters','routes'],
    scopeType:['workout','exercise','activity'],
    instructionType:['cycle','progression','volume','execution','record','recovery','recovery-check','adjustment','stop','review','note']
  };
  var KEY_PATTERN=/^[A-Z][A-Z0-9_-]{0,63}$/;
  var VERSION_PATTERN=/^\d+\.\d+(?:\.\d+)?$/;

  function text(value){return String(value===undefined||value===null?'':value).trim();}
  function numberOrNull(value){if(text(value)==='')return null;var number=Number(value);return isFinite(number)?number:null;}
  function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function asArray(value){return Array.isArray(value)?value:[];}
  function rowObjects(rows){
    if(!Array.isArray(rows)||!rows.length)return [];
    var headers=rows[0].map(text);
    return rows.slice(1).map(function(row,index){var result={_row:index+2};headers.forEach(function(header,column){result[header]=row[column]===undefined?'':row[column];});return result;})
      .filter(function(row){return headers.some(function(header){return text(row[header])!=='';});});
  }
  function exactHeaders(report,key,rows){
    var expected=HEADERS[key],actual=asArray(rows&&rows[0]).map(text),label=SHEETS[key];
    var duplicates=actual.filter(function(header,index){return header&&actual.indexOf(header)!==index;});
    var missing=expected.filter(function(header){return actual.indexOf(header)<0;});
    var unknown=actual.filter(function(header){return header&&expected.indexOf(header)<0;});
    if(duplicates.length)report.errors.push('「'+label+'」存在重复列：'+Array.from(new Set(duplicates)).join('、'));
    if(missing.length)report.errors.push('「'+label+'」缺少列：'+missing.join('、'));
    if(unknown.length)report.errors.push('「'+label+'」存在未知列：'+unknown.join('、'));
    if(!duplicates.length&&!missing.length&&!unknown.length&&actual.join('\u0001')!==expected.join('\u0001'))report.errors.push('「'+label+'」列顺序必须与 Planner Import v2 规范一致');
    return !duplicates.length&&!missing.length&&!unknown.length&&actual.join('\u0001')===expected.join('\u0001');
  }
  function required(report,row,fields,label){fields.forEach(function(field){if(text(row[field])==='')report.errors.push(label+'缺少 '+field);});}
  function enumValue(report,row,field,values,label,optional){var value=text(row[field]);if(!value&&optional)return;if(values.indexOf(value)<0)report.errors.push(label+field+' 只能是 '+values.join('/'));}
  function positiveInteger(value){var number=numberOrNull(value);return number!==null&&number>=1&&Math.floor(number)===number;}
  function range(report,row,minField,maxField,label,options,prefix){
    options=options||{};var minText=text(row[minField]),maxText=text(row[maxField]),min=numberOrNull(row[minField]),max=numberOrNull(row[maxField]);
    if(!minText&&!maxText)return null;
    if(!minText||!maxText){report.errors.push(prefix+label+'上下限必须同时填写或同时留空');return null;}
    if(min===null||max===null){report.errors.push(prefix+label+'上下限必须是数字');return null;}
    if(max<min)report.errors.push(prefix+label+'上限不能小于下限');
    if(options.min!==undefined&&(min<options.min||max<options.min))report.errors.push(prefix+label+'不能小于 '+options.min);
    if(options.max!==undefined&&(min>options.max||max>options.max))report.errors.push(prefix+label+'不能大于 '+options.max);
    return {min:min,max:max};
  }
  function optionalNumber(report,row,field,label,options){
    if(text(row[field])==='')return null;var value=numberOrNull(row[field]);options=options||{};
    if(value===null)report.errors.push(label+field+' 必须是数字');
    else if(options.min!==undefined&&value<options.min)report.errors.push(label+field+' 不能小于 '+options.min);
    else if(options.max!==undefined&&value>options.max)report.errors.push(label+field+' 不能大于 '+options.max);
    return value;
  }
  function optionalPositiveInteger(report,row,field,label){if(text(row[field])==='' )return null;var value=numberOrNull(row[field]);if(value===null||value<1||Math.floor(value)!==value)report.errors.push(label+field+' 必须是正整数');return value;}
  function strictBoolean(report,row,field,label){var value=text(row[field]).toUpperCase();if(value!=='TRUE'&&value!=='FALSE')report.errors.push(label+field+' 只能是 TRUE 或 FALSE');return value==='TRUE';}
  function isoDate(value){var source=text(value);return !source||(/^\d{4}-\d{2}-\d{2}$/.test(source)&&!isNaN(new Date(source+'T00:00:00Z').getTime()));}
  function assertPlanIdentity(report,row,plan,label){if(text(row.planKey)!==plan.planKey)report.errors.push(label+'planKey 与计划信息不一致');if(text(row.planVersion)!==plan.planVersion)report.errors.push(label+'planVersion 与计划信息不一致');}
  function registerKey(report,registry,key,type,label){if(!KEY_PATTERN.test(key)){report.errors.push(label+type+' 不符合稳定键规则');return;}if(registry[key])report.errors.push(label+type+' 与 '+registry[key]+' 重复：'+key);else registry[key]=type;}
  function contiguous(report,rows,parentFields,orderField,label){
    var groups={};rows.forEach(function(row){var parent=parentFields.map(function(field){return text(row[field]);}).join('::');(groups[parent]=groups[parent]||[]).push(numberOrNull(row[orderField]));});
    Object.keys(groups).forEach(function(parent){var values=groups[parent].slice().sort(function(a,b){return a-b;});values.forEach(function(value,index){if(value!==index+1)report.errors.push(label+'在 '+parent+' 中必须从 1 连续编号');});});
  }
  function detectPlannerV2Format(workbook){var names=workbook&&Array.isArray(workbook.SheetNames)?workbook.SheetNames:[];return Object.keys(SHEETS).some(function(key){return names.indexOf(SHEETS[key])>=0;});}

  function validatePlannerV2Workbook(workbook,readRows,options){
    options=options||{};readRows=typeof readRows==='function'?readRows:global.rowsFromSheet;
    var report={format:'Planner Import v2',schema:SCHEMA_VERSION,protocol:PROTOCOL,protocolVersion:PROTOCOL_VERSION,errors:[],warnings:[],checks:[],structureValid:false,semanticValid:false,semanticStatus:'FAIL',stats:{workouts:0,exercises:0,sets:0,activities:0,activitySegments:0,supersets:0,dropSegments:0,instructions:0},rows:{}};
    var names=workbook&&Array.isArray(workbook.SheetNames)?workbook.SheetNames:[];
    if(typeof readRows!=='function'){report.errors.push('Planner Import v2 无法读取工作表');return report;}
    if(names.indexOf(GUIDE_SHEET)<0)report.errors.push('缺少必需工作表「'+GUIDE_SHEET+'」');
    Object.keys(SHEETS).forEach(function(key){if(names.indexOf(SHEETS[key])<0)report.errors.push('缺少必需工作表「'+SHEETS[key]+'」');});
    var expectedOrder=[GUIDE_SHEET].concat(Object.keys(SHEETS).map(function(key){return SHEETS[key];}));
    var unexpected=names.filter(function(name){return expectedOrder.indexOf(name)<0;});
    if(unexpected.length)report.errors.push('Planner Import v2 不允许额外工作表：'+unexpected.join('、'));
    if(!unexpected.length&&names.join('\u0001')!==expectedOrder.join('\u0001'))report.errors.push('Planner Import v2 工作表顺序必须为：'+expectedOrder.join(' → '));
    if(report.errors.length)return report;
    var headersValid=true;
    Object.keys(SHEETS).forEach(function(key){var rows=readRows(workbook.Sheets&&workbook.Sheets[SHEETS[key]]);if(!exactHeaders(report,key,rows))headersValid=false;report.rows[key]=rowObjects(rows);});
    report.structureValid=headersValid;
    if(!headersValid)return report;
    if(report.rows.plan.length!==1){report.errors.push('「'+SHEETS.plan+'」必须且只能有一行计划信息');return report;}
    var plan=report.planInfo=report.rows.plan[0];
    required(report,plan,REQUIRED.plan,'计划信息第 2 行 ');
    if(text(plan.protocol)!==PROTOCOL)report.errors.push('protocol 必须为 '+PROTOCOL);
    if(text(plan.schemaVersion)!==SCHEMA_VERSION)report.errors.push('schemaVersion 必须为 '+SCHEMA_VERSION);
    if(!KEY_PATTERN.test(text(plan.planKey)))report.errors.push('planKey 不符合稳定键规则');
    if(!VERSION_PATTERN.test(text(plan.planVersion)))report.errors.push('planVersion 必须使用 1.0、1.1 或 1.0.0 格式');
    if(!isoDate(plan.startDate))report.errors.push('startDate 必须为 YYYY-MM-DD 或留空');
    var registry={},workouts={},exercises={},sets={},activities={},supersets={};
    report.rows.workouts.forEach(function(row){
      var label='训练日第 '+row._row+' 行 ';required(report,row,REQUIRED.workouts,label);assertPlanIdentity(report,row,plan,label);registerKey(report,registry,text(row.workoutKey),'workoutKey',label);
      if(workouts[text(row.workoutKey)])report.errors.push(label+'workoutKey 重复');workouts[text(row.workoutKey)]=row;
      if(!positiveInteger(row.order))report.errors.push(label+'order 必须是正整数');if(!isoDate(row.plannedDate))report.errors.push(label+'plannedDate 必须为 YYYY-MM-DD 或留空');
      enumValue(report,row,'workoutType',ENUMS.workoutType,label);optionalPositiveInteger(report,row,'week',label);optionalPositiveInteger(report,row,'dayInWeek',label);optionalNumber(report,row,'targetDurationMin',label,{min:1});
    });
    report.rows.exercises.forEach(function(row){
      var label='动作第 '+row._row+' 行 ';required(report,row,REQUIRED.exercises,label);assertPlanIdentity(report,row,plan,label);registerKey(report,registry,text(row.exerciseKey),'exerciseKey',label);
      if(!workouts[text(row.workoutKey)])report.errors.push(label+'找不到 workoutKey '+text(row.workoutKey));exercises[text(row.exerciseKey)]=row;
      if(!positiveInteger(row.order))report.errors.push(label+'order 必须是正整数');enumValue(report,row,'section',ENUMS.section,label);enumValue(report,row,'trainingRole',ENUMS.trainingRole,label);enumValue(report,row,'exerciseType',ENUMS.exerciseType,label);
      var unit=text(row.unit);if(unit)enumValue(report,row,'unit',ENUMS.weightUnit,label,true);strictBoolean(report,row,'countsAsWorkingSet',label);strictBoolean(report,row,'countsAsHypertrophySet',label);
      if(text(row.supersetKey)){if(!positiveInteger(row.supersetOrder))report.errors.push(label+'填写 supersetKey 时 supersetOrder 必须是正整数');}
      else if(text(row.supersetOrder))report.errors.push(label+'supersetOrder 需要对应 supersetKey');
    });
    report.rows.sets.forEach(function(row){
      var label='组计划第 '+row._row+' 行 ';required(report,row,REQUIRED.sets,label);assertPlanIdentity(report,row,plan,label);registerKey(report,registry,text(row.setKey),'setKey',label);
      var exercise=exercises[text(row.exerciseKey)];if(!workouts[text(row.workoutKey)])report.errors.push(label+'找不到 workoutKey '+text(row.workoutKey));if(!exercise)report.errors.push(label+'找不到 exerciseKey '+text(row.exerciseKey));else if(text(exercise.workoutKey)!==text(row.workoutKey))report.errors.push(label+'exerciseKey 不属于该 workoutKey');
      sets[text(row.setKey)]=row;if(!positiveInteger(row.setNo))report.errors.push(label+'setNo 必须是正整数');enumValue(report,row,'setType',ENUMS.setType,label);
      var reps=range(report,row,'repsMin','repsMax','次数',{min:0},label),duration=optionalNumber(report,row,'durationSec',label,{min:1});
      if(!!reps===!!(duration!==null))report.errors.push(label+'必须且只能填写 reps 范围或 durationSec');
      range(report,row,'rirMin','rirMax','RIR',{min:0,max:10},label);range(report,row,'restMinSec','restMaxSec','休息秒数',{min:0},label);
      var targetWeight=optionalNumber(report,row,'targetWeight',label,{min:0}),weightUnit=text(row.weightUnit);if(targetWeight!==null&&!weightUnit)report.errors.push(label+'targetWeight 需要 weightUnit');if(weightUnit)enumValue(report,row,'weightUnit',ENUMS.weightUnit,label,true);
      var adjustmentType=text(row.loadAdjustmentType),adjustmentValue=text(row.loadAdjustmentValue);if(adjustmentType)enumValue(report,row,'loadAdjustmentType',ENUMS.loadAdjustmentType,label,true);if(!!adjustmentType!==!!adjustmentValue)report.errors.push(label+'loadAdjustmentType 和 loadAdjustmentValue 必须同时填写或留空');if(adjustmentValue)optionalNumber(report,row,'loadAdjustmentValue',label,{});
    });
    report.rows.supersets.forEach(function(row){
      var label='超级组第 '+row._row+' 行 ';required(report,row,REQUIRED.supersets,label);assertPlanIdentity(report,row,plan,label);registerKey(report,registry,text(row.supersetKey),'supersetKey',label);
      if(!workouts[text(row.workoutKey)])report.errors.push(label+'找不到 workoutKey '+text(row.workoutKey));supersets[text(row.supersetKey)]=row;enumValue(report,row,'mode',ENUMS.supersetMode,label);range(report,row,'transitionMinSec','transitionMaxSec','动作间过渡',{min:0},label);range(report,row,'roundRestMinSec','roundRestMaxSec','轮间休息',{min:0},label);
    });
    report.rows.exercises.forEach(function(row){if(!text(row.supersetKey))return;var label='动作第 '+row._row+' 行 ',rule=supersets[text(row.supersetKey)];if(!rule)report.errors.push(label+'找不到 supersetKey '+text(row.supersetKey));else if(text(rule.workoutKey)!==text(row.workoutKey))report.errors.push(label+'supersetKey 不属于该 workoutKey');});
    Object.keys(supersets).forEach(function(key){var members=report.rows.exercises.filter(function(row){return text(row.supersetKey)===key;});if(members.length<2)report.errors.push('超级组 '+key+' 至少需要两个动作成员');});
    report.rows.drops.forEach(function(row){
      var label='递减组第 '+row._row+' 行 ';required(report,row,REQUIRED.drops,label);assertPlanIdentity(report,row,plan,label);registerKey(report,registry,text(row.dropSegmentKey),'dropSegmentKey',label);
      var parent=sets[text(row.parentSetKey)],exercise=exercises[text(row.exerciseKey)];if(!parent)report.errors.push(label+'找不到 parentSetKey '+text(row.parentSetKey));else if(text(parent.setType)!=='dropset')report.errors.push(label+'parentSetKey 必须指向 dropset');
      if(!exercise||text(exercise.workoutKey)!==text(row.workoutKey))report.errors.push(label+'exerciseKey/workoutKey 引用不一致');if(parent&&(text(parent.exerciseKey)!==text(row.exerciseKey)||text(parent.workoutKey)!==text(row.workoutKey)))report.errors.push(label+'parentSetKey 不属于该动作');
      if(!positiveInteger(row.segmentOrder))report.errors.push(label+'segmentOrder 必须是正整数');range(report,row,'repsMin','repsMax','次数',{min:0},label);range(report,row,'rirMin','rirMax','RIR',{min:0,max:10},label);range(report,row,'transitionMinSec','transitionMaxSec','阶段过渡',{min:0},label);
      var adjustmentType=text(row.loadAdjustmentType),hasAdjustment=text(row.loadAdjustmentMin)||text(row.loadAdjustmentMax);if(adjustmentType)enumValue(report,row,'loadAdjustmentType',ENUMS.loadAdjustmentType,label,true);if(!!adjustmentType!==!!hasAdjustment)report.errors.push(label+'重量调整类型与范围必须同时填写或留空');if(hasAdjustment)range(report,row,'loadAdjustmentMin','loadAdjustmentMax','重量调整',{},label);
      if(Number(row.segmentOrder)===1&&(adjustmentType||hasAdjustment))report.errors.push(label+'第 1 段不能填写重量调整');if(Number(row.segmentOrder)>1&&(!adjustmentType||!hasAdjustment))report.errors.push(label+'第 2 段起必须填写重量调整');
    });
    report.rows.activities.forEach(function(row){
      var label='活动第 '+row._row+' 行 ';required(report,row,REQUIRED.activities,label);assertPlanIdentity(report,row,plan,label);registerKey(report,registry,text(row.activityKey),'activityKey',label);
      if(!workouts[text(row.workoutKey)])report.errors.push(label+'找不到 workoutKey '+text(row.workoutKey));activities[text(row.activityKey)]=row;if(!positiveInteger(row.order))report.errors.push(label+'order 必须是正整数');enumValue(report,row,'activityType',ENUMS.activityType,label);
      var duration=range(report,row,'durationMinSec','durationMaxSec','活动时间',{min:0},label),measure=range(report,row,'measureMin','measureMax','活动计量',{min:0},label);range(report,row,'rpeMin','rpeMax','RPE',{min:0,max:10},label);if(measure&&!text(row.measureUnit))report.errors.push(label+'填写 measure 时必须填写 measureUnit');if(text(row.measureUnit))enumValue(report,row,'measureUnit',ENUMS.measureUnit,label,true);
      if(text(row.activityType)==='cardio'&&!duration&&!measure)report.errors.push(label+'cardio 至少需要 duration 或 measure');
    });
    report.rows.activitySegments.forEach(function(row){
      var label='活动阶段第 '+row._row+' 行 ';required(report,row,REQUIRED.activitySegments,label);assertPlanIdentity(report,row,plan,label);registerKey(report,registry,text(row.activitySegmentKey),'activitySegmentKey',label);
      var activity=activities[text(row.activityKey)];if(!activity)report.errors.push(label+'找不到 activityKey '+text(row.activityKey));else if(text(activity.workoutKey)!==text(row.workoutKey))report.errors.push(label+'activityKey 不属于该 workoutKey');
      if(!positiveInteger(row.segmentOrder))report.errors.push(label+'segmentOrder 必须是正整数');enumValue(report,row,'segmentType',ENUMS.activitySegmentType,label);range(report,row,'repsMin','repsMax','次数',{min:0},label);range(report,row,'rirMin','rirMax','RIR',{min:0,max:10},label);range(report,row,'restMinSec','restMaxSec','休息秒数',{min:0},label);range(report,row,'measureMin','measureMax','计量',{min:0},label);optionalNumber(report,row,'durationSec',label,{min:1});
      var targetWeight=optionalNumber(report,row,'targetWeight',label,{min:0});if(targetWeight!==null&&!text(row.weightUnit))report.errors.push(label+'targetWeight 需要 weightUnit');if(text(row.weightUnit))enumValue(report,row,'weightUnit',ENUMS.weightUnit,label,true);if((text(row.measureMin)||text(row.measureMax))&&!text(row.measureUnit))report.errors.push(label+'填写 measure 时必须填写 measureUnit');if(text(row.measureUnit))enumValue(report,row,'measureUnit',ENUMS.measureUnit,label,true);
    });
    report.rows.instructions.forEach(function(row){
      var label='说明块第 '+row._row+' 行 ';required(report,row,REQUIRED.instructions,label);assertPlanIdentity(report,row,plan,label);registerKey(report,registry,text(row.instructionKey),'instructionKey',label);if(!positiveInteger(row.order))report.errors.push(label+'order 必须是正整数');enumValue(report,row,'scopeType',ENUMS.scopeType,label);enumValue(report,row,'instructionType',ENUMS.instructionType,label);
      var scopeType=text(row.scopeType),scopeKey=text(row.scopeKey),exists=scopeType==='workout'?workouts[scopeKey]:(scopeType==='exercise'?exercises[scopeKey]:activities[scopeKey]);if(!exists)report.errors.push(label+'scopeKey 找不到对应 '+scopeType+'：'+scopeKey);
    });
    contiguous(report,report.rows.workouts,[],'order','Workout order');contiguous(report,report.rows.exercises,['workoutKey'],'order','Exercise order');contiguous(report,report.rows.sets,['exerciseKey'],'setNo','Set setNo');contiguous(report,report.rows.drops,['parentSetKey'],'segmentOrder','Drop segmentOrder');contiguous(report,report.rows.activities,['workoutKey'],'order','Activity order');contiguous(report,report.rows.activitySegments,['activityKey'],'segmentOrder','Activity segmentOrder');contiguous(report,report.rows.instructions,['scopeType','scopeKey'],'order','Instruction order');
    Object.keys(sets).forEach(function(setKey){var set=sets[setKey],segments=report.rows.drops.filter(function(row){return text(row.parentSetKey)===setKey;});if(text(set.setType)==='dropset'&&segments.length<2)report.errors.push('dropset '+setKey+' 至少需要两个递减阶段');if(text(set.setType)!=='dropset'&&segments.length)report.errors.push('非 dropset '+setKey+' 不能包含递减阶段');});
    Object.keys(activities).forEach(function(activityKey){var activity=activities[activityKey],segments=report.rows.activitySegments.filter(function(row){return text(row.activityKey)===activityKey;});if(text(activity.activityType)==='warmup'&&!segments.length)report.errors.push('warmup Activity '+activityKey+' 至少需要一个活动阶段');});
    Object.keys(workouts).forEach(function(workoutKey){if(text(workouts[workoutKey].workoutType)!=='rest')return;var exerciseCount=report.rows.exercises.filter(function(row){return text(row.workoutKey)===workoutKey;}).length,activityRows=report.rows.activities.filter(function(row){return text(row.workoutKey)===workoutKey;});if(exerciseCount)report.errors.push('rest Workout '+workoutKey+' 不能包含 Exercise');activityRows.forEach(function(row){if(text(row.activityType)!=='recovery')report.errors.push('rest Workout '+workoutKey+' 只能包含 recovery Activity');});});
    report.stats={workouts:report.rows.workouts.length,exercises:report.rows.exercises.length,sets:report.rows.sets.length,activities:report.rows.activities.length,activitySegments:report.rows.activitySegments.length,supersets:report.rows.supersets.length,dropSegments:report.rows.drops.length,instructions:report.rows.instructions.length};
    if(!options.allowEmpty&&!report.stats.workouts)report.errors.push('Planner Import v2 没有 Workout 数据');
    if(options.allowEmpty&&!report.stats.workouts)report.warnings.push('母模板尚未填写训练内容，结构校验通过但不可正式导入');
    report.structureValid=headersValid&&text(plan.protocol)===PROTOCOL&&text(plan.schemaVersion)===SCHEMA_VERSION;
    report.semanticValid=!report.errors.length&&report.stats.workouts>0;report.semanticStatus=report.semanticValid?'PASS':'FAIL';
    if(report.structureValid)report.checks.push('固定 Sheet、列名和列顺序校验通过');
    if(report.semanticValid){report.checks.push('稳定来源键和外键校验通过');report.checks.push('Workout / Exercise / Set / Activity 语义校验通过');report.checks.push('Superset / Drop Segment / Instruction scope 校验通过');}
    return report;
  }

  function hash(value){var source=text(value),result=2166136261;for(var i=0;i<source.length;i++)result=Math.imul(result^source.charCodeAt(i),16777619);return (result>>>0).toString(36);}
  function runtimeId(prefix,planKey,sourceKey){return prefix+'_pv2_'+hash(planKey+'::'+sourceKey);}
  function booleanValue(value){return text(value).toUpperCase()==='TRUE';}
  function sourceKey(planKey,key){return 'planner-v2:'+planKey+':'+key;}
  function group(rows,field){var result={};rows.forEach(function(row){var key=text(row[field]);(result[key]=result[key]||[]).push(row);});return result;}
  function setEntity(row,planKey,segments){
    var targetWeight=numberOrNull(row.targetWeight),duration=numberOrNull(row.durationSec),rest=numberOrNull(row.restMinSec);
    return {setId:runtimeId('set',planKey,text(row.setKey)),sourceSetKey:sourceKey(planKey,text(row.setKey)),setNo:Number(row.setNo),setType:text(row.setType),targetWeight:targetWeight,targetWeightUnit:text(row.weightUnit),targetRepsMin:numberOrNull(row.repsMin),targetRepsMax:numberOrNull(row.repsMax),targetRirMin:numberOrNull(row.rirMin),targetRirMax:numberOrNull(row.rirMax),targetRestMin:numberOrNull(row.restMinSec),targetRestMax:numberOrNull(row.restMaxSec),durationTargetSec:duration,loadAdjustmentType:text(row.loadAdjustmentType),loadAdjustmentValue:numberOrNull(row.loadAdjustmentValue),techniqueCue:text(row.techniqueCue),prescriptionDefined:true,segments:segments||[],weight:'',unit:text(row.weightUnit)||'kg',weightKg:0,reps:'',rir:'',duration:'',rest:rest===null?90:rest,note:text(row.note),completed:false,timerState:'idle'};
  }
  function segmentEntity(row,planKey){return {segmentId:runtimeId('segment',planKey,text(row.dropSegmentKey)),sourceDropSegmentKey:sourceKey(planKey,text(row.dropSegmentKey)),segmentNo:Number(row.segmentOrder),label:text(row.label),repsMin:numberOrNull(row.repsMin),repsMax:numberOrNull(row.repsMax),rirMin:numberOrNull(row.rirMin),rirMax:numberOrNull(row.rirMax),loadAdjustmentType:text(row.loadAdjustmentType),loadAdjustmentMin:numberOrNull(row.loadAdjustmentMin),loadAdjustmentMax:numberOrNull(row.loadAdjustmentMax),transitionMinSec:numberOrNull(row.transitionMinSec),transitionMaxSec:numberOrNull(row.transitionMaxSec),techniqueCue:text(row.techniqueCue),weight:'',unit:'kg',weightKg:0,reps:'',rir:'',note:text(row.note)};}
  function activitySegmentEntity(row,planKey){return {segmentId:runtimeId('activity_segment',planKey,text(row.activitySegmentKey)),sourceActivitySegmentKey:sourceKey(planKey,text(row.activitySegmentKey)),segmentNo:Number(row.segmentOrder),drillNo:Number(row.segmentOrder),segmentType:text(row.segmentType),label:text(row.name),name:text(row.name),targetWeight:numberOrNull(row.targetWeight),targetWeightUnit:text(row.weightUnit),repsMin:numberOrNull(row.repsMin),repsMax:numberOrNull(row.repsMax),rirMin:numberOrNull(row.rirMin),rirMax:numberOrNull(row.rirMax),restMinSec:numberOrNull(row.restMinSec),restMaxSec:numberOrNull(row.restMaxSec),durationSec:numberOrNull(row.durationSec),measureMin:numberOrNull(row.measureMin),measureMax:numberOrNull(row.measureMax),measureUnit:text(row.measureUnit),techniqueCue:text(row.techniqueCue),instruction:text(row.instruction),weight:'',unit:text(row.weightUnit)||'kg',weightKg:0,reps:'',rir:'',duration:'',rest:numberOrNull(row.restMinSec)||90,note:text(row.note),completed:false,timerState:'idle'};}
  function buildPlannerV2ProgramDays(report){
    if(!report||!report.semanticValid)throw new Error('Planner Import v2 必须先通过语义校验。');
    var planKey=text(report.planInfo.planKey),setRows=group(report.rows.sets,'exerciseKey'),dropRows=group(report.rows.drops,'parentSetKey'),exerciseRows=group(report.rows.exercises,'workoutKey'),activityRows=group(report.rows.activities,'workoutKey'),activitySegmentRows=group(report.rows.activitySegments,'activityKey'),supersetRows=group(report.rows.supersets,'workoutKey'),instructionRows=report.rows.instructions;
    var runtimeExercises={},runtimeActivities={};
    var workouts=report.rows.workouts.map(function(row){
      var workoutKey=text(row.workoutKey),workoutId=runtimeId('workout',planKey,workoutKey),plannedDate=text(row.plannedDate),workout={workoutId:workoutId,source:'planner-v2',sourceWorkoutKey:sourceKey(planKey,workoutKey),sourceWorkoutId:workoutKey,plannerWorkoutKey:workoutKey,order:Number(row.order),plannedDate:plannedDate,date:plannedDate,title:text(row.title),'训练主题':text(row.title),'周次':numberOrNull(row.week)||'','周内日':numberOrNull(row.dayInWeek)||'','星期':numberOrNull(row.dayInWeek)||'',workoutType:text(row.workoutType),'类型':text(row.workoutType),'阶段':text(row.workoutType),targetDurationMin:numberOrNull(row.targetDurationMin),note:text(row.note),exercises:[],activities:[],instructions:[],sections:[],supersetRules:[],'导入热身内容':'','热身模板':'—','训练内容（组×次数/余力）':'','组间休息/规则':'按各组处方执行'};
      workout.exercises=asArray(exerciseRows[workoutKey]).sort(function(a,b){return Number(a.order)-Number(b.order);}).map(function(exerciseRow){
        var exerciseKey=text(exerciseRow.exerciseKey),sets=asArray(setRows[exerciseKey]).sort(function(a,b){return Number(a.setNo)-Number(b.setNo);}).map(function(setRow){var segments=asArray(dropRows[text(setRow.setKey)]).sort(function(a,b){return Number(a.segmentOrder)-Number(b.segmentOrder);}).map(function(segment){return segmentEntity(segment,planKey);});return setEntity(setRow,planKey,segments);});
        var exerciseId=runtimeId('exercise',planKey,exerciseKey),first=sets[0]||{},exercise={exerciseId:exerciseId,sourceExerciseKey:sourceKey(planKey,exerciseKey),plannerExerciseKey:exerciseKey,source:'planner-v2',order:Number(exerciseRow.order),section:text(exerciseRow.section),sectionType:text(exerciseRow.section),trainingRole:text(exerciseRow.trainingRole),exerciseType:text(exerciseRow.exerciseType),name:text(exerciseRow.name),trackingName:text(exerciseRow.trackingName),originalName:text(exerciseRow.name),unit:text(exerciseRow.unit)||text(first.targetWeightUnit)||'kg',supersetKey:text(exerciseRow.supersetKey),supersetOrder:numberOrNull(exerciseRow.supersetOrder),countsAsWorkingSet:booleanValue(exerciseRow.countsAsWorkingSet),countsAsHypertrophySet:booleanValue(exerciseRow.countsAsHypertrophySet),techniqueCue:text(exerciseRow.techniqueCue),note:text(exerciseRow.note),setCount:sets.length,sets:sets,instructions:[],prescription:{repsMin:first.targetRepsMin,repsMax:first.targetRepsMax,rirMin:first.targetRirMin,rirMax:first.targetRirMax,restMin:first.targetRestMin,restMax:first.targetRestMax,recommendedWeight:'',unit:text(exerciseRow.unit)||'kg'}};
        runtimeExercises[exerciseKey]=exercise;return exercise;
      });
      workout.activities=asArray(activityRows[workoutKey]).sort(function(a,b){return Number(a.order)-Number(b.order);}).map(function(activityRow){
        var activityKey=text(activityRow.activityKey),segments=asArray(activitySegmentRows[activityKey]).sort(function(a,b){return Number(a.segmentOrder)-Number(b.segmentOrder);}).map(function(segment){return activitySegmentEntity(segment,planKey);});
        var activity={activityId:runtimeId('activity',planKey,activityKey),sourceActivityKey:sourceKey(planKey,activityKey),plannerActivityKey:activityKey,order:Number(activityRow.order),activityType:text(activityRow.activityType),title:text(activityRow.name),name:text(activityRow.name),durationMinSec:numberOrNull(activityRow.durationMinSec),durationMaxSec:numberOrNull(activityRow.durationMaxSec),rpeMin:numberOrNull(activityRow.rpeMin),rpeMax:numberOrNull(activityRow.rpeMax),zone:text(activityRow.zone),measureMin:numberOrNull(activityRow.measureMin),measureMax:numberOrNull(activityRow.measureMax),measureUnit:text(activityRow.measureUnit),instruction:text(activityRow.instruction),note:text(activityRow.note),instructions:[]};
        if(activity.activityType==='climbing')activity.drills=segments;else activity.segments=segments;runtimeActivities[activityKey]=activity;return activity;
      });
      var bySourceExercise={};workout.exercises.forEach(function(exercise){bySourceExercise[exercise.plannerExerciseKey]=exercise;});
      workout.supersetRules=asArray(supersetRows[workoutKey]).map(function(rule){var key=text(rule.supersetKey),members=workout.exercises.filter(function(exercise){return exercise.supersetKey===key;}).sort(function(a,b){return a.supersetOrder-b.supersetOrder;});members.forEach(function(exercise){exercise.supersetId=runtimeId('superset',planKey,key);});return {supersetId:runtimeId('superset',planKey,key),sourceSupersetKey:sourceKey(planKey,key),plannerSupersetKey:key,groupName:text(rule.name),mode:text(rule.mode),members:members.map(function(exercise){return exercise.exerciseId;}),transitionMinSec:numberOrNull(rule.transitionMinSec),transitionMaxSec:numberOrNull(rule.transitionMaxSec),roundRestMinSec:numberOrNull(rule.roundRestMinSec),roundRestMaxSec:numberOrNull(rule.roundRestMaxSec),note:text(rule.note)};});
      workout['导入热身内容']=workout.activities.filter(function(activity){return activity.activityType==='warmup';}).map(function(activity){return activity.title;}).join('\n');workout['热身模板']=workout['导入热身内容']?'Planner v2 结构化热身':'—';workout['训练内容（组×次数/余力）']=workout.exercises.map(function(exercise){return exercise.name+' '+exercise.setCount+'组';}).join('\n');
      return workout;
    });
    var workoutByKey={};workouts.forEach(function(workout){workoutByKey[workout.plannerWorkoutKey]=workout;});
    instructionRows.sort(function(a,b){return Number(a.order)-Number(b.order);}).forEach(function(row){var item={instructionId:runtimeId('instruction',planKey,text(row.instructionKey)),sourceInstructionKey:sourceKey(planKey,text(row.instructionKey)),scopeType:text(row.scopeType),scopeKey:text(row.scopeKey),category:text(row.instructionType),content:text(row.content),order:Number(row.order)};if(item.scopeType==='workout')workoutByKey[item.scopeKey].instructions.push(item);else if(item.scopeType==='exercise')runtimeExercises[item.scopeKey].instructions.push(item);else runtimeActivities[item.scopeKey].instructions.push(item);});
    return workouts;
  }
  function plannerValidationError(report){
    var message='Planner Import v2 校验失败，没有修改当前训练计划。';
    if(typeof global.ImportValidationError==='function')return new global.ImportValidationError(message,'PLANNER_V2_VALIDATION_FAILED',{report:report});
    var error=new Error(message);error.name='ImportValidationError';error.code='PLANNER_V2_VALIDATION_FAILED';error.report=report;error.details={report:report};return error;
  }
  function parsePlannerV2Workbook(workbook,file,readRows){
    var report=validatePlannerV2Workbook(workbook,readRows);
    if(report.errors.length||!report.semanticValid)throw plannerValidationError(report);
    var plan=buildPlannerV2ProgramDays(report),info=report.planInfo;
    return {format:'planner-v2',type:'Planner Import v2',protocol:PROTOCOL,protocolVersion:PROTOCOL_VERSION,planType:{id:'planner-v2',label:'Planner Import v2'},programName:text(info.programName),planKey:text(info.planKey),planVersion:text(info.planVersion),description:text(info.description),startDate:text(info.startDate),locale:text(info.locale),note:text(info.note),plan:plan,warmups:[],report:report,validation:{valid:true,errors:[],warnings:report.warnings.slice(),dayCount:plan.length,duplicateDays:[]},sheetName:SHEETS.plan,source:'file',sourceFileName:file&&file.name||'',candidates:Object.keys(SHEETS).map(function(key){return SHEETS[key];})};
  }

  var DIFF_ENTITIES={
    workouts:{key:'workoutKey',parent:function(row){return text(row.planKey);}},
    exercises:{key:'exerciseKey',parent:function(row){return text(row.workoutKey);}},
    sets:{key:'setKey',parent:function(row){return text(row.workoutKey)+'/'+text(row.exerciseKey);}},
    supersets:{key:'supersetKey',parent:function(row){return text(row.workoutKey);}},
    drops:{key:'dropSegmentKey',parent:function(row){return text(row.workoutKey)+'/'+text(row.exerciseKey)+'/'+text(row.parentSetKey);}},
    activities:{key:'activityKey',parent:function(row){return text(row.workoutKey);}},
    activitySegments:{key:'activitySegmentKey',parent:function(row){return text(row.workoutKey)+'/'+text(row.activityKey);}},
    instructions:{key:'instructionKey',parent:function(row){return text(row.scopeType)+'/'+text(row.scopeKey);}}
  };
  function diffComparable(row){
    var result={};Object.keys(row||{}).sort().forEach(function(key){if(key==='_row'||key==='planVersion')return;result[key]=text(row[key]);});return JSON.stringify(result);
  }
  function churnComparable(row){
    var result={};Object.keys(row||{}).sort().forEach(function(key){if(key==='_row'||key==='planVersion'||/Key$/.test(key))return;result[key]=text(row[key]);});return JSON.stringify(result);
  }
  function entityIndex(report){
    var byType={},globalKeys={};Object.keys(DIFF_ENTITIES).forEach(function(type){var meta=DIFF_ENTITIES[type],map={};asArray(report.rows[type]).forEach(function(row){var key=text(row[meta.key]);map[key]={row:row,parent:meta.parent(row),type:type};globalKeys[key]={type:type,parent:meta.parent(row),row:row};});byType[type]=map;});return {byType:byType,globalKeys:globalKeys};
  }
  function diffPlannerV2Versions(baseWorkbook,nextWorkbook,readRows){
    var base=validatePlannerV2Workbook(baseWorkbook,readRows),next=validatePlannerV2Workbook(nextWorkbook,readRows),result={format:'Planner Import v2 version diff',errors:[],warnings:[],semanticStatus:'FAIL',planKey:'',baseVersion:'',nextVersion:'',entities:{},summary:{unchanged:0,modified:0,added:0,removed:0,unexpectedKeyChurn:0}};
    if(base.errors.length||!base.semanticValid)result.errors.push('旧版本未通过 Planner Import v2 校验');
    if(next.errors.length||!next.semanticValid)result.errors.push('新版本未通过 Planner Import v2 校验');
    if(result.errors.length){result.baseReport=base;result.nextReport=next;return result;}
    result.planKey=text(base.planInfo.planKey);result.baseVersion=text(base.planInfo.planVersion);result.nextVersion=text(next.planInfo.planVersion);
    if(result.planKey!==text(next.planInfo.planKey))result.errors.push('只有相同 planKey 的版本可以做 Diff');
    var oldIndex=entityIndex(base),newIndex=entityIndex(next);
    Object.keys(oldIndex.globalKeys).forEach(function(key){var oldEntity=oldIndex.globalKeys[key],newEntity=newIndex.globalKeys[key];if(!newEntity)return;if(oldEntity.type!==newEntity.type)result.errors.push('稳定键 '+key+' 不能从 '+oldEntity.type+' 改为 '+newEntity.type);else if(oldEntity.parent!==newEntity.parent)result.errors.push('稳定键 '+key+' 不能更换父级：'+oldEntity.parent+' → '+newEntity.parent);});
    Object.keys(DIFF_ENTITIES).forEach(function(type){
      var oldMap=oldIndex.byType[type],newMap=newIndex.byType[type],entityResult={unchanged:[],modified:[],added:[],removed:[]};
      Object.keys(oldMap).forEach(function(key){if(!newMap[key])entityResult.removed.push(key);else if(diffComparable(oldMap[key].row)===diffComparable(newMap[key].row))entityResult.unchanged.push(key);else entityResult.modified.push(key);});
      Object.keys(newMap).forEach(function(key){if(!oldMap[key])entityResult.added.push(key);});
      var addedBySignature={};entityResult.added.forEach(function(key){var signature=churnComparable(newMap[key].row);(addedBySignature[signature]=addedBySignature[signature]||[]).push(key);});
      entityResult.removed.forEach(function(key){var signature=churnComparable(oldMap[key].row),matches=addedBySignature[signature];if(matches&&matches.length){matches.pop();result.summary.unexpectedKeyChurn+=1;}});
      entityResult.directModified=entityResult.modified.slice();result.entities[type]=entityResult;
    });
    function promote(type,key){var entity=result.entities[type];if(!key||!entity||entity.modified.indexOf(key)>=0||entity.added.indexOf(key)>=0||entity.removed.indexOf(key)>=0)return;var index=entity.unchanged.indexOf(key);if(index>=0){entity.unchanged.splice(index,1);entity.modified.push(key);}}
    function changedKeys(type){var entity=result.entities[type];return entity.modified.concat(entity.added,entity.removed);}
    changedKeys('drops').forEach(function(key){var item=newIndex.byType.drops[key]||oldIndex.byType.drops[key];promote('sets',text(item&&item.row.parentSetKey));});
    changedKeys('sets').forEach(function(key){var item=newIndex.byType.sets[key]||oldIndex.byType.sets[key];promote('exercises',text(item&&item.row.exerciseKey));});
    changedKeys('activitySegments').forEach(function(key){var item=newIndex.byType.activitySegments[key]||oldIndex.byType.activitySegments[key];promote('activities',text(item&&item.row.activityKey));});
    changedKeys('instructions').forEach(function(key){var item=newIndex.byType.instructions[key]||oldIndex.byType.instructions[key],row=item&&item.row,scope=text(row&&row.scopeType),scopeKey=text(row&&row.scopeKey);if(scope==='exercise')promote('exercises',scopeKey);else if(scope==='activity')promote('activities',scopeKey);else if(scope==='workout')promote('workouts',scopeKey);});
    changedKeys('exercises').forEach(function(key){var item=newIndex.byType.exercises[key]||oldIndex.byType.exercises[key];promote('workouts',text(item&&item.row.workoutKey));});
    changedKeys('activities').forEach(function(key){var item=newIndex.byType.activities[key]||oldIndex.byType.activities[key];promote('workouts',text(item&&item.row.workoutKey));});
    changedKeys('supersets').forEach(function(key){var item=newIndex.byType.supersets[key]||oldIndex.byType.supersets[key];promote('workouts',text(item&&item.row.workoutKey));});
    Object.keys(result.entities).forEach(function(type){['unchanged','modified','added','removed'].forEach(function(status){result.summary[status]+=result.entities[type][status].length;});});
    if(result.summary.unexpectedKeyChurn)result.errors.push('检测到 '+result.summary.unexpectedKeyChurn+' 个疑似随机重生成的稳定键');
    result.semanticStatus=result.errors.length?'FAIL':'PASS';return result;
  }

  global.PLANNER_V2_PROTOCOL=PROTOCOL;global.PLANNER_V2_PROTOCOL_VERSION=PROTOCOL_VERSION;global.PLANNER_V2_SCHEMA_VERSION=SCHEMA_VERSION;global.PLANNER_V2_GUIDE_SHEET=GUIDE_SHEET;global.PLANNER_V2_SHEETS=copy(SHEETS);global.PLANNER_V2_HEADERS=copy(HEADERS);global.PLANNER_V2_REQUIRED=copy(REQUIRED);global.PLANNER_V2_ENUMS=copy(ENUMS);global.PLANNER_V2_KEY_PATTERN=KEY_PATTERN;global.PLANNER_V2_VERSION_PATTERN=VERSION_PATTERN;
  global.detectPlannerV2Format=detectPlannerV2Format;global.validatePlannerV2Workbook=validatePlannerV2Workbook;global.buildPlannerV2ProgramDays=buildPlannerV2ProgramDays;global.parsePlannerV2Workbook=parsePlannerV2Workbook;global.diffPlannerV2Versions=diffPlannerV2Versions;
})(typeof window!=='undefined'?window:globalThis);
