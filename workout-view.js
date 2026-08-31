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
  function structuredWarmupItems(workout){
    var items=[];
    structuredWarmupActivities(workout).forEach(function(activity){
      var duration=minuteLabel(activity),segments=asArray(activity.segments);
      if(!segments.length&&text(activity.instruction))segments=[{label:activity.title||'热身',instruction:activity.instruction}];
      segments.forEach(function(segment,index){
        var label=text(segment&&segment.label)||text(activity.title)||'热身准备';
        var instruction=text(segment&&segment.instruction)||label;
        var line=[index===0?text(activity.title):'',index===0?duration:'',label!==instruction?label:'',instruction].filter(Boolean).join('｜');
        items.push({name:label,line:line,sets:1,reps:'',duration:'',rest:30,isWarmup:true,source:'structured-warmup'});
      });
    });
    return items;
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
    var structuredItems=structuredWarmupItems(workout);
    if(structuredItems.length)return {kind:'structured',text:structuredItems.map(function(item){return item.line||item.name;}).join('\n'),items:structuredItems};
    if(isRestWorkout(workout))return {kind:'rest',text:restRecoveryText(workout,options.sharedSourceBlocks),items:[]};
    if(text(options.customText))return {kind:'custom',text:text(options.customText),items:[]};
    var template=legacyWarmupTemplate(workout,options.templates),templateText=templateWarmupText(template);
    if(templateText)return {kind:'legacy-template',text:templateText,items:[]};
    return {kind:'none',text:'',items:[]};
  }

  global.isRestWorkout=isRestWorkout;
  global.structuredWarmupActivities=structuredWarmupActivities;
  global.structuredWarmupItems=structuredWarmupItems;
  global.structuredWarmupText=structuredWarmupText;
  global.resolveWorkoutWarmup=resolveWorkoutWarmup;
})(typeof window!=='undefined'?window:globalThis);
