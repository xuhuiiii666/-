/* Training plan handoff compiler. It converts supplied content without making training decisions. */
(function(global){
  'use strict';

  var SCHEMA_VERSION=1;
  var DATA_SHEET='训练器数据_v1';
  var SET_SHEET='组计划_v1';
  var SUPERSET_SHEET='超级组规则_v1';
  var HUMAN_SHEET='手机查看版_一日一格';
  var GUIDE_SHEET='填写说明';
  var SECTIONS=['功能模块','主项','主辅助','辅助','核心','康复/辅助','有氧','恢复','休息'];
  var TRAINING_ROLES=['pattern','hypertrophy','isolation','skill-acquisition','skill-retention'];
  var SET_TYPES=['working','technique','warmup','top','backoff','dropset'];
  var SUPERSET_MODES=['alternating'];
  var DATA_HEADERS=['schemaVersion','programName','workoutId','顺序','plannedDate','训练主题','targetDurationMin','section','trainingRole','exerciseId','动作顺序','动作名称','组数','次数下限','次数上限','RIR下限','RIR上限','建议重量','单位','休息下限秒','休息上限秒','动作秒数','动作备注','超级组ID','是否热身'];
  var SET_HEADERS=['workoutId','exerciseId','组号','setType','次数下限','次数上限','RIR下限','RIR上限','休息下限秒','休息上限秒','重量调整类型','重量调整值','技术提示'];
  var SUPERSET_HEADERS=['workoutId','超级组ID','超级组名称','mode','过渡下限秒','过渡上限秒','轮间休息下限秒','轮间休息上限秒','超级组备注'];

  function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function text(value){return String(value===undefined||value===null?'':value).trim();}
  function array(value){return Array.isArray(value)?value:[];}
  function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
  function numberOrNull(value){if(text(value)==='')return null;var number=Number(value);return isFinite(number)?number:null;}
  function positiveInteger(value){var number=numberOrNull(value);return number!==null&&number>=1&&Math.floor(number)===number;}
  function idNumber(number,width){return String(number).padStart(width,'0');}
  function isoDate(value){var raw=text(value);return !raw||/^\d{4}-\d{2}-\d{2}$/.test(raw);}
  function pairPresent(source,minField,maxField){return text(source[minField])!==''||text(source[maxField])!=='';}
  function rangeText(min,max,suffix){
    if(min===null||min===undefined||min==='') return '';
    return String(min)+(String(max)!==String(min)?'-'+String(max):'')+(suffix||'');
  }
  function compilerError(report){
    var error=new Error('训练内容结构稿校验失败：'+report.errors.join('；'));
    error.name='PlanCompileError';error.code='HANDOFF_VALIDATION_FAILED';error.report=report;return error;
  }
  function parseHandoffInput(input){
    if(typeof input!=='string') return copy(object(input));
    var raw=input.trim();
    if(!raw) return {};
    try{return JSON.parse(raw);}catch(error){
      var parseError=new Error('纯文本输入需要先由 Codex 按 TRAINING_PLAN_HANDOFF.md 归一化；plan-compiler 可直接接收对象或 JSON 文本。');
      parseError.name='PlanCompileError';parseError.code='HANDOFF_TEXT_NOT_NORMALIZED';throw parseError;
    }
  }
  function validateRange(report,source,minField,maxField,label,prefix,limits){
    limits=limits||{};
    if(!pairPresent(source,minField,maxField)) return;
    var min=numberOrNull(source[minField]),max=numberOrNull(source[maxField]);
    if(text(source[minField])===''||text(source[maxField])===''){report.errors.push(prefix+label+'上下限必须同时提供');return;}
    if(min===null||max===null){report.errors.push(prefix+label+'上下限必须是数字');return;}
    if(max<min) report.errors.push(prefix+label+'上限不能小于下限');
    if(limits.min!==undefined&&(min<limits.min||max<limits.min)) report.errors.push(prefix+label+'不能小于 '+limits.min);
    if(limits.max!==undefined&&(min>limits.max||max>limits.max)) report.errors.push(prefix+label+'不能大于 '+limits.max);
  }
  function resolveSupersetMembers(workout,superset,prefix,report){
    var exercises=array(workout.exercises);
    var members=array(superset.members&&superset.members.length?superset.members:superset.exerciseOrders);
    var orders=[];
    members.forEach(function(member){
      var order=numberOrNull(member&&typeof member==='object'?member.order:member);
      if(order!==null){orders.push(order);return;}
      var name=text(member&&typeof member==='object'?member.name:member);
      var matches=exercises.filter(function(exercise){return text(exercise.name)===name;});
      if(matches.length===1) orders.push(Number(matches[0].order));
      else if(matches.length>1) report.errors.push(prefix+'成员名称「'+name+'」重复，请改用动作 order');
      else report.errors.push(prefix+'找不到成员「'+name+'」');
    });
    return orders;
  }
  function validateHandoffInput(input){
    var source=typeof input==='string'?parseHandoffInput(input):copy(object(input));
    var report={format:'Training Plan Handoff v1',errors:[],warnings:[],stats:{workouts:0,exercises:0,sets:0,setPrescriptions:0,supersets:0},source:source,resolvedSupersets:{}};
    if(!text(source.programName)) report.errors.push('Program 缺少 programName');
    if(source.startDate&&!isoDate(source.startDate)) report.errors.push('Program startDate 必须为 YYYY-MM-DD');
    var workouts=array(source.workouts);
    if(!workouts.length) report.errors.push('Program 至少需要一个 Workout');
    var workoutOrders={};
    workouts.forEach(function(workout,workoutIndex){
      var wp='Workout '+(workoutIndex+1)+'：';
      if(!text(workout.title)) report.errors.push(wp+'缺少 title');
      if(!positiveInteger(workout.order)) report.errors.push(wp+'order 必须是正整数');
      else if(workoutOrders[Number(workout.order)]) report.errors.push(wp+'order 与其他 Workout 重复');
      else workoutOrders[Number(workout.order)]=true;
      if(workout.plannedDate&&!isoDate(workout.plannedDate)) report.errors.push(wp+'plannedDate 必须为 YYYY-MM-DD');
      var targetDuration=numberOrNull(workout.targetDurationMin);
      if(text(workout.targetDurationMin)!==''&&(targetDuration===null||targetDuration<=0)) report.errors.push(wp+'targetDurationMin 必须是正数');
      var exercises=array(workout.exercises);
      if(!exercises.length) report.errors.push(wp+'至少需要一个 Exercise');
      var exerciseOrders={};
      exercises.forEach(function(exercise,exerciseIndex){
        var ep=wp+'Exercise '+(exerciseIndex+1)+'：';
        if(!text(exercise.name)) report.errors.push(ep+'缺少 name');
        if(SECTIONS.indexOf(text(exercise.section))<0) report.errors.push(ep+'section 不合法');
        if(TRAINING_ROLES.indexOf(text(exercise.trainingRole))<0) report.errors.push(ep+'trainingRole 不合法');
        if(!positiveInteger(exercise.order)) report.errors.push(ep+'order 必须是正整数');
        else if(exerciseOrders[Number(exercise.order)]) report.errors.push(ep+'order 与同一 Workout 的动作重复');
        else exerciseOrders[Number(exercise.order)]=true;
        if(!positiveInteger(exercise.sets)) report.errors.push(ep+'sets 必须是正整数');
        validateRange(report,exercise,'repsMin','repsMax','reps',ep,{min:0});
        validateRange(report,exercise,'rirMin','rirMax','RIR',ep,{min:0,max:10});
        validateRange(report,exercise,'restMinSec','restMaxSec','rest',ep,{min:0});
        var duration=numberOrNull(exercise.durationSec);
        if(text(exercise.durationSec)!==''&&(duration===null||duration<=0)) report.errors.push(ep+'durationSec 必须是正数');
        var weight=numberOrNull(exercise.recommendedWeight);
        if(text(exercise.recommendedWeight)!==''&&(weight===null||weight<0)) report.errors.push(ep+'recommendedWeight 必须是非负数字');
        if(text(exercise.recommendedWeight)!==''&&['kg','lb'].indexOf(text(exercise.unit))<0) report.errors.push(ep+'填写 recommendedWeight 时 unit 必须是 kg 或 lb');
        if(text(exercise.unit)&&['kg','lb'].indexOf(text(exercise.unit))<0) report.errors.push(ep+'unit 只能是 kg 或 lb');
        var seenSets={};
        array(exercise.setPrescriptions||exercise.specialSets).forEach(function(set,setIndex){
          var sp=ep+'Set Prescription '+(setIndex+1)+'：';
          if(!positiveInteger(set.setNo)) report.errors.push(sp+'setNo 必须是正整数');
          else if(Number(set.setNo)>Number(exercise.sets)) report.errors.push(sp+'setNo 不能超过动作组数');
          else if(seenSets[Number(set.setNo)]) report.errors.push(sp+'setNo 重复');
          else seenSets[Number(set.setNo)]=true;
          if(SET_TYPES.indexOf(text(set.setType))<0) report.errors.push(sp+'setType 不合法');
          validateRange(report,set,'repsMin','repsMax','reps',sp,{min:0});
          validateRange(report,set,'rirMin','rirMax','RIR',sp,{min:0,max:10});
          validateRange(report,set,'restMinSec','restMaxSec','rest',sp,{min:0});
          var adjustmentType=text(set.loadAdjustmentType),adjustmentValue=numberOrNull(set.loadAdjustmentValue);
          if(adjustmentType&&['percent','absolute'].indexOf(adjustmentType)<0) report.errors.push(sp+'loadAdjustmentType 不合法');
          if((adjustmentType&&!text(set.loadAdjustmentValue))||(!adjustmentType&&text(set.loadAdjustmentValue))) report.errors.push(sp+'重量调整类型和值必须同时提供');
          if(text(set.loadAdjustmentValue)&&adjustmentValue===null) report.errors.push(sp+'loadAdjustmentValue 必须是数字');
          report.stats.setPrescriptions++;
        });
        report.stats.exercises++;report.stats.sets+=positiveInteger(exercise.sets)?Number(exercise.sets):0;
      });
      array(workout.supersets).forEach(function(superset,supersetIndex){
        var sp=wp+'Superset '+(supersetIndex+1)+'：';
        if(SUPERSET_MODES.indexOf(text(superset.mode))<0) report.errors.push(sp+'mode 第一版只允许 alternating');
        if(!pairPresent(superset,'transitionMinSec','transitionMaxSec')) report.errors.push(sp+'必须提供 transitionMinSec / transitionMaxSec');
        if(!pairPresent(superset,'roundRestMinSec','roundRestMaxSec')) report.errors.push(sp+'必须提供 roundRestMinSec / roundRestMaxSec');
        validateRange(report,superset,'transitionMinSec','transitionMaxSec','transition',sp,{min:0});
        validateRange(report,superset,'roundRestMinSec','roundRestMaxSec','roundRest',sp,{min:0});
        var orders=resolveSupersetMembers(workout,superset,sp,report);
        if(orders.length<2) report.errors.push(sp+'至少需要两个成员动作');
        var unique={};orders.forEach(function(order){
          if(!exerciseOrders[order]) report.errors.push(sp+'成员 order '+order+' 不存在');
          if(unique[order]) report.errors.push(sp+'成员 order '+order+' 重复');
          unique[order]=true;
        });
        report.resolvedSupersets[workoutIndex+'::'+supersetIndex]=orders;
        report.stats.supersets++;
      });
      report.stats.workouts++;
    });
    return report;
  }
  function normalizeProgram(input,report){
    var source=copy(report&&report.source||parseHandoffInput(input));
    var workouts=array(source.workouts).slice().sort(function(a,b){return Number(a.order)-Number(b.order);});
    var supersetCounter=0;
    var normalized={programName:text(source.programName),description:text(source.description),cycleLength:source.cycleLength===undefined?'':source.cycleLength,startDate:text(source.startDate),workouts:[]};
    workouts.forEach(function(workout,workoutIndex){
      var workoutId='W'+idNumber(workoutIndex+1,3);
      var sourceWorkoutIndex=array(source.workouts).indexOf(workout);
      var exercises=array(workout.exercises).slice().sort(function(a,b){return Number(a.order)-Number(b.order);});
      var nextWorkout={workoutId:workoutId,title:text(workout.title),order:Number(workout.order),plannedDate:text(workout.plannedDate),targetDurationMin:numberOrNull(workout.targetDurationMin),notes:text(workout.notes),exercises:[],supersets:[]};
      var byOrder={};
      exercises.forEach(function(exercise,exerciseIndex){
        var exerciseId=workoutId+'-E'+idNumber(exerciseIndex+1,2);
        var nextExercise=Object.assign({},copy(exercise),{exerciseId:exerciseId,order:Number(exercise.order),sets:Number(exercise.sets),name:text(exercise.name),section:text(exercise.section),trainingRole:text(exercise.trainingRole),setPrescriptions:array(exercise.setPrescriptions||exercise.specialSets).map(copy)});
        nextExercise.supersetId='';nextWorkout.exercises.push(nextExercise);byOrder[nextExercise.order]=nextExercise;
      });
      array(workout.supersets).forEach(function(superset,supersetIndex){
        supersetCounter++;
        var supersetId='SS'+idNumber(supersetCounter,2);
        var orders=report.resolvedSupersets[sourceWorkoutIndex+'::'+supersetIndex]||[];
        var rule={supersetId:supersetId,groupName:text(superset.groupName||superset.groupLabel),mode:text(superset.mode),transitionMinSec:numberOrNull(superset.transitionMinSec),transitionMaxSec:numberOrNull(superset.transitionMaxSec),roundRestMinSec:numberOrNull(superset.roundRestMinSec),roundRestMaxSec:numberOrNull(superset.roundRestMaxSec),note:text(superset.note),memberExerciseIds:[]};
        orders.forEach(function(order){if(byOrder[order]){byOrder[order].supersetId=supersetId;rule.memberExerciseIds.push(byOrder[order].exerciseId);}});
        nextWorkout.supersets.push(rule);
      });
      normalized.workouts.push(nextWorkout);
    });
    return normalized;
  }
  function buildStructuredRows(program){
    var rows=[DATA_HEADERS.slice()];
    program.workouts.forEach(function(workout){
      workout.exercises.forEach(function(exercise){
        rows.push([
          SCHEMA_VERSION,program.programName,workout.workoutId,workout.order,workout.plannedDate,workout.title,workout.targetDurationMin,
          exercise.section,exercise.trainingRole,exercise.exerciseId,exercise.order,exercise.name,exercise.sets,
          numberOrNull(exercise.repsMin),numberOrNull(exercise.repsMax),numberOrNull(exercise.rirMin),numberOrNull(exercise.rirMax),
          numberOrNull(exercise.recommendedWeight),text(exercise.unit),numberOrNull(exercise.restMinSec),numberOrNull(exercise.restMaxSec),
          numberOrNull(exercise.durationSec),text(exercise.note),exercise.supersetId,text(exercise.section)==='功能模块'?'TRUE':'FALSE'
        ]);
      });
    });
    return rows;
  }
  function buildSetPlanRows(program){
    var rows=[SET_HEADERS.slice()];
    program.workouts.forEach(function(workout){workout.exercises.forEach(function(exercise){
      array(exercise.setPrescriptions).forEach(function(set){rows.push([
        workout.workoutId,exercise.exerciseId,Number(set.setNo),text(set.setType),numberOrNull(set.repsMin),numberOrNull(set.repsMax),
        numberOrNull(set.rirMin),numberOrNull(set.rirMax),numberOrNull(set.restMinSec),numberOrNull(set.restMaxSec),
        text(set.loadAdjustmentType),numberOrNull(set.loadAdjustmentValue),text(set.techniqueCue)
      ]);});
    });});
    return rows;
  }
  function buildSupersetRows(program){
    var rows=[SUPERSET_HEADERS.slice()];
    program.workouts.forEach(function(workout){workout.supersets.forEach(function(rule){rows.push([
      workout.workoutId,rule.supersetId,rule.groupName,rule.mode,rule.transitionMinSec,rule.transitionMaxSec,
      rule.roundRestMinSec,rule.roundRestMaxSec,rule.note
    ]);});});
    return rows;
  }
  function buildHumanReadableSheet(program){
    var rows=[['Workout顺序','训练主题','目标时长分钟','section','动作顺序','动作名称','trainingRole','组数','次数','RIR','休息秒','特殊组','超级组']];
    program.workouts.forEach(function(workout){workout.exercises.forEach(function(exercise){
      rows.push([workout.order,workout.title,workout.targetDurationMin,exercise.section,exercise.order,exercise.name,exercise.trainingRole,exercise.sets,rangeText(exercise.repsMin,exercise.repsMax,''),rangeText(exercise.rirMin,exercise.rirMax,''),rangeText(exercise.restMinSec,exercise.restMaxSec,''),array(exercise.setPrescriptions).map(function(set){return 'Set'+set.setNo+' '+set.setType;}).join('；'),exercise.supersetId]);
    });});
    return rows;
  }
  function buildGuideRows(){
    return [
      ['训练器标准计划母版 v1'],
      ['Structured Import v1；本文件由 plan-compiler 根据 TRAINING_PLAN_HANDOFF.md 生成。'],
      ['训练器数据_v1 是机器主数据源；组计划_v1 写特殊组；超级组规则_v1 写交替超级组规则。'],
      ['手机查看版_一日一格只给人查看，不是机器主数据源。'],
      ['不要修改 Sheet 名、列名或合并机器数据单元格。'],
      ['训练规划 AI 不维护 schemaVersion、workoutId、exerciseId、setId 或超级组ID。']
    ];
  }
  function compileTrainingPlan(input){
    var source=parseHandoffInput(input);
    var handoffReport=validateHandoffInput(source);
    if(handoffReport.errors.length) throw compilerError(handoffReport);
    var program=normalizeProgram(source,handoffReport);
    var workbookData={SheetNames:[GUIDE_SHEET,DATA_SHEET,SET_SHEET,SUPERSET_SHEET,HUMAN_SHEET],Sheets:{}};
    workbookData.Sheets[GUIDE_SHEET]=buildGuideRows();
    workbookData.Sheets[DATA_SHEET]=buildStructuredRows(program);
    workbookData.Sheets[SET_SHEET]=buildSetPlanRows(program);
    workbookData.Sheets[SUPERSET_SHEET]=buildSupersetRows(program);
    workbookData.Sheets[HUMAN_SHEET]=buildHumanReadableSheet(program);
    var validation=null;
    if(typeof global.validateStructuredWorkbook==='function'){
      validation=global.validateStructuredWorkbook(workbookData,function(sheet){return sheet;});
      if(validation.errors.length){
        var error=new Error('编译结果未通过 Structured Import validation：'+validation.errors.join('；'));
        error.name='PlanCompileError';error.code='COMPILED_WORKBOOK_INVALID';error.report=validation;throw error;
      }
    }
    return {format:'training-plan-handoff-v1',schemaVersion:SCHEMA_VERSION,program:program,workbookData:workbookData,handoffValidation:handoffReport,structuredValidation:validation};
  }
  function validatedProgram(input){
    var source=parseHandoffInput(input),report=validateHandoffInput(source);
    if(report.errors.length) throw compilerError(report);
    return normalizeProgram(source,report);
  }

  global.HANDOFF_TRAINING_ROLES=TRAINING_ROLES.slice();
  global.HANDOFF_SUPERSET_MODES=SUPERSET_MODES.slice();
  global.PLAN_COMPILER_DATA_HEADERS=DATA_HEADERS.slice();
  global.PLAN_COMPILER_SET_HEADERS=SET_HEADERS.slice();
  global.PLAN_COMPILER_SUPERSET_HEADERS=SUPERSET_HEADERS.slice();
  global.parseHandoffInput=parseHandoffInput;
  global.validateHandoffInput=validateHandoffInput;
  global.normalizeHandoffProgram=normalizeProgram;
  global.assignWorkoutIds=function(input){return validatedProgram(input).workouts.map(function(workout){return workout.workoutId;});};
  global.assignExerciseIds=function(input){return validatedProgram(input).workouts.map(function(workout){return workout.exercises.map(function(exercise){return exercise.exerciseId;});});};
  global.assignSupersetIds=function(input){return validatedProgram(input).workouts.map(function(workout){return workout.supersets.map(function(rule){return rule.supersetId;});});};
  global.buildStructuredRows=buildStructuredRows;
  global.buildSetPlanRows=buildSetPlanRows;
  global.buildSupersetRows=buildSupersetRows;
  global.buildHumanReadableSheet=buildHumanReadableSheet;
  global.compileTrainingPlan=compileTrainingPlan;
})(typeof window!=='undefined'?window:globalThis);
