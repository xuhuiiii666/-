/* Program and Workout creation boundary. It does not own localStorage serialization. */
(function(global){
  'use strict';

  function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function nowIso(){return new Date().toISOString();}
  function asArray(value){return Array.isArray(value)?value:[];}
  function text(value){return String(value===undefined||value===null?'':value).trim();}
  function numberOrNull(value){
    if(typeof global.structuredNumber==='function') return global.structuredNumber(value);
    if(text(value)==='') return null;
    var number=Number(value);return isFinite(number)?number:null;
  }
  function commitCandidate(root){
    if(typeof global.saveRootCandidate!=='function') throw new Error('训练器存储边界尚未初始化。');
    return global.saveRootCandidate(root);
  }
  function withSourceWorkoutKeys(days,source){
    return copy(days||[]).map(function(day,index){
      day=day||{};
      if(!day.source)day.source=source||'imported';
      if(!day.sourceWorkoutKey&&typeof global.deriveSourceWorkoutKey==='function')day.sourceWorkoutKey=global.deriveSourceWorkoutKey(day,index,day.source||source);
      return day;
    });
  }

  function createProgramFromPlan(days,options){
    options=options||{};
    var source=options.source||'imported';
    return global.normalizeProgram({programId:options.programId,name:options.name||options.sourceFileName||'导入训练计划',source:source,sourceFileName:options.sourceFileName||'',days:withSourceWorkoutKeys(days,source)},options);
  }
  function addProgram(program,activate){
    var currentRoot=global.trainingTrackerState;
    var root=copy(currentRoot),profile=global.getActiveProfile(root);
    if(!currentRoot||!profile) throw new Error('当前训练档案不存在。');
    var next=global.normalizeProgram(program);
    profile.programs[next.programId]=next;
    if(activate!==false) root.activeProgramId=next.programId;
    commitCandidate(root);
    return next;
  }
  function uniqueWorkoutMap(days){
    var grouped={};asArray(days).forEach(function(day,index){var key=text(day&&day.sourceWorkoutKey);if(!key)return;(grouped[key]=grouped[key]||[]).push({day:day,index:index});});
    var unique={};Object.keys(grouped).forEach(function(key){if(grouped[key].length===1)unique[key]=grouped[key][0];});return unique;
  }
  function mapExecutionField(oldProgram,nextProgram,field,oldMap,newMap){
    var source=oldProgram[field]||{},target={};
    Object.keys(source).forEach(function(oldWorkoutId){
      var oldEntry=oldMap.byId[oldWorkoutId];if(!oldEntry)return;
      var match=newMap.bySource[text(oldEntry.day.sourceWorkoutKey)];if(!match)return;
      target[match.day.workoutId]=copy(source[oldWorkoutId]);
      if(field==='currentWorkoutDrafts'&&target[match.day.workoutId]){target[match.day.workoutId].workoutId=match.day.workoutId;target[match.day.workoutId].planIndex=match.index;}
    });
    nextProgram[field]=target;
  }
  function replacementMaps(days){
    var byId={};asArray(days).forEach(function(day,index){if(day&&day.workoutId)byId[day.workoutId]={day:day,index:index};});return {byId:byId,bySource:uniqueWorkoutMap(days)};
  }
  function mergeReplacementProgramState(oldProgram,newProgram){
    var next=copy(newProgram),oldMap=replacementMaps(oldProgram.days),newMap=replacementMaps(next.days);
    next.workoutLogs=copy(asArray(oldProgram.workoutLogs));
    ['actualDates','dateAnchors','completed','currentWorkoutDrafts','sessionStartedAt','endReminderFlags'].forEach(function(field){mapExecutionField(oldProgram,next,field,oldMap,newMap);});
    next.customWarmups={};
    Object.keys(oldProgram.customWarmups||{}).forEach(function(key){
      var match=key.match(/^workout_(.+)$/);if(!match){next.customWarmups[key]=copy(oldProgram.customWarmups[key]);return;}
      var oldEntry=oldMap.byId[match[1]],newEntry=oldEntry&&newMap.bySource[text(oldEntry.day.sourceWorkoutKey)];if(newEntry)next.customWarmups['workout_'+newEntry.day.workoutId]=copy(oldProgram.customWarmups[key]);
    });
    ['settings','currentSessionNote','noteArchive','keepNoteForNext','startDate'].forEach(function(field){if(oldProgram[field]!==undefined)next[field]=copy(oldProgram[field]);});
    var oldCurrent=oldMap.byId[oldProgram.currentWorkoutId],newCurrent=oldCurrent&&newMap.bySource[text(oldCurrent.day.sourceWorkoutKey)];
    if(newCurrent){next.currentIndex=newCurrent.index;next.currentWorkoutId=newCurrent.day.workoutId;next.selectedCalendarIndex=newCurrent.index;}
    else{next.currentIndex=0;next.currentWorkoutId=next.days[0]&&next.days[0].workoutId||'';next.selectedCalendarIndex=0;}
    var oldLogDraft=oldProgram.currentWorkoutLogDraft,matchedOldDraft=oldLogDraft&&typeof global.findUniqueWorkoutForRecord==='function'?global.findUniqueWorkoutForRecord(oldProgram,oldLogDraft):null;
    var mappedDraft=matchedOldDraft&&newMap.bySource[text(matchedOldDraft.sourceWorkoutKey)];
    if(oldLogDraft&&mappedDraft){next.currentWorkoutLogDraft=copy(oldLogDraft);next.currentWorkoutLogDraft.workoutId=mappedDraft.day.workoutId;next.currentWorkoutLogDraft.sourceWorkoutKey=mappedDraft.day.sourceWorkoutKey;next.currentWorkoutLogDraft.planIndex=mappedDraft.index;next.currentWorkoutLogDraft.title=mappedDraft.day.title||mappedDraft.day['训练主题']||next.currentWorkoutLogDraft.title;}
    else next.currentWorkoutLogDraft=null;
    var last=typeof global.deriveLastActualState==='function'?global.deriveLastActualState(next):null;next.lastActualIndex=last?last.index:null;next.lastActualDate=last?last.date:'';
    next.exerciseHistory=typeof global.buildExerciseHistoryFromLogs==='function'?global.buildExerciseHistoryFromLogs(next.workoutLogs):{};
    return next;
  }
  function replaceActiveProgram(program){
    var currentRoot=global.trainingTrackerState;
    var root=copy(currentRoot);
    var profile=global.getActiveProfile(root);
    if(!currentRoot||!profile||!root.activeProgramId) throw new Error('当前训练计划不存在。');
    var currentId=root.activeProgramId;
    var oldProgram=profile.programs[currentId];
    var next=global.normalizeProgram(Object.assign({},program,{programId:currentId}));
    next=mergeReplacementProgramState(oldProgram,next);
    profile.programs[currentId]=next;
    commitCandidate(root);
    return next;
  }
  function activateProgram(programId){
    var currentRoot=global.trainingTrackerState;
    var root=copy(currentRoot);
    var profile=global.getActiveProfile(root);
    if(!profile||!profile.programs[programId]) throw new Error('训练计划不存在。');
    root.activeProgramId=programId;
    commitCandidate(root);
    return global.getActiveProgram(root);
  }
  function createCustomWorkout(title,options){
    options=options||{};
    var program=global.getActiveProgram();
    if(!program) throw new Error('当前没有可写入的训练计划。');
    var stamp=nowIso();
    var cleanTitle=text(title||'我的训练')||'我的训练';
    var workout=global.normalizeWorkoutEntity({workoutId:global.createStableId('workout'),source:'custom',title:cleanTitle,'训练主题':cleanTitle,exercises:asArray(options.exercises),createdAt:stamp,updatedAt:stamp},program.days.length,program.programId,'custom');
    program.days.push(workout);
    program.updatedAt=stamp;
    if(options.activate){program.currentIndex=program.days.length-1;program.currentWorkoutId=workout.workoutId;}
    global.saveState();
    return workout;
  }
  function addExerciseToWorkout(workoutId,exercise){
    var program=global.getActiveProgram();
    var workout=asArray(program&&program.days).find(function(item){return item.workoutId===workoutId;});
    if(!workout) throw new Error('找不到要修改的训练。');
    var next=global.normalizeExerciseEntity(exercise,workout.exercises.length);
    workout.exercises.push(next);
    workout.updatedAt=nowIso();
    global.saveState();
    return next;
  }

  function setPrescriptionMap(report){
    var map={};
    asArray(report&&report.setRows).forEach(function(row){
      var key=text(row.workoutId)+'::'+text(row.exerciseId);
      map[key]=map[key]||[];
      map[key].push({
        setNo:Number(row['组号']),
        setType:text(row.setType),
        targetRepsMin:numberOrNull(row['次数下限']),
        targetRepsMax:numberOrNull(row['次数上限']),
        targetRirMin:numberOrNull(row['RIR下限']),
        targetRirMax:numberOrNull(row['RIR上限']),
        targetRestMin:numberOrNull(row['休息下限秒']),
        targetRestMax:numberOrNull(row['休息上限秒']),
        loadAdjustmentType:text(row['重量调整类型']),
        loadAdjustmentValue:numberOrNull(row['重量调整值']),
        techniqueCue:text(row['技术提示'])
      });
    });
    return map;
  }
  function supersetRuleMap(report){
    var map={};
    asArray(report&&report.supersetRows).forEach(function(row){
      var workoutId=text(row.workoutId);
      map[workoutId]=map[workoutId]||[];
      map[workoutId].push({
        supersetId:text(row['超级组ID']),groupName:text(row['超级组名称']),mode:text(row.mode),
        transitionMinSec:numberOrNull(row['过渡下限秒']),transitionMaxSec:numberOrNull(row['过渡上限秒']),
        roundRestMinSec:numberOrNull(row['轮间休息下限秒']),roundRestMaxSec:numberOrNull(row['轮间休息上限秒']),
        note:text(row['超级组备注'])
      });
    });
    return map;
  }
  function importedDate(value){
    if(typeof global.normalizeImportedDateCell==='function') return global.normalizeImportedDateCell(value);
    return text(value);
  }
  function buildStructuredProgramDays(report){
    if(!report||asArray(report.errors).length) throw new Error('Structured Import v1 必须先通过校验。');
    var setMap=setPrescriptionMap(report),supersetMap=supersetRuleMap(report),workoutMap={};
    asArray(report.dataRows).forEach(function(row){
      var workoutId=text(row.workoutId),exerciseId=text(row.exerciseId),section=text(row.section);
      var workout=workoutMap[workoutId];
      if(!workout){
        var plannedDate=importedDate(row.plannedDate);
        workout=workoutMap[workoutId]={workoutId:workoutId,sourceWorkoutId:workoutId,sourceWorkoutKey:'structured:'+workoutId,source:'structured-v1',order:Number(row['顺序']),plannedDate:plannedDate,date:plannedDate,title:text(row['训练主题']),programName:text(row.programName),targetDurationMin:numberOrNull(row.targetDurationMin),supersetRules:copy(supersetMap[workoutId]||[]),exercises:[]};
        workout['训练主题']=workout.title;
        workout['训练内容（组×次数/余力）']='';
        workout['导入热身内容']='';
      }
      var recommendedWeight=numberOrNull(row['建议重量']);
      var duration=numberOrNull(row['动作秒数']);
      var prescription={
        repsMin:numberOrNull(row['次数下限']),repsMax:numberOrNull(row['次数上限']),
        rirMin:numberOrNull(row['RIR下限']),rirMax:numberOrNull(row['RIR上限']),
        restMin:numberOrNull(row['休息下限秒']),restMax:numberOrNull(row['休息上限秒']),
        recommendedWeight:recommendedWeight===null?'':recommendedWeight,
        unit:text(row['单位'])||'kg'
      };
      var exercise={
        exerciseId:exerciseId,source:'structured-v1',section:section,trainingRole:text(row.trainingRole),
        isWarmup:global.structuredBoolean(row['是否热身']),order:Number(row['动作顺序']),
        name:text(row['动作名称']),trackingName:text(row['动作名称']),originalName:text(row['动作名称']),
        setCount:Number(row['组数']),duration:duration===null?'':duration,note:text(row['动作备注']),
        supersetId:text(row['超级组ID']),recommendedWeight:recommendedWeight===null?'':recommendedWeight,
        unit:text(row['单位'])||'kg',prescription:prescription,sets:[]
      };
      exercise=global.expandSetPrescription(exercise,exercise.setCount,setMap[workoutId+'::'+exerciseId]||[]);
      exercise.sets.forEach(function(set){
        set.prescriptionDefined=true;
        if(duration!==null) set.duration=duration;
      });
      workout.exercises.push(exercise);
    });
    return Object.keys(workoutMap).map(function(id){
      var workout=workoutMap[id];
      workout.exercises.sort(function(a,b){return a.order-b.order;});
      var main=workout.exercises.filter(function(exercise){return !exercise.isWarmup;});
      var warm=workout.exercises.filter(function(exercise){return exercise.isWarmup;});
      function summary(exercise){
        var target=exercise.prescription.repsMin!==null?exercise.prescription.repsMin:exercise.duration;
        return exercise.name+' '+exercise.setCount+'x'+(target===null||target===''?'-':target);
      }
      workout['导入热身内容']=warm.map(summary).join('\n');
      workout['训练内容（组×次数/余力）']=main.map(summary).join('\n');
      return workout;
    }).sort(function(a,b){return a.order-b.order;});
  }
  function createStandardProgram(report,file){
    if(!report||asArray(report.errors).length){
      if(typeof global.ImportError==='function') throw new global.ImportError('Structured Import v1 校验失败，没有修改当前训练计划。','STRUCTURED_VALIDATION_FAILED',{report:report});
      var error=new Error('Structured Import v1 校验失败，没有修改当前训练计划。');
      error.name='ImportError';error.code='STRUCTURED_VALIDATION_FAILED';error.report=report;error.details={report:report};throw error;
    }
    var plan=buildStructuredProgramDays(report);
    var programName=plan[0]&&plan[0].programName||'';
    return {format:'structured-v1',type:'Structured Import v1',planType:{id:'structured-v1',label:'Structured Import v1'},programName:programName,plan:plan,warmups:[],report:report,validation:{valid:true,dayCount:plan.length,duplicateDays:[]},sheetName:global.STRUCTURED_DATA_SHEET,source:'file',sourceFileName:file&&file.name||'',candidates:[global.STRUCTURED_DATA_SHEET]};
  }

  global.createProgramFromPlan=createProgramFromPlan;
  global.addProgram=addProgram;
  global.replaceActiveProgram=replaceActiveProgram;
  global.mergeReplacementProgramState=mergeReplacementProgramState;
  global.activateProgram=activateProgram;
  global.createCustomWorkout=createCustomWorkout;
  global.addExerciseToWorkout=addExerciseToWorkout;
  global.buildStructuredProgramDays=buildStructuredProgramDays;
  global.createStandardProgram=createStandardProgram;
})(typeof window!=='undefined'?window:globalThis);
