/* Structured Import v1 validation. This module never mutates training state. */
(function(global){
  'use strict';

  var DATA_SHEET='训练器数据_v1';
  var SET_SHEET='组计划_v1';
  var SUPERSET_SHEET='超级组规则_v1';
  var DATA_HEADERS=['schemaVersion','programName','workoutId','顺序','plannedDate','训练主题','targetDurationMin','section','trainingRole','exerciseId','动作顺序','动作名称','组数','次数下限','次数上限','RIR下限','RIR上限','建议重量','单位','休息下限秒','休息上限秒','动作秒数','动作备注','超级组ID','是否热身'];
  var DATA_REQUIRED_HEADERS=['schemaVersion','programName','workoutId','顺序','plannedDate','训练主题','section','exerciseId','动作顺序','动作名称','组数','次数下限','次数上限','RIR下限','RIR上限','建议重量','单位','休息下限秒','休息上限秒','动作秒数','动作备注','超级组ID','是否热身'];
  var SET_HEADERS=['workoutId','exerciseId','组号','setType','次数下限','次数上限','RIR下限','RIR上限','休息下限秒','休息上限秒','重量调整类型','重量调整值','技术提示'];
  var SUPERSET_HEADERS=['workoutId','超级组ID','超级组名称','mode','过渡下限秒','过渡上限秒','轮间休息下限秒','轮间休息上限秒','超级组备注'];
  var SECTIONS=['功能模块','主项','主辅助','辅助','核心','康复/辅助','有氧','恢复','休息'];
  var TRAINING_ROLES=['pattern','hypertrophy','isolation','skill-acquisition','skill-retention'];
  var SET_TYPES=['working','technique','warmup','top','backoff','dropset'];
  var SUPERSET_MODES=['alternating'];
  var ID_PATTERN=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

  function text(value){return String(value===undefined||value===null?'':value).trim();}
  function numberOrNull(value){
    if(text(value)==='') return null;
    var number=Number(value);
    return isFinite(number)?number:null;
  }
  function headerMap(headers){
    var map={};
    (headers||[]).forEach(function(header,index){map[text(header)]=index;});
    return map;
  }
  function missingHeaders(rows,required){
    var map=headerMap(rows&&rows[0]||[]);
    return required.filter(function(header){return map[header]===undefined;});
  }
  function rowsToObjects(rows){
    if(!Array.isArray(rows)||!rows.length) return [];
    var map=headerMap(rows[0]);
    return rows.slice(1).map(function(row,rowIndex){
      var object={_row:rowIndex+2};
      Object.keys(map).forEach(function(header){object[header]=row[map[header]]===undefined?'':row[map[header]];});
      return object;
    }).filter(function(row){return Object.keys(row).some(function(key){return key!=='_row'&&text(row[key])!=='';});});
  }
  function parseBoolean(value){
    var normalized=text(value).toLowerCase();
    if(['1','true','是'].indexOf(normalized)>=0) return {valid:true,value:true};
    if(['0','false','否'].indexOf(normalized)>=0) return {valid:true,value:false};
    return {valid:false,value:false};
  }
  function positiveInteger(value){
    var number=numberOrNull(value);
    return number!==null&&number>=1&&Math.floor(number)===number;
  }
  function validateRange(report,row,minField,maxField,label,options,prefix){
    options=options||{};
    prefix=prefix||('第 '+row._row+' 行 ');
    var minText=text(row[minField]),maxText=text(row[maxField]);
    var min=numberOrNull(row[minField]),max=numberOrNull(row[maxField]);
    if(!minText&&!maxText) return;
    if(!minText||!maxText){report.errors.push(prefix+label+'上下限必须同时填写或同时留空');return;}
    if(min===null) report.errors.push(prefix+label+'下限必须是数字');
    if(max===null) report.errors.push(prefix+label+'上限必须是数字');
    if(min===null||max===null) return;
    if(max<min) report.errors.push(prefix+label+'上限不能小于下限');
    if(options.min!==undefined&&(min<options.min||max<options.min)) report.errors.push(prefix+label+'不能小于 '+options.min);
    if(options.max!==undefined&&(min>options.max||max>options.max)) report.errors.push(prefix+label+'不能大于 '+options.max);
  }
  function sectionMarker(value){
    var clean=text(value).replace(/^【\s*/,'').replace(/\s*】$/,'');
    return SECTIONS.indexOf(clean)>=0;
  }
  function validIsoDate(value){
    var valueText=text(value);
    if(!valueText) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(valueText)&&!isNaN(new Date(valueText+'T00:00:00Z').getTime());
  }
  function addRequiredErrors(report,row,fields,prefix){
    fields.forEach(function(field){if(text(row[field])==='') report.errors.push(prefix+'缺少 '+field);});
  }
  function validateStructuredWorkbook(workbook,readRows){
    var report={format:'Structured Import v1',errors:[],warnings:[],checks:[],stats:{workouts:0,exercises:0,sets:0,specialSets:0,supersetRules:0},dataRows:[],setRows:[],supersetRows:[]};
    var sheetNames=workbook&&Array.isArray(workbook.SheetNames)?workbook.SheetNames:[];
    if(sheetNames.indexOf(DATA_SHEET)<0){report.errors.push('缺少必需工作表「'+DATA_SHEET+'」');return report;}
    readRows=typeof readRows==='function'?readRows:global.rowsFromSheet;
    if(typeof readRows!=='function'){report.errors.push('Structured Import v1 无法读取工作表');return report;}

    var dataRows=readRows(workbook.Sheets&&workbook.Sheets[DATA_SHEET]);
    var missing=missingHeaders(dataRows,DATA_REQUIRED_HEADERS);
    if(missing.length){report.errors.push('「'+DATA_SHEET+'」缺少列：'+missing.join('、'));return report;}
    var dataColumns=headerMap(dataRows&&dataRows[0]||[]);
    var hasTrainingRoleColumn=dataColumns.trainingRole!==undefined;
    report.dataRows=rowsToObjects(dataRows);
    if(!report.dataRows.length) report.errors.push('「'+DATA_SHEET+'」没有动作数据');

    var exerciseByKey={};
    var exerciseIds={};
    var workouts={};
    var workoutOrders={};
    var exerciseOrders={};
    var supersetMembers={};
    var programName='';

    report.dataRows.forEach(function(row){
      var prefix='第 '+row._row+' 行 ';
      addRequiredErrors(report,row,['schemaVersion','programName','workoutId','顺序','训练主题','section','exerciseId','动作顺序','动作名称','组数','是否热身'],prefix);
      if(text(row.schemaVersion)!=='1') report.errors.push(prefix+'schemaVersion 必须为 1');
      if(!programName) programName=text(row.programName);
      else if(text(row.programName)!==programName) report.errors.push(prefix+'programName 必须与主表其他行一致');

      var workoutId=text(row.workoutId),exerciseId=text(row.exerciseId),section=text(row.section);
      if(workoutId&&!ID_PATTERN.test(workoutId)) report.errors.push(prefix+'workoutId 不合法，只允许字母开头的字母、数字、下划线和连字符，最长 64 位');
      if(exerciseId&&!ID_PATTERN.test(exerciseId)) report.errors.push(prefix+'exerciseId 不合法，只允许字母开头的字母、数字、下划线和连字符，最长 64 位');
      if(SECTIONS.indexOf(section)<0) report.errors.push(prefix+'section 不受支持：'+section);
      var trainingRole=text(row.trainingRole);
      if(hasTrainingRoleColumn&&!trainingRole) report.errors.push(prefix+'缺少 trainingRole');
      if(trainingRole&&TRAINING_ROLES.indexOf(trainingRole)<0) report.errors.push(prefix+'trainingRole 只能是 '+TRAINING_ROLES.join('/'));
      if(sectionMarker(row['动作名称'])) report.errors.push(prefix+'动作名称不能是 section 标题或 section 标记');
      if(!positiveInteger(row['顺序'])) report.errors.push(prefix+'顺序必须是正整数');
      if(!positiveInteger(row['动作顺序'])) report.errors.push(prefix+'动作顺序必须是正整数');
      if(!positiveInteger(row['组数'])) report.errors.push(prefix+'组数必须是正整数');
      if(!validIsoDate(row.plannedDate)) report.errors.push(prefix+'plannedDate 必须为 YYYY-MM-DD 或留空');
      var targetDuration=numberOrNull(row.targetDurationMin);
      if(text(row.targetDurationMin)!==''&&(targetDuration===null||targetDuration<=0)) report.errors.push(prefix+'targetDurationMin 必须是正数或留空');

      validateRange(report,row,'次数下限','次数上限','次数',{min:0},prefix);
      validateRange(report,row,'RIR下限','RIR上限','RIR',{min:0,max:10},prefix);
      validateRange(report,row,'休息下限秒','休息上限秒','休息秒数',{min:0},prefix);
      var duration=numberOrNull(row['动作秒数']);
      if(text(row['动作秒数'])!==''&&(duration===null||duration<=0)) report.errors.push(prefix+'动作秒数必须是正数或留空');
      var weight=numberOrNull(row['建议重量']);
      if(text(row['建议重量'])!==''&&(weight===null||weight<0)) report.errors.push(prefix+'建议重量必须是非负数字或留空');
      var unit=text(row['单位']);
      if(unit&&['kg','lb'].indexOf(unit)<0) report.errors.push(prefix+'单位只能是 kg、lb 或留空');
      if(text(row['建议重量'])!==''&&!unit) report.errors.push(prefix+'填写建议重量时必须填写单位');
      var booleanValue=parseBoolean(row['是否热身']);
      if(!booleanValue.valid) report.errors.push(prefix+'是否热身只能是 是/否、true/false 或 1/0');

      var workout=workouts[workoutId];
      var metadata={order:text(row['顺序']),plannedDate:text(row.plannedDate),title:text(row['训练主题']),targetDurationMin:text(row.targetDurationMin)};
      if(!workout){
        workouts[workoutId]=metadata;
        if(workoutOrders[metadata.order]&&workoutOrders[metadata.order]!==workoutId) report.errors.push(prefix+'训练顺序与 workoutId '+workoutOrders[metadata.order]+' 重复');
        workoutOrders[metadata.order]=workoutId;
      }else if(workout.order!==metadata.order||workout.plannedDate!==metadata.plannedDate||workout.title!==metadata.title||workout.targetDurationMin!==metadata.targetDurationMin){
        report.errors.push(prefix+'同一 workoutId 的顺序、plannedDate、训练主题和 targetDurationMin 必须一致');
      }

      var key=workoutId+'::'+exerciseId;
      if(exerciseByKey[key]) report.errors.push(prefix+'workoutId + exerciseId 重复');
      exerciseByKey[key]=row;
      if(exerciseIds[exerciseId]) report.errors.push(prefix+'exerciseId 必须在整个工作簿中唯一，已出现在第 '+exerciseIds[exerciseId]+' 行');
      else exerciseIds[exerciseId]=row._row;
      var orderKey=workoutId+'::'+text(row['动作顺序']);
      if(exerciseOrders[orderKey]) report.errors.push(prefix+'同一训练日的动作顺序重复');
      exerciseOrders[orderKey]=true;

      var supersetId=text(row['超级组ID']);
      if(supersetId){
        var supersetKey=workoutId+'::'+supersetId;
        supersetMembers[supersetKey]=supersetMembers[supersetKey]||[];
        supersetMembers[supersetKey].push(row);
      }
      report.stats.sets+=positiveInteger(row['组数'])?Number(row['组数']):0;
    });

    Object.keys(supersetMembers).forEach(function(key){
      if(supersetMembers[key].length<2) report.errors.push('超级组ID '+key.split('::').slice(1).join('::')+' 在同一训练日中至少需要两个动作');
    });

    if(sheetNames.indexOf(SET_SHEET)>=0){
      var setRows=readRows(workbook.Sheets&&workbook.Sheets[SET_SHEET]);
      var setMissing=missingHeaders(setRows,SET_HEADERS);
      if(setMissing.length) report.errors.push('「'+SET_SHEET+'」缺少列：'+setMissing.join('、'));
      else report.setRows=rowsToObjects(setRows);
    }else{
      report.warnings.push('未提供「'+SET_SHEET+'」，所有组将按 working 生成');
    }

    var seenSets={};
    report.setRows.forEach(function(row){
      var prefix='组计划第 '+row._row+' 行 ';
      addRequiredErrors(report,row,['workoutId','exerciseId','组号','setType'],prefix);
      var workoutId=text(row.workoutId),exerciseId=text(row.exerciseId),key=workoutId+'::'+exerciseId;
      var source=exerciseByKey[key];
      if(!source) report.errors.push(prefix+'找不到对应动作 '+key);
      var setNo=numberOrNull(row['组号']);
      if(!positiveInteger(row['组号'])) report.errors.push(prefix+'组号必须是正整数');
      if(source&&setNo>Number(source['组数'])) report.errors.push(prefix+'组号超过动作组数');
      var setType=text(row.setType);
      if(SET_TYPES.indexOf(setType)<0) report.errors.push(prefix+'setType 只能是 '+SET_TYPES.join('/'));
      var setKey=key+'::'+text(row['组号']);
      if(seenSets[setKey]) report.errors.push(prefix+'同一动作组号重复');
      seenSets[setKey]=true;
      validateRange(report,row,'次数下限','次数上限','次数',{min:0},prefix);
      validateRange(report,row,'RIR下限','RIR上限','RIR',{min:0,max:10},prefix);
      validateRange(report,row,'休息下限秒','休息上限秒','休息秒数',{min:0},prefix);
      var adjustmentType=text(row['重量调整类型']),adjustmentText=text(row['重量调整值']),adjustment=numberOrNull(row['重量调整值']);
      if(adjustmentType&&['percent','absolute'].indexOf(adjustmentType)<0) report.errors.push(prefix+'重量调整类型只能是 percent、absolute 或留空');
      if((adjustmentType&&!adjustmentText)||(!adjustmentType&&adjustmentText)) report.errors.push(prefix+'重量调整类型和重量调整值必须同时填写或同时留空');
      if(adjustmentText&&adjustment===null) report.errors.push(prefix+'重量调整值必须是数字');
    });

    if(sheetNames.indexOf(SUPERSET_SHEET)>=0){
      var supersetRows=readRows(workbook.Sheets&&workbook.Sheets[SUPERSET_SHEET]);
      var supersetMissing=missingHeaders(supersetRows,SUPERSET_HEADERS);
      if(supersetMissing.length) report.errors.push('「'+SUPERSET_SHEET+'」缺少列：'+supersetMissing.join('、'));
      else report.supersetRows=rowsToObjects(supersetRows);
    }else if(Object.keys(supersetMembers).length){
      report.warnings.push('未提供「'+SUPERSET_SHEET+'」，超级组按旧 Structured v1 规则仅保留动作分组关系');
    }

    var seenSupersetRules={};
    report.supersetRows.forEach(function(row){
      var prefix='超级组规则第 '+row._row+' 行 ';
      addRequiredErrors(report,row,['workoutId','超级组ID','mode','过渡下限秒','过渡上限秒','轮间休息下限秒','轮间休息上限秒'],prefix);
      var workoutId=text(row.workoutId),supersetId=text(row['超级组ID']),key=workoutId+'::'+supersetId;
      if(seenSupersetRules[key]) report.errors.push(prefix+'同一 workoutId + 超级组ID 规则重复');
      seenSupersetRules[key]=true;
      if(!supersetMembers[key]) report.errors.push(prefix+'找不到主表中的超级组成员 '+key);
      var mode=text(row.mode);
      if(SUPERSET_MODES.indexOf(mode)<0) report.errors.push(prefix+'mode 第一版只允许 alternating');
      validateRange(report,row,'过渡下限秒','过渡上限秒','动作间过渡秒数',{min:0},prefix);
      validateRange(report,row,'轮间休息下限秒','轮间休息上限秒','轮间休息秒数',{min:0},prefix);
    });
    if(sheetNames.indexOf(SUPERSET_SHEET)>=0){
      Object.keys(supersetMembers).forEach(function(key){if(!seenSupersetRules[key]) report.errors.push('超级组 '+key+' 缺少「'+SUPERSET_SHEET+'」规则');});
    }

    report.stats.workouts=Object.keys(workouts).filter(Boolean).length;
    report.stats.exercises=report.dataRows.length;
    report.stats.specialSets=report.setRows.length;
    report.stats.supersetRules=report.supersetRows.length;
    if(!report.errors.length){
      report.checks.push('固定工作表与列校验通过');
      report.checks.push('Program、Workout、Exercise 稳定 ID 校验通过');
      report.checks.push('section、布尔值、数值范围和时间字段校验通过');
      report.checks.push('特殊组引用、组号和 setType 校验通过');
      report.checks.push('超级组关联与 alternating 规则校验通过');
    }
    return report;
  }

  global.STRUCTURED_DATA_SHEET=DATA_SHEET;
  global.STRUCTURED_SET_SHEET=SET_SHEET;
  global.STRUCTURED_SUPERSET_SHEET=SUPERSET_SHEET;
  global.STRUCTURED_DATA_HEADERS=DATA_HEADERS.slice();
  global.STRUCTURED_DATA_REQUIRED_HEADERS=DATA_REQUIRED_HEADERS.slice();
  global.STRUCTURED_SET_HEADERS=SET_HEADERS.slice();
  global.STRUCTURED_SUPERSET_HEADERS=SUPERSET_HEADERS.slice();
  global.STRUCTURED_SECTIONS=SECTIONS.slice();
  global.STRUCTURED_TRAINING_ROLES=TRAINING_ROLES.slice();
  global.STRUCTURED_ID_PATTERN=ID_PATTERN;
  global.structuredHeaderMap=headerMap;
  global.structuredRowsToObjects=rowsToObjects;
  global.missingStructuredHeaders=missingHeaders;
  global.structuredNumber=numberOrNull;
  global.parseStructuredBoolean=parseBoolean;
  global.structuredBoolean=function(value){return parseBoolean(value).value;};
  global.validateStructuredWorkbook=validateStructuredWorkbook;
})(typeof window!=='undefined'?window:globalThis);
