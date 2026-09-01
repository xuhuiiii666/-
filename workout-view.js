/* Pure workout display helpers. No storage writes or import parsing. */
(function(global){
  'use strict';

  function text(value){return String(value===undefined||value===null?'':value).trim();}
  function asArray(value){return Array.isArray(value)?value:[];}
  function normalizeType(value){return text(value).replace(/\s+/g,'').toLowerCase();}
  function isRestWorkout(workout){
    workout=workout||{};
    var type=normalizeType(workout.workoutType||workout.trainingType||workout['类型']||workout.type);
    if(type==='rest'||type==='完全休息'||type==='休息'||type==='休息日')return true;
    return asArray(workout.activities).some(function(activity){return normalizeType(activity&&activity.activityType)==='rest';});
  }
  function structuredWarmupActivities(workout){
    return asArray(workout&&workout.activities).filter(function(activity){return normalizeType(activity&&activity.activityType)==='warmup';});
  }
  function minuteLabel(activity){
    var min=Number(activity&&activity.durationMinSec),max=Number(activity&&activity.durationMaxSec);
    if(!isFinite(min)||min<=0)return '';
    min=Math.round(min/60);max=isFinite(max)&&max>0?Math.round(max/60):min;
    return min===max?min+'分钟':min+'-'+max+'分钟';
  }
  function stableViewId(value){
    return text(value).replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'warmup';
  }
  function directValue(segment,activity,name,fallback){
    if(segment&&segment[name]!==undefined&&segment[name]!==null&&segment[name]!=='')return segment[name];
    if(activity&&activity[name]!==undefined&&activity[name]!==null&&activity[name]!=='')return activity[name];
    return fallback;
  }
  function warmupStage(activity,segment,index,groupStageIndex,anchorLift,activityIdOverride){
    var activityId=text(activityIdOverride)||text(activity&&activity.activityId)||'warmup-activity';
    var segmentNo=Number(segment&&segment.segmentNo)||index+1;
    var stageId='warmup-stage-'+stableViewId(activityId)+'-'+segmentNo;
    var instruction=text(segment&&segment.instruction)||text(segment&&segment.label)||text(activity&&activity.instruction)||'热身准备';
    var sourceExerciseId=text(segment&&segment.exerciseId),sourceSetId=text(segment&&segment.setId);
    return {
      viewExerciseId:sourceExerciseId||stageId,
      viewSetId:sourceSetId||(stageId+'-set-1'),
      exerciseId:sourceExerciseId,
      setId:sourceSetId,
      activityId:activityId,
      sourceBlockId:text(segment&&segment.sourceBlockId)||text(activity&&activity.sourceBlockId),
      sourceSegmentNo:segmentNo,
      stageNo:groupStageIndex+1,
      name:'阶段 '+(groupStageIndex+1),
      anchorLift:anchorLift,
      instruction:instruction,
      line:[text(activity&&activity.title),instruction].filter(Boolean).join('｜'),
      sets:Number(directValue(segment,activity,'sets',1))||1,
      weight:directValue(segment,activity,'weight',''),
      unit:text(directValue(segment,activity,'unit','kg'))||'kg',
      reps:directValue(segment,activity,'reps',''),
      rir:directValue(segment,activity,'rir',''),
      duration:directValue(segment,activity,'duration',''),
      rest:Number(directValue(segment,activity,'rest',30))||30,
      techniqueCue:text(directValue(segment,activity,'techniqueCue','')),
      isWarmup:true,
      source:'structured-warmup'
    };
  }
  function warmupGroupTitle(activity,anchorLift,isMainWarmup,isClimbing){
    var activityTitle=text(activity&&activity.title)||'热身准备';
    if(isClimbing)return /攀岩/.test(activityTitle)?activityTitle:'攀岩热身';
    if(isMainWarmup&&anchorLift)return anchorLift+'｜主项热身';
    if(/通用|功能|准备/.test(activityTitle)&&!/主项/.test(activityTitle))return '通用准备';
    return activityTitle;
  }
  function mainWarmupAnchorFromTitle(value){
    var title=text(value),match=title.match(/^(.+?)(?:[｜|]\s*)?主项热身$/);
    return match?text(match[1]):'';
  }
  function groupWarmupItemsForDisplay(workout){
    var groups=[];
    structuredWarmupActivities(workout).forEach(function(activity,activityIndex){
      var activityId=text(activity.activityId)||('warmup-activity-'+(activityIndex+1));
      var activityTitle=text(activity.title)||'热身准备';
      var workoutType=normalizeType(workout&&workout.workoutType||workout&&workout['类型']);
      var isClimbing=/攀岩/.test(activityTitle)||/攀岩/.test(workoutType);
      var isMainWarmup=/主项热身/.test(activityTitle);
      var activityAnchor=isMainWarmup?mainWarmupAnchorFromTitle(activityTitle):'';
      var duration=minuteLabel(activity),segments=asArray(activity.segments);
      if(!segments.length&&text(activity.instruction))segments=[{segmentNo:1,label:'',instruction:activity.instruction}];
      var current=null;
      segments.forEach(function(segment,index){
        var explicitLabel=text(segment&&segment.label),anchorLift=activityAnchor;
        if(isMainWarmup&&!anchorLift&&explicitLabel)anchorLift=explicitLabel;
        if(!current||(!activityAnchor&&anchorLift)){
          var groupNo=groups.filter(function(group){return group.activityId===activityId;}).length+1;
          current={
            groupKey:'warmup-group-'+stableViewId(activityId)+'-'+groupNo,
            activityId:activityId,
            sourceBlockId:text(activity.sourceBlockId),
            title:warmupGroupTitle(activity,anchorLift,isMainWarmup,isClimbing),
            anchorLift:anchorLift,
            warmupType:text(activity.warmupType)||'warmup',
            duration:duration,
            overallCue:text(activity.instruction),
            isMainWarmup:isMainWarmup,
            isClimbingWarmup:isClimbing,
            items:[]
          };
          groups.push(current);
        }
        current.items.push(warmupStage(activity,segment,index,current.items.length,current.anchorLift,activityId));
      });
    });
    return groups;
  }
  function flattenWarmupDisplayGroups(groups){
    return asArray(groups).reduce(function(items,group){return items.concat(asArray(group&&group.items));},[]);
  }
  function structuredWarmupItems(workout){
    return flattenWarmupDisplayGroups(groupWarmupItemsForDisplay(workout));
  }
  function structuredWarmupText(workout){return structuredWarmupItems(workout).map(function(item){return item.line||item.name;}).join('\n');}
  function templateWarmupText(template){
    if(!template)return '';
    var steps=text(template.steps||template.text||template.content),notes=text(template.notes||template.note);
    return steps+(steps&&notes?'\n\n备注：'+notes:'');
  }
  function legacyWarmupTemplate(workout,templates){
    var name=text(workout&&workout['热身模板']);
    if(!name||name==='—'||name==='-'||name==='无')return null;
    return asArray(templates).find(function(template){return text(template&&template.name)===name;})||null;
  }
  function restRecoveryText(workout,sharedSourceBlocks){
    var blocks=sharedSourceBlocks||{},parts=[];
    asArray(workout&&workout.instructions).forEach(function(item){
      if(!/^(?:recovery|recovery-check|adjustment|stop|note)$/.test(text(item&&item.category)))return;
      var value=text(item&&item.text)||text(blocks[item&&item.sourceBlockId]);
      value=value.replace(/^【[^】]+】/,'').trim();if(value)parts.push(value);
    });
    if(!parts.length){
      var legacy=text(workout&&workout['训练内容（组×次数/余力）']);
      if(legacy&&/完全休息|恢复优先|恢复检查/.test(legacy))parts.push(legacy);
    }
    return parts.join('\n')||'今天完全休息，按计划中的恢复说明执行。';
  }
  function resolveWorkoutWarmup(workout,options){
    options=options||{};
    var structuredGroups=groupWarmupItemsForDisplay(workout),structuredItems=flattenWarmupDisplayGroups(structuredGroups);
    if(structuredItems.length)return {kind:'structured',text:structuredItems.map(function(item){return item.line||item.name;}).join('\n'),items:structuredItems,groups:structuredGroups};
    if(isRestWorkout(workout))return {kind:'rest',text:restRecoveryText(workout,options.sharedSourceBlocks),items:[]};
    if(text(options.customText))return {kind:'custom',text:text(options.customText),items:[]};
    var template=legacyWarmupTemplate(workout,options.templates),templateText=templateWarmupText(template);
    if(templateText)return {kind:'legacy-template',text:templateText,items:[]};
    return {kind:'none',text:'',items:[]};
  }

  global.isRestWorkout=isRestWorkout;
  global.structuredWarmupActivities=structuredWarmupActivities;
  global.groupWarmupItemsForDisplay=groupWarmupItemsForDisplay;
  global.flattenWarmupDisplayGroups=flattenWarmupDisplayGroups;
  global.structuredWarmupItems=structuredWarmupItems;
  global.structuredWarmupText=structuredWarmupText;
  global.resolveWorkoutWarmup=resolveWorkoutWarmup;
})(typeof window!=='undefined'?window:globalThis);
