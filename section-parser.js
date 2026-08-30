/* Generic section-heading parsing for long-form daily plans. */
(function(global){
  'use strict';

  function text(value){return String(value===undefined||value===null?'':value).trim();}
  function number(value){var parsed=Number(value);return isFinite(parsed)?parsed:null;}
  function normalize(value){return text(value).replace(/[—–～~至]/g,'-').replace(/\s+/g,' ');}

  function durationRange(value){
    var source=normalize(value);
    var match=source.match(/(?:约\s*)?(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(分钟|min|秒|s)/i);
    if(!match)return {durationMin:null,durationMax:null,durationUnit:''};
    var min=number(match[1]),max=number(match[2]||match[1]),unit=/秒|^s$/i.test(match[3])?'seconds':'minutes';
    return {durationMin:min,durationMax:max,durationUnit:unit};
  }

  function sectionTypeFor(baseTitle){
    var title=text(baseTitle);
    if(/^主项热身|^攀岩热身|^热身/.test(title))return 'warmup';
    if(/^主训练|^主项$|^主辅助|^辅助/.test(title))return 'strength';
    if(/^超级组/.test(title))return 'superset';
    if(/^基本功|功能打磨|技术打磨/.test(title))return 'skill';
    if(/^有氧/.test(title))return 'cardio';
    if(/^技术主课|^整合(?:\/自由爬)?$/.test(title))return 'climbing';
    if(/^完全休息/.test(title))return 'rest';
    return 'instruction';
  }

  function parseSectionHeading(value){
    var raw=text(value).replace(/^【|】$/g,'').trim();
    var pipeParts=raw.split(/[｜|]/).map(text).filter(Boolean);
    var baseTitle=pipeParts.shift()||raw;
    var metadataText=pipeParts.join('；');
    var metadata=metadataText.split(/[；;]/).map(text).filter(Boolean);
    var duration=durationRange(metadataText||raw);
    var groupMatch=baseTitle.match(/^超级组\s*([A-Za-z0-9一二三四五六七八九十]*)$/i);
    var groupLabel=groupMatch?text(groupMatch[1]).toUpperCase():'';
    var countsAsWorkingSets=!/不计(?:正式|有效)组/.test(metadataText);
    var countsAsHypertrophyVolume=!/不计(?:肌肥大)?有效组|不计肌肥大/.test(metadataText);
    return {
      rawTitle:raw,
      baseTitle:baseTitle,
      metadata:metadata,
      metadataText:metadataText,
      durationMin:duration.durationMin,
      durationMax:duration.durationMax,
      durationUnit:duration.durationUnit,
      groupLabel:groupLabel,
      sectionType:sectionTypeFor(baseTitle),
      countsAsWorkingSets:countsAsWorkingSets,
      countsAsHypertrophyVolume:countsAsHypertrophyVolume
    };
  }

  function splitSectionBlocks(value){
    var source=String(value||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim();
    var pattern=/(?:^|\n)【([^】]+)】/g,matches=[],match;
    while((match=pattern.exec(source))){
      var headingStart=match.index+(match[0].charAt(0)==='\n'?1:0);
      matches.push({heading:match[1],start:headingStart,bodyStart:pattern.lastIndex});
    }
    return matches.map(function(item,index){
      var end=index+1<matches.length?matches[index+1].start:source.length;
      return {heading:parseSectionHeading(item.heading),body:source.slice(item.bodyStart,end).trim(),raw:'【'+item.heading+'】'+source.slice(item.bodyStart,end)};
    });
  }

  global.parseSectionHeading=parseSectionHeading;
  global.splitLongFormSectionBlocks=splitSectionBlocks;
  global.longFormSectionTypeFor=sectionTypeFor;
})(typeof window!=='undefined'?window:globalThis);
