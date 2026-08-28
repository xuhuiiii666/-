/* Structured set prescriptions. This module does not own timer state. */
(function(global){
  'use strict';

  var SET_TYPES=['working','technique','warmup','top','backoff','dropset'];
  var SET_TYPE_LABELS={working:'工作组',technique:'技术组',warmup:'热身组',top:'顶组',backoff:'回退组',dropset:'递减组'};

  function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
  function numberOrNull(value){
    if(value===null||value===undefined||String(value).trim()==='') return null;
    var number=Number(value);
    return isFinite(number)?number:null;
  }
  function range(value){
    if(Array.isArray(value)) return {min:numberOrNull(value[0]),max:numberOrNull(value[1])};
    if(value&&typeof value==='object') return {min:numberOrNull(value.min),max:numberOrNull(value.max)};
    var text=String(value==null?'':value).trim();
    if(!text) return {min:null,max:null};
    var match=text.replace(/[–—~至]/g,'-').match(/(-?\d+(?:\.\d+)?)(?:\s*-\s*(-?\d+(?:\.\d+)?))?/);
    if(!match) return {min:null,max:null};
    var min=numberOrNull(match[1]), max=numberOrNull(match[2]);
    return {min:min,max:max===null?min:max};
  }
  function normalizeBounds(min,max,fallback){
    var parsed=range({min:min,max:max});
    if(parsed.min===null&&fallback!==undefined) parsed=range(fallback);
    if(parsed.min!==null&&parsed.max===null) parsed.max=parsed.min;
    if(parsed.min!==null&&parsed.max!==null&&parsed.max<parsed.min){var swap=parsed.min;parsed.min=parsed.max;parsed.max=swap;}
    return parsed;
  }
  function validSetType(value){return SET_TYPES.indexOf(String(value||''))>=0;}
  function normalizedSetType(value){return validSetType(value)?String(value):'working';}
  function makeId(prefix){
    if(typeof global.createStableId==='function') return global.createStableId(prefix||'set');
    return (prefix||'set')+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
  }
  function normalizeExercisePrescription(exercise){
    exercise=object(exercise);
    var current=object(exercise.prescription);
    var reps=normalizeBounds(current.repsMin!==undefined?current.repsMin:current.defaultRepsMin,current.repsMax!==undefined?current.repsMax:current.defaultRepsMax,exercise.reps||exercise.planReps);
    var rir=normalizeBounds(current.rirMin!==undefined?current.rirMin:current.defaultRirMin,current.rirMax!==undefined?current.rirMax:current.defaultRirMax,exercise.rir||exercise.planRir);
    var restSource=exercise.rest&&typeof exercise.rest==='object'?{min:exercise.rest.min,max:exercise.rest.max}:exercise.rest;
    var rest=normalizeBounds(current.restMin!==undefined?current.restMin:current.defaultRestMin,current.restMax!==undefined?current.restMax:current.defaultRestMax,restSource);
    if(rest.min===null&&Array.isArray(exercise.sets)&&exercise.sets[0]) rest=normalizeBounds(null,null,exercise.sets[0].rest);
    if(rest.min===null) rest={min:90,max:90};
    return {
      repsMin:reps.min,repsMax:reps.max,
      rirMin:rir.min,rirMax:rir.max,
      restMin:rest.min,restMax:rest.max,
      recommendedWeight:current.recommendedWeight!==undefined?current.recommendedWeight:(exercise.recommendedWeight||exercise.suggestedWeight||''),
      unit:current.unit||exercise.unit||'kg'
    };
  }
  function normalizeSetPrescriptionEntity(set,index,prescription){
    var next=Object.assign({},object(set));
    prescription=object(prescription);
    next.setId=next.setId||makeId('set');
    next.setNo=Number(next.setNo||next.set||index+1)||index+1;
    next.setType=normalizedSetType(next.setType);
    var reps=normalizeBounds(next.targetRepsMin,next.targetRepsMax,next.reps!==undefined?next.reps:{min:prescription.repsMin,max:prescription.repsMax});
    var rir=normalizeBounds(next.targetRirMin,next.targetRirMax,next.rir!==undefined?next.rir:{min:prescription.rirMin,max:prescription.rirMax});
    var rest=normalizeBounds(next.targetRestMin,next.targetRestMax,next.rest!==undefined?next.rest:{min:prescription.restMin,max:prescription.restMax});
    next.targetRepsMin=reps.min;next.targetRepsMax=reps.max;
    next.targetRirMin=rir.min;next.targetRirMax=rir.max;
    next.targetRestMin=rest.min;next.targetRestMax=rest.max;
    next.loadAdjustmentType=next.loadAdjustmentType||'';
    next.loadAdjustmentValue=numberOrNull(next.loadAdjustmentValue);
    next.techniqueCue=String(next.techniqueCue||'').trim();
    next.prescriptionDefined=!!next.prescriptionDefined;
    if(next.rest===undefined||next.rest===null||next.rest==='') next.rest=rest.min===null?90:Number(rest.min);
    return next;
  }
  function normalizeExerciseWithPrescription(exercise){
    var next=Object.assign({},object(exercise));
    next.prescription=normalizeExercisePrescription(next);
    var sets=Array.isArray(next.sets)?next.sets:[];
    var count=Math.max(sets.length,Number(next.setCount)||0,1);
    next.sets=Array.from({length:count},function(_,index){return normalizeSetPrescriptionEntity(sets[index]||{},index,next.prescription);});
    next.setCount=next.sets.length;
    return next;
  }
  function expandSetPrescription(exercise,setCount,specialSets,idFactory){
    var normalized=normalizeExerciseWithPrescription(Object.assign({},object(exercise),{setCount:Number(setCount)||1}));
    var specials=Array.isArray(specialSets)?specialSets:[];
    var count=Math.max(Number(setCount)||0,normalized.sets.length,specials.reduce(function(max,item){return Math.max(max,Number(item&&item.setNo)||0);},0),1);
    normalized.sets=Array.from({length:count},function(_,index){
      var base=normalized.sets[index]||{};
      var special=specials.find(function(item){return Number(item&&item.setNo)===index+1;})||{};
      var merged=Object.assign({},base,special,{setId:special.setId||base.setId||(idFactory?idFactory('set'):makeId('set')),setNo:index+1});
      return normalizeSetPrescriptionEntity(merged,index,normalized.prescription);
    });
    normalized.setCount=count;
    return normalized;
  }
  function formatRange(min,max,suffix){
    if(min===null||min===undefined||min==='') return '';
    return String(min)+(max!==null&&max!==undefined&&String(max)!==String(min)?'-'+String(max):'')+(suffix||'');
  }
  function adjustmentText(set){
    var value=numberOrNull(set&&set.loadAdjustmentValue);
    if(value===null) return '';
    if(set.loadAdjustmentType==='percent') return (value>0?'↑':'↓')+Math.abs(value)+'%';
    if(set.loadAdjustmentType==='absolute') return (value>0?'+':'')+value+(set.unit||'kg');
    return '';
  }
  function escapeHtml(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function setPrescriptionSummaryHTML(set){
    set=normalizeSetPrescriptionEntity(set||{},Number(set&&set.setNo||1)-1,{});
    var ranges=[];
    var reps=formatRange(set.targetRepsMin,set.targetRepsMax,'次');if(reps) ranges.push(reps);
    var rir=formatRange(set.targetRirMin,set.targetRirMax,'');if(rir) ranges.push('RIR '+rir);
    var rest=formatRange(set.targetRestMin,set.targetRestMax,'秒');if(rest) ranges.push('休 '+rest);
    var adjust=adjustmentText(set);if(adjust) ranges.push(adjust);
    var cue=set.techniqueCue?'<span class="setPrescriptionCue">'+escapeHtml(set.techniqueCue)+'</span>':'';
    return '<div class="setPrescription"><span class="setTypeBadge setType-'+escapeHtml(set.setType)+'">'+escapeHtml(SET_TYPE_LABELS[set.setType])+'</span><span class="setPrescriptionTargets">'+escapeHtml(ranges.join('｜'))+'</span>'+cue+'</div>';
  }
  function setPrescriptionDataAttributes(set){
    set=normalizeSetPrescriptionEntity(set||{},Number(set&&set.setNo||1)-1,{});
    var attrs={setType:set.setType,targetRepsMin:set.targetRepsMin,targetRepsMax:set.targetRepsMax,targetRirMin:set.targetRirMin,targetRirMax:set.targetRirMax,targetRestMin:set.targetRestMin,targetRestMax:set.targetRestMax,loadAdjustmentType:set.loadAdjustmentType,loadAdjustmentValue:set.loadAdjustmentValue,techniqueCue:set.techniqueCue,prescriptionDefined:set.prescriptionDefined?'1':''};
    return Object.keys(attrs).map(function(key){var value=attrs[key];return value===null||value===undefined?'':' data-'+key.replace(/[A-Z]/g,function(x){return '-'+x.toLowerCase();})+'="'+escapeHtml(value)+'"';}).join('');
  }
  function updateSetPrescription(exercise,setId,patch){
    if(!exercise||!Array.isArray(exercise.sets)) return null;
    var index=exercise.sets.findIndex(function(set){return set.setId===setId;});
    if(index<0) return null;
    exercise.prescription=normalizeExercisePrescription(exercise);
    exercise.sets[index]=normalizeSetPrescriptionEntity(Object.assign({},exercise.sets[index],object(patch)),index,exercise.prescription);
    return exercise.sets[index];
  }

  global.PRESCRIPTION_SET_TYPES=SET_TYPES.slice();
  global.PRESCRIPTION_SET_TYPE_LABELS=Object.assign({},SET_TYPE_LABELS);
  global.isValidPrescriptionSetType=validSetType;
  global.parsePrescriptionRange=range;
  global.normalizeExercisePrescription=normalizeExercisePrescription;
  global.normalizeSetPrescriptionEntity=normalizeSetPrescriptionEntity;
  global.normalizeExerciseWithPrescription=normalizeExerciseWithPrescription;
  global.expandSetPrescription=expandSetPrescription;
  global.setPrescriptionSummaryHTML=setPrescriptionSummaryHTML;
  global.setPrescriptionDataAttributes=setPrescriptionDataAttributes;
  global.updateSetPrescription=updateSetPrescription;
})(typeof window!=='undefined'?window:globalThis);
