/* Semantic adapter for AI/authored long-form one-day-per-row training plans. */
(function(global){
  'use strict';

  var REQUIRED_HEADERS=['顺序日','周次','周内日','类型','主题','今日内容（整格照做）'];
  var WORKOUT_TYPE_MAP={
    '力量训练':'strength','力量＋有氧':'strength-cardio','力量+有氧':'strength-cardio',
    '完全休息':'rest','攀岩':'climbing','减载训练':'deload-strength','减载攀岩':'deload-climbing'
  };
  var INSTRUCTION_CATEGORY={
    '周期位置':'cycle','本轮渐进':'progression','本块增量':'progression','容量门槛':'volume',
    '执行规则':'execution','记录':'record','恢复优先':'recovery','恢复检查':'recovery-check',
    '调整阈值':'adjustment','停止':'stop','96天收官复盘':'review'
  };

  function text(value){return String(value===undefined||value===null?'':value).trim();}
  function normalize(value){return text(value).replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/[—–～~至]/g,'-').replace(/[×＊*]/g,'×');}
  function compact(value){return text(value).toLowerCase().replace(/[\s（）()【】｜|：:；;，,。\.\-_/]+/g,'');}
  function number(value){if(value===null||value===undefined||text(value)==='')return null;var parsed=Number(value);return isFinite(parsed)?parsed:null;}
  function range(value){
    var source=normalize(value),match=source.match(/(-?\d+(?:\.\d+)?)(?:\s*-\s*(-?\d+(?:\.\d+)?))?/);
    if(!match)return {min:null,max:null};
    var min=number(match[1]),max=number(match[2]||match[1]);
    return min!==null&&max!==null&&max<min?{min:max,max:min}:{min:min,max:max};
  }
  function stableHash(value){
    var hash=2166136261,source=String(value||'');
    for(var i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return (hash>>>0).toString(36);
  }
  function pad(value,size){return String(value).padStart(size||2,'0');}
  function rowValues(row){return Array.isArray(row)?row:[];}
  function headerMap(headers){var map={};rowValues(headers).forEach(function(value,index){map[text(value).replace(/[\s\uFEFF]/g,'')]=index;});return map;}
  function valueAt(row,map,name){var index=map[String(name).replace(/\s/g,'')];return index===undefined?'':rowValues(row)[index];}

  function longFormHeaderIndex(rows){
    for(var i=0;i<Math.min(rows.length,20);i++){
      var values=rowValues(rows[i]).map(function(value){return text(value).replace(/[\s\uFEFF]/g,'');});
      if(REQUIRED_HEADERS.every(function(header){return values.indexOf(header.replace(/\s/g,''))>=0;}))return i;
    }
    return -1;
  }
  function detectLongFormDailyGrid(input,sheetName){
    var rows=Array.isArray(input)?input:[];
    if(rows.length<2)return false;
    var headerIndex=longFormHeaderIndex(rows);
    if(headerIndex<0)return false;
    var map=headerMap(rows[headerIndex]),sample=rows.slice(headerIndex+1,headerIndex+25).filter(function(row){return text(valueAt(row,map,'顺序日'))||text(valueAt(row,map,'主题'))||text(valueAt(row,map,'今日内容（整格照做）'));}),recognizedTypes=0,richRows=0;
    sample.forEach(function(row){
      if(WORKOUT_TYPE_MAP[text(valueAt(row,map,'类型'))])recognizedTypes++;
      var content=text(valueAt(row,map,'今日内容（整格照做）'));
      if(/【周期位置】/.test(content)&&/【本轮渐进】/.test(content)&&(/【主训练】|【完全休息】|【技术主课】|【整合\/自由爬】/.test(content)))richRows++;
    });
    return sample.length>0&&recognizedTypes>0&&richRows>0;
  }

  function parseSetSequence(value,count){
    var source=normalize(value);
    if(source.indexOf('→')<0)return null;
    var parts=source.split(/\s*→\s*/).map(function(part){return range(part);});
    if(!parts.length||parts.some(function(item){return item.min===null;}))return null;
    if(count&&parts.length!==count)return null;
    return parts;
  }

  function parseMeasure(value){
    var source=normalize(value).replace(/\s/g,'');
    var perSide=/\/侧|每侧/.test(source);
    var unit='reps';
    if(/秒|sec|\bs\b/i.test(source))unit='seconds';
    else if(/分钟|min/i.test(source))unit='minutes';
    else if(/米/.test(source))unit='meters';
    else if(/条/.test(source))unit='routes';
    var parsed=range(source);
    return {min:parsed.min,max:parsed.max,repsUnit:unit,measureUnit:unit,perSide:perSide};
  }

  function restRange(value){
    var source=normalize(value),match=source.match(/(?:休(?:息)?|间歇)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(秒|s|分钟|min)?/i);
    if(!match)return {min:null,max:null};
    var min=number(match[1]),max=number(match[2]||match[1]);
    if(/分钟|min/i.test(match[3]||'')){min*=60;max*=60;}
    return {min:min,max:max};
  }
  function rirRange(value){var match=normalize(value).match(/(?:余力|RIR)\s*[:：]?\s*([\d.]+(?:\s*-\s*[\d.]+)?)/i);return match?range(match[1]):{min:null,max:null};}
  function rpeRange(value){var match=normalize(value).match(/RPE\s*([\d.]+(?:\s*-\s*[\d.]+)?)/i);return match?range(match[1]):{min:null,max:null};}
  function percentRange(value){var match=normalize(value).match(/(\d+(?:\.\d+)?)%\s*-\s*(\d+(?:\.\d+)?)%/);return match?range(match[1]+'-'+match[2]):{min:null,max:null};}

  function setEntity(baseId,setNo,setType,targets){
    targets=targets||{};
    return {
      setId:baseId+':set:'+pad(setNo),setNo:setNo,setType:setType||'working',
      weight:'',unit:'kg',weightKg:0,reps:'',rir:'',duration:'',rest:number(targets.restMinSec)||90,
      note:'',completed:false,timerState:'idle',prescriptionDefined:true,
      targetRepsMin:number(targets.repsMin),targetRepsMax:number(targets.repsMax),
      targetRirMin:number(targets.rirMin),targetRirMax:number(targets.rirMax),
      targetRestMin:number(targets.restMinSec),targetRestMax:number(targets.restMaxSec),
      repsUnit:targets.repsUnit||'reps',measureUnit:targets.measureUnit||targets.repsUnit||'reps',perSide:!!targets.perSide,
      loadAdjustmentType:targets.loadAdjustmentType||'',loadAdjustmentValue:number(targets.loadAdjustmentValue),
      techniqueCue:text(targets.techniqueCue)
    };
  }

  function roleFor(section,statement){
    var source=text(statement),kind=section&&section.heading&&section.heading.sectionType;
    if(kind==='skill')return 'skill-retention';
    if(/技术暴露|技术维持|轨迹熟练|基本功|功能打磨/.test(source))return 'skill-retention';
    if(kind==='strength'&&/^主训练/.test(section.heading.baseTitle))return 'pattern';
    if(/孤立|局部/.test(source))return 'isolation';
    if(kind==='strength'||kind==='superset')return 'hypertrophy';
    return 'general';
  }

  function parseExerciseStatement(statement,context){
    var raw=text(statement).replace(/^[-•]\s*/,'');
    var memberMatch=raw.match(/^([A-Za-z]+\d+)\s+/),memberLabel=memberMatch?memberMatch[1].toUpperCase():'';
    if(memberMatch)raw=raw.slice(memberMatch[0].length);
    var parts=raw.split(/[｜|]/).map(text).filter(Boolean),name=parts[0]||'';
    var setPart=parts.find(function(part){return /\d+\s*组\s*×/.test(part);})||'';
    var setMatch=normalize(setPart).match(/(\d+)\s*组\s*×\s*(.+)$/);
    if(!name||!setMatch)return null;
    var count=Number(setMatch[1])||1,measure=parseMeasure(setMatch[2]),rir=rirRange(raw),rest=restRange(raw);
    var rirSource=(raw.match(/(?:余力|RIR)\s*[:：]?\s*([^｜|；;]+)/i)||[])[1]||'';
    var repsSource=setMatch[2].replace(/(?:次|下|秒|分钟|米|条)(?:\/侧)?\s*$/,'');
    var rirSequence=parseSetSequence(rirSource,count),repsSequence=parseSetSequence(repsSource,count);
    var exerciseId=context.workoutKey+':exercise:'+pad(context.exerciseNo),sets=[];
    for(var i=0;i<count;i++){
      var repsTarget=repsSequence?repsSequence[i]:measure,rirTarget=rirSequence?rirSequence[i]:rir;
      sets.push(setEntity(exerciseId,i+1,'working',{
        repsMin:repsTarget.min,repsMax:repsTarget.max,rirMin:rirTarget.min,rirMax:rirTarget.max,
        restMinSec:rest.min,restMaxSec:rest.max,repsUnit:measure.repsUnit,measureUnit:measure.measureUnit,perSide:measure.perSide
      }));
    }
    var displayReps=measure.min===null?'':String(measure.min)+(measure.max!==measure.min?'-'+measure.max:'');
    var displayRir=rir.min===null?'':String(rir.min)+(rir.max!==rir.min?'-'+rir.max:'');
    return {
      exerciseId:exerciseId,source:'long-form-daily',name:name,trackingName:name,originalName:name,line:statement,
      section:context.section.heading.baseTitle,sectionType:context.section.heading.sectionType,trainingRole:roleFor(context.section,statement),
      setCount:count,sets:sets,reps:displayReps,rir:displayRir,rest:rest.min===null?null:{min:rest.min,max:rest.max,def:rest.min},
      repsMin:measure.min,repsMax:measure.max,repsUnit:measure.repsUnit,measureUnit:measure.measureUnit,perSide:measure.perSide,
      rirMin:rir.min,rirMax:rir.max,restMinSec:rest.min,restMaxSec:rest.max,
      countsAsWorkingSet:context.section.heading.countsAsWorkingSets,
      countsAsHypertrophySet:context.section.heading.countsAsHypertrophyVolume,
      memberLabel:memberLabel,techniqueCue:''
    };
  }

  function parseDropSet(statement,context){
    var raw=text(statement),parts=raw.split(/\s*→\s*/);
    if(parts.length<3||!/递减/.test(raw))return null;
    var name=text((parts[0].match(/^(.+?)(?:末组双递减|末组递减|双递减|递减)[:：]/)||[])[1]||'');
    var rest=restRange(raw),exerciseId=context.workoutKey+':exercise:'+pad(context.exerciseNo);
    var segments=parts.slice(0,3).map(function(part,index){
      var repsMatch=normalize(part).match(/(?:主重量)?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*次|做\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*次/);
      var repsMin=number(repsMatch&&(repsMatch[1]||repsMatch[3])),repsMax=number(repsMatch&&(repsMatch[2]||repsMatch[4]||repsMin));
      var rir=rirRange(part),percent=percentRange(part),transition={min:null,max:null},transitionMatch=normalize(part).match(/(\d+)\s*-\s*(\d+)\s*秒(?:内|后)?(?:减重|切换)/);
      if(transitionMatch)transition={min:number(transitionMatch[1]),max:number(transitionMatch[2])};
      if(index===2&&transition.min===null)transition={min:0,max:15};
      return {
        segmentNo:index+1,label:index===0?'主段':'降重'+index,
        repsMin:repsMin,repsMax:repsMax,rirMin:rir.min,rirMax:rir.max,
        loadAdjustmentType:index===0?'':'percent',loadAdjustmentMin:index===0?null:(percent.max===null?null:-percent.max),
        loadAdjustmentMax:index===0?null:(percent.min===null?null:-percent.min),
        transitionMinSec:index===0?null:transition.min,transitionMaxSec:index===0?null:transition.max,
        weight:'',unit:'kg',weightKg:0,reps:'',rir:''
      };
    });
    var dropSet=setEntity(exerciseId,1,'dropset',{restMinSec:rest.min,restMaxSec:rest.max});
    dropSet.segments=segments;dropSet.techniqueCue=text(raw.split(/[；;]/).slice(1).join('；'));
    return {name:name,raw:raw,set:dropSet};
  }

  function comparableExerciseName(value){return compact(text(value).replace(/[（(][^）)]*(?:前三直组|末组|重点日|容量日|张力日)[^）)]*[）)]/g,'').replace(/末组双递减.*$/,''));}
  function attachDropSet(exercises,drop){
    if(!drop)return false;
    var dropKey=comparableExerciseName(drop.name),candidate=null;
    for(var i=exercises.length-1;i>=0;i--){
      var key=comparableExerciseName(exercises[i].name);
      if(key&&dropKey&&(key.indexOf(dropKey)>=0||dropKey.indexOf(key)>=0)){candidate=exercises[i];break;}
    }
    if(!candidate)return false;
    candidate.name=text(candidate.name.replace(/[（(][^）)]*前三直组[^）)]*[）)]/g,''))||candidate.name;
    candidate.trackingName=candidate.name;
    drop.set.setId=candidate.exerciseId+':set:'+pad(candidate.sets.length+1);drop.set.setNo=candidate.sets.length+1;
    candidate.sets.push(drop.set);candidate.setCount=candidate.sets.length;candidate.hasMultiStageSet=true;
    return true;
  }

  function statementsForSection(section){
    var body=text(section.body);
    if(section.heading.sectionType==='skill')return body.split(/[；;]/).map(text).filter(Boolean);
    return body.split('\n').map(text).filter(Boolean);
  }
  function isCue(line){return /^(?:技术|动作标准|提示)[:：]/.test(text(line));}
  function isSupersetRule(line){return /(?:切换|一整对后休|超级组内)/.test(line)&&/(?:秒|休)/.test(line);}
  function parseSupersetRule(line,id,members){
    var normalized=normalize(line),transition=normalized.match(/(?:后|内切换|切换)\s*(\d+)\s*-\s*(\d+)\s*秒/),round=normalized.match(/(?:一整对后|整对后|完成一整对后)\s*休\s*(\d+)\s*-\s*(\d+)\s*秒/);
    if(!round)round=normalized.match(/休\s*(\d+)\s*-\s*(\d+)\s*秒/);
    return {supersetId:id,mode:'alternating',members:members.slice(),transitionMinSec:number(transition&&transition[1]),transitionMaxSec:number(transition&&transition[2]),roundRestMinSec:number(round&&round[1]),roundRestMaxSec:number(round&&round[2]),note:text(line)};
  }

  function parseStrengthSection(section,workout,context){
    var statements=statementsForSection(section),created=[],pendingRules=[];
    statements.forEach(function(statement){
      if(isCue(statement)){
        var last=created[created.length-1]||workout.exercises[workout.exercises.length-1];
        if(last)last.techniqueCue=text(statement.replace(/^(?:技术|动作标准|提示)[:：]\s*/,''));
        else context.unrecognized.push({workout:workout.order,section:section.heading.baseTitle,text:statement,reason:'技术提示前没有 Exercise'});
        return;
      }
      if(section.heading.sectionType==='superset'&&isSupersetRule(statement)){pendingRules.push(statement);return;}
      var drop=parseDropSet(statement,{workoutKey:workout.sourceWorkoutKey,exerciseNo:context.exerciseNo,section:section});
      if(drop){if(!attachDropSet(workout.exercises,drop))context.unrecognized.push({workout:workout.order,section:section.heading.baseTitle,text:statement,reason:'递减组无法绑定前置动作'});return;}
      var exercise=parseExerciseStatement(statement,{workoutKey:workout.sourceWorkoutKey,exerciseNo:context.exerciseNo,section:section});
      if(!exercise){context.unrecognized.push({workout:workout.order,section:section.heading.baseTitle,text:statement,reason:'无法解析 Exercise'});return;}
      context.exerciseNo++;workout.exercises.push(exercise);created.push(exercise);
    });
    if(section.heading.sectionType==='superset'&&created.length){
      var supersetId='SS'+pad(++context.supersetNo),members=created.map(function(exercise){exercise.supersetId=supersetId;return exercise.exerciseId;});
      var rule=parseSupersetRule(pendingRules.join('；'),supersetId,members);workout.supersetRules.push(rule);
      context.pendingSupersetRules.push(rule);
    }
  }

  function parseWarmupSection(section,workout){
    var durationMin=section.heading.durationMin,durationMax=section.heading.durationMax;
    var segments=text(section.body).split(/[；;。\n]/).map(text).filter(Boolean).map(function(item,index){
      var parts=item.split(/[:：]/),label=parts.length>1?parts.shift():'';
      return {segmentNo:index+1,label:text(label),instruction:text(parts.join('：')||item),warmupType:'ramp'};
    });
    workout.activities.push({activityId:workout.sourceWorkoutKey+':activity:'+pad(workout.activities.length+1),activityType:'warmup',warmupType:'ramp',title:section.heading.baseTitle,durationMinSec:durationMin===null?null:durationMin*60,durationMaxSec:durationMax===null?null:durationMax*60,segments:segments,countsAsWorkingSet:false,countsAsHypertrophySet:false});
    workout.warmupText+=(workout.warmupText?'\n':'')+segments.map(function(segment){return (segment.label?segment.label+'：':'')+segment.instruction;}).join('\n');
  }

  function parseCardioSection(section,workout,context){
    var first=text(section.body).split('\n')[0],parts=first.split(/[｜|]/).map(text).filter(Boolean),duration=parts.map(parseMeasure).find(function(item){return item.measureUnit==='minutes';})||{min:null,max:null},rpe=rpeRange(first);
    var modalityPart=parts.find(function(part){return part.indexOf('/')>=0&&!/RPE/i.test(part);})||'';
    var options=modalityPart.split('/').map(function(item){return text(item).replace(/[；;].*$/,'');}).filter(Boolean);
    if(duration.min===null){context.unrecognized.push({workout:workout.order,section:section.heading.baseTitle,text:section.body,reason:'有氧缺少时间范围'});return;}
    workout.activities.push({activityId:workout.sourceWorkoutKey+':activity:'+pad(workout.activities.length+1),activityType:'cardio',title:parts[0]||'有氧',durationMinSec:duration.min*60,durationMaxSec:duration.max*60,rpeMin:rpe.min,rpeMax:rpe.max,modalityOptions:options,instruction:text(first.split(/[；;]/).slice(1).join('；'))});
  }

  function parseClimbingSection(section,workout,context){
    var lines=text(section.body).split('\n').map(text).filter(Boolean),summary=lines.shift()||section.heading.baseTitle,parts=summary.split(/[｜|]/).map(text).filter(Boolean);
    var duration=parts.map(parseMeasure).find(function(item){return item.measureUnit==='minutes';})||{min:section.heading.durationMin,max:section.heading.durationMax},rpe=rpeRange(summary);
    var drills=lines.map(function(line,index){
      var p=line.split(/[｜|]/).map(text).filter(Boolean),measure=parseMeasure(p[1]||line);
      return {drillNo:index+1,name:p[0]||line,measureMin:measure.min,measureMax:measure.max,measureUnit:measure.measureUnit,instruction:text(p.slice(1).join('｜')).replace(/^[^；;]*[；;]/,'')};
    });
    workout.activities.push({activityId:workout.sourceWorkoutKey+':activity:'+pad(workout.activities.length+1),activityType:'climbing',title:parts[0]||section.heading.baseTitle,durationMinSec:duration.min===null?null:duration.min*60,durationMaxSec:duration.max===null?null:duration.max*60,rpeMin:rpe.min,rpeMax:rpe.max,drills:drills});
    if(duration.min===null&&section.heading.baseTitle!=='整合')context.unrecognized.push({workout:workout.order,section:section.heading.baseTitle,text:summary,reason:'攀岩活动缺少时间范围'});
  }

  function instruction(section,sourceBlockId){return {instructionId:sourceBlockId,category:INSTRUCTION_CATEGORY[section.heading.baseTitle]||'note',title:section.heading.baseTitle,sourceBlockId:sourceBlockId};}
  function parseProgression(workout,section){
    if(section.heading.baseTitle!=='周期位置')return;
    var source=text(section.body),block=source.match(/第\s*(\d+)\s*训练块/),round=source.match(/第\s*(\d+)\s*轮/),cycle=source.match(/\bD\s*(\d+)\b/i),phase=source.split(/[｜|]/).map(text);
    workout.trainingBlock=number(block&&block[1]);workout.round=number(round&&round[1]);workout.cycleDay=cycle?'D'+cycle[1]:workout.cycleDay;workout.progressionPhase=phase.length>=3?phase[2]:'';
  }

  function sourceBlockPool(blocks,pool){
    return blocks.map(function(section){
      var payload='【'+section.heading.rawTitle+'】'+section.body,id='src_'+stableHash(payload),suffix=1;
      while(pool[id]&&pool[id]!==payload){id='src_'+stableHash(payload)+'_'+suffix++;}
      pool[id]=payload;return id;
    });
  }
  function targetDuration(workout){
    var min=0,max=0,found=false;
    workout.activities.forEach(function(activity){if(number(activity.durationMinSec)!==null){min+=activity.durationMinSec;max+=number(activity.durationMaxSec)===null?activity.durationMinSec:activity.durationMaxSec;found=true;}});
    workout.estimatedDurationMin=found?Math.round(min/60):null;workout.estimatedDurationMax=found?Math.round(max/60):null;workout.targetDurationMin=workout.estimatedDurationMin;
  }

  function parseWorkoutRow(row,map,index,pool,unrecognized){
    var order=Number(valueAt(row,map,'顺序日'))||index+1,week=text(valueAt(row,map,'周次')),cycleDay=text(valueAt(row,map,'周内日')),typeLabel=text(valueAt(row,map,'类型')),title=text(valueAt(row,map,'主题'))||('第'+order+'练'),content=text(valueAt(row,map,'今日内容（整格照做）'));
    var sourceWorkoutKey='longform:row:'+pad(order,3),blocks=global.splitLongFormSectionBlocks(content),sourceBlockIds=sourceBlockPool(blocks,pool);
    var workout={
      workoutId:'longform_workout_'+pad(order,3),source:'long-form-daily-v1',sourceWorkoutKey:sourceWorkoutKey,order:order,
      title:title,'训练主题':title,'周次':week,'星期':cycleDay,'周内日':cycleDay,'类型':typeLabel,'阶段':typeLabel,
      workoutType:WORKOUT_TYPE_MAP[typeLabel]||'unknown',cycleDay:cycleDay,plannedDate:'','日期':'',
      exercises:[],activities:[],instructions:[],sections:[],supersetRules:[],sourceBlockIds:sourceBlockIds,
      warmupText:'','导入热身内容':'','热身模板':'—','训练内容（组×次数/余力）':'','组间休息/规则':'按各组处方执行'
    };
    var context={exerciseNo:1,supersetNo:0,pendingSupersetRules:[],unrecognized:unrecognized};
    blocks.forEach(function(section,blockIndex){
      var heading=section.heading,sourceId=sourceBlockIds[blockIndex];
      workout.sections.push({sectionType:heading.sectionType,title:heading.baseTitle,durationMin:heading.durationMin,durationMax:heading.durationMax,groupLabel:heading.groupLabel,countsAsWorkingSets:heading.countsAsWorkingSets,countsAsHypertrophyVolume:heading.countsAsHypertrophyVolume,sourceBlockId:sourceId});
      parseProgression(workout,section);
      if(heading.sectionType==='warmup'){parseWarmupSection(section,workout);return;}
      if(heading.sectionType==='strength'||heading.sectionType==='superset'||heading.sectionType==='skill'){parseStrengthSection(section,workout,context);return;}
      if(heading.sectionType==='cardio'){parseCardioSection(section,workout,context);return;}
      if(heading.sectionType==='climbing'){parseClimbingSection(section,workout,context);return;}
      workout.instructions.push(instruction(section,sourceId));
    });
    context.pendingSupersetRules.forEach(function(rule){
      if(rule.note)return;
      var generic=blocks.filter(function(section){return section.heading.sectionType==='superset';}).map(function(section){return section.body.split('\n').filter(isSupersetRule).join('；');}).filter(Boolean).pop();
      if(generic)Object.assign(rule,parseSupersetRule(generic,rule.supersetId,rule.members));
    });
    if(workout.workoutType==='rest'){
      if(workout.exercises.length||workout.activities.length)unrecognized.push({workout:order,section:'完全休息',text:'',reason:'休息日意外生成执行项目'});
      workout.exercises=[];workout.activities=[];
    }
    workout['导入热身内容']=workout.warmupText;
    workout['热身模板']=workout.warmupText?'逐日导入热身':'—';
    delete workout.warmupText;
    workout['训练内容（组×次数/余力）']=workout.exercises.filter(function(exercise){return !exercise.isWarmup;}).map(function(exercise){return exercise.line;}).join('\n');
    targetDuration(workout);
    return workout;
  }

  function semanticStats(plan,unrecognized){
    var stats={workouts:plan.length,types:{},exercises:0,formalExercises:0,warmups:0,skillRetention:0,supersetGroups:0,multiStageDropSets:0,cardio:0,climbing:0,rest:0,unrecognizedBlocks:unrecognized.length};
    plan.forEach(function(workout){
      stats.types[workout['类型']]=(stats.types[workout['类型']]||0)+1;
      stats.exercises+=workout.exercises.length;
      stats.formalExercises+=workout.exercises.filter(function(exercise){return exercise.trainingRole!=='skill-retention';}).length;
      stats.warmups+=workout.activities.filter(function(activity){return activity.activityType==='warmup';}).length;
      stats.skillRetention+=workout.exercises.filter(function(exercise){return exercise.trainingRole==='skill-retention';}).length;
      stats.supersetGroups+=workout.supersetRules.length;
      stats.multiStageDropSets+=workout.exercises.reduce(function(total,exercise){return total+exercise.sets.filter(function(set){return Array.isArray(set.segments)&&set.segments.length>1;}).length;},0);
      stats.cardio+=workout.activities.filter(function(activity){return activity.activityType==='cardio';}).length;
      stats.climbing+=workout.activities.filter(function(activity){return activity.activityType==='climbing';}).length;
      if(workout.workoutType==='rest')stats.rest++;
    });
    return stats;
  }

  function validateLongFormProgram(plan,options){
    options=options||{};
    var errors=[],warnings=[],workoutIds={},sourceKeys={},exerciseIds={},setIds={};
    (plan||[]).forEach(function(workout,index){
      var label='第'+(index+1)+'练';
      if(!workout.workoutId||workoutIds[workout.workoutId])errors.push(label+' workoutId 缺失或重复');workoutIds[workout.workoutId]=true;
      if(!workout.sourceWorkoutKey||sourceKeys[workout.sourceWorkoutKey])errors.push(label+' sourceWorkoutKey 缺失或重复');sourceKeys[workout.sourceWorkoutKey]=true;
      if(!WORKOUT_TYPE_MAP[workout['类型']])errors.push(label+' 类型不在 Long-form 枚举中：'+workout['类型']);
      if(workout.workoutType==='rest'&&((workout.exercises||[]).length||(workout.activities||[]).length))errors.push(label+' 休息日生成了执行项目');
      var workoutExerciseIds={};
      (workout.exercises||[]).forEach(function(exercise){
        if(!exercise.exerciseId||exerciseIds[exercise.exerciseId])errors.push(label+' exerciseId 缺失或重复');
        exerciseIds[exercise.exerciseId]=true;workoutExerciseIds[exercise.exerciseId]=true;
        if(!exercise.name)errors.push(label+' 存在空动作名称');
        (exercise.sets||[]).forEach(function(set,setIndex){
          if(!set.setId||setIds[set.setId])errors.push(label+' setId 缺失或重复');setIds[set.setId]=true;
          if(Number(set.setNo)!==setIndex+1)errors.push(label+' '+exercise.name+' 组号不连续');
          if(Array.isArray(set.segments)&&set.segments.length<2)errors.push(label+' '+exercise.name+' multi-stage set 段数不足');
        });
      });
      (workout.supersetRules||[]).forEach(function(rule){
        if(!rule.supersetId||(rule.members||[]).length<2)errors.push(label+' 超级组成员不足');
        (rule.members||[]).forEach(function(id){if(!workoutExerciseIds[id])errors.push(label+' 超级组引用不存在的 Exercise：'+id);});
      });
      (workout.sourceBlockIds||[]).forEach(function(id){if(options.sharedSourceBlocks&&!options.sharedSourceBlocks[id])errors.push(label+' 原文块引用不存在：'+id);});
    });
    (options.unrecognized||[]).forEach(function(item){warnings.push('D'+item.workout+'｜'+item.section+'：'+item.reason+'｜'+text(item.text).slice(0,100));});
    return {valid:errors.length===0&&warnings.length===0,errors:errors,warnings:warnings,stats:semanticStats(plan||[],options.unrecognized||[]),dayCount:(plan||[]).length,duplicateDays:[]};
  }

  function parseLongFormDailyGrid(rows,options){
    options=options||{};
    if(!detectLongFormDailyGrid(rows,options.sheetName))throw new Error('不是受支持的 Long-form Daily Grid。');
    var headerIndex=longFormHeaderIndex(rows);
    var map=headerMap(rows[headerIndex]),pool={},unrecognized=[],plan=[];
    rows.slice(headerIndex+1).forEach(function(row){if(!text(valueAt(row,map,'顺序日'))&&!text(valueAt(row,map,'主题'))&&!text(valueAt(row,map,'今日内容（整格照做）')))return;plan.push(parseWorkoutRow(row,map,plan.length,pool,unrecognized));});
    var validation=validateLongFormProgram(plan,{sharedSourceBlocks:pool,unrecognized:unrecognized}),stats=validation.stats,warnings=validation.warnings;
    return {
      type:'Long-form Daily Grid｜语义适配 v1',format:'long-form-daily-v1',source:'file',sourceFileName:options.fileName||'',sheetName:options.sheetName||'',
      programName:text(options.programName)||text(options.fileName).replace(/\.xlsx?$/i,'')||'Long-form 训练计划',plan:plan,warmups:[],
      sharedSourceBlocks:pool,semanticStats:stats,semanticWarnings:warnings,unrecognized:unrecognized,
      validation:validation
    };
  }

  global.detectLongFormDailyGrid=detectLongFormDailyGrid;
  global.longFormHeaderIndex=longFormHeaderIndex;
  global.parseLongFormDailyGrid=parseLongFormDailyGrid;
  global.parseSetSequence=parseSetSequence;
  global.parseLongFormMeasure=parseMeasure;
  global.parseLongFormDropSet=parseDropSet;
  global.longFormComparableExerciseName=comparableExerciseName;
  global.validateLongFormProgram=validateLongFormProgram;
})(typeof window!=='undefined'?window:globalThis);
