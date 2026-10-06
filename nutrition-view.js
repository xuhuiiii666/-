(function(global){
  'use strict';
  const M=global.NutritionModel;
  const ui={view:'day',date:M.localDate(),editor:null,dirty:false,saving:false,mounted:false,profileId:null};
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const data=()=>M.read(global.getActiveProfile());
  const value=n=>n==null?'未计算':Math.round(n*10)/10;
  const button=(action,text,attrs='')=>`<button type="button" data-n-action="${action}" ${attrs}>${text}</button>`;
  const options=(list,current)=>list.map(([v,t])=>`<option value="${esc(v)}"${v===current?' selected':''}>${esc(t)}</option>`).join('');
  function input(label,name,val,type='number',attrs=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(val)}" ${type==='number'?'min="0" step="any" inputmode="decimal"':''} ${attrs}></label>`;}
  function select(label,name,items,current){return `<label>${label}<select name="${name}">${options(items,current)}</select></label>`;}
  function leave(){return !ui.dirty||confirm('还有未保存的饮食内容，放弃本次编辑？');}
  function setStatus(text,error=false){const node=$('#nutritionStatus');node.textContent=text;node.classList.toggle('nutritionError',error);}
  async function commit(transform){
    if(ui.saving)return;ui.saving=true;setStatus('正在保存…');
    global.setStorageOperationBusy?.(true);
    try{
      await global.flushTrainingStorage();
      const root=JSON.parse(JSON.stringify(global.trainingTrackerState)),profile=root.profiles[root.activeProfileId];
      profile.nutrition=transform(M.read(profile));
      await global.saveRootCandidate(root);
      ui.dirty=false;ui.editor=null;render();setStatus('已保存');
    }catch(error){console.error('[nutrition save]',error);setStatus('未保存：'+error.message+' 填写内容仍保留。',true);}
    finally{ui.saving=false;global.setStorageOperationBusy?.(false);}
  }
  function foodsList(foods){return foods.length?`<ul class="nutritionFoodList">${foods.map(f=>`<li><span>${esc(f.name)}${f.note?`<small>${esc(f.note)}</small>`:''}</span><b>${f.quantity==null?'估计份量待补':esc(f.quantity)+' '+esc(f.unit)}</b></li>`).join('')}</ul>`:'<p class="nutritionMuted">没有食品条目</p>';}
  function foodEditor(f={}){
    const unit=f.unit||'g',n=f.nutrients||{};
    return `<fieldset class="nutritionFoodEditor" data-food-id="${esc(f.foodId||'')}" data-unit="${esc(unit)}"><div class="nutritionFoodHead">${input('具体食品 / 饮品','name',f.name,'text','required maxlength="120"')}${button('remove-food','×','aria-label="删除食品" title="删除食品"')}</div>
      <div class="nutritionColumns">${input('份量（可留空）','quantity',f.quantity)}${select('单位','unit',[['g','g'],['mL','mL'],['份','份'],['个','个']],unit)}</div>
      ${input('备注 / 生熟 / 估算描述','note',f.note,'text','placeholder="例如：熟重，或一碗左右" maxlength="500"')}
      <details><summary>营养数据 · <span data-basis>${['g','mL'].includes(unit)?'每100'+unit:'每'+unit}</span></summary><div class="nutritionColumns nutritionNutrients">${input('热量 kcal','kcal',n.kcal)}${input('蛋白质 g','protein',n.protein)}${input('碳水 g','carbs',n.carbs)}${input('脂肪 g','fat',n.fat)}</div></details>
    </fieldset>`;
  }
  function readFoods(container){return [...container.querySelectorAll('.nutritionFoodEditor')].map(node=>{const get=k=>node.querySelector(`[name="${k}"]`).value;return M.food({foodId:node.dataset.foodId||undefined,name:get('name'),quantity:get('quantity'),unit:get('unit'),note:get('note'),nutrients:Object.fromEntries(M.NUTRIENTS.map(k=>[k,get(k)]))});});}
  function cycleEditor(cycle){
    const c=cycle||{name:'',startDate:ui.date,endDate:M.shiftDate(ui.date,59),kind:'regular',meals:M.MEALS.map(name=>({name,foods:[]}))};
    return `<form id="nutritionCycleForm" data-cycle-id="${esc(c.cycleId||'')}"><h3>${c.cycleId?'编辑周期方案':'新建周期方案'}</h3>
      ${input('方案名称','cycleName',c.name,'text','required maxlength="120" placeholder="例如：10–12月常规饮食"')}
      <div class="nutritionColumns">${input('开始日期','startDate',c.startDate,'date','required')}${input('结束日期','endDate',c.endDate,'date','required')}</div>
      <div class="nutritionColumns">${select('方案类型','kind',[['regular','常规'],['travel','出差 / 临时']],c.kind)}${input('蛋白质目标 g（选填）','proteinTarget',c.proteinTarget)}</div>
      ${c.meals.map((m,i)=>`<section class="nutritionMealEditor" data-meal-index="${i}"><h4>${esc(m.name)}</h4><div class="nutritionFoodFields">${m.foods.map(foodEditor).join('')}</div>${button('add-food','添加食品 / 油 / 饮品')}</section>`).join('')}
      <div class="nutritionActions"><button type="submit" class="primary">保存周期方案</button>${button('cancel','取消')}</div></form>`;
  }
  function mealEditor(meal){return `<form id="nutritionMealForm" data-meal-id="${meal.mealId}"><h3>${esc(meal.name)} · 实际记录</h3>
    ${select('记录精度','status',[['confirmed','已确认份量'],['estimated','大概 / 估算']],meal.status==='pending'?'confirmed':meal.status)}
    <div class="nutritionMealEditor"><div class="nutritionFoodFields">${(meal.actual||meal.planned).map(foodEditor).join('')}</div>${button('add-food','添加食品 / 油 / 饮品')}</div>
    <label>本餐备注<textarea name="mealNote" maxlength="2000" placeholder="例如：外食，份量不确定">${esc(meal.note)}</textarea></label>
    <div class="nutritionActions"><button type="submit" class="primary">保存本餐记录</button>${button('cancel','取消')}</div></form>`;}
  function metricsForm(metric){return `<details class="nutritionMetrics"><summary>体重与恢复${metric.weight!=null?' · '+metric.weight+' kg':''}</summary><form id="nutritionMetricsForm"><div class="nutritionColumns">
    ${input('早晨空腹体重 kg','weight',metric.weight)}${input('腰围 cm（选填）','waist',metric.waist)}
    ${input('步数','steps',metric.steps)}${input('Zone 2 分钟','zone2',metric.zone2)}${input('睡眠时长 h','sleepHours',metric.sleepHours)}</div>
    <label>当日备注<textarea name="metricNote" maxlength="2000">${esc(metric.note)}</textarea></label><button type="submit">保存身体记录</button></form></details>`;}
  function dayView(){
    const d=data(),day=M.preview(d,ui.date),s=M.summary(day),metric=d.metrics[ui.date]||{};
    if(ui.editor?.type==='meal')return mealEditor(day.meals.find(m=>m.mealId===ui.editor.id));
    const difference=s.complete&&s.actual.kcal!==null&&s.planned.kcal!==null?s.actual.kcal-s.planned.kcal:null;
    const logs=Object.values(global.getActiveProfile().programs).flatMap(p=>p.workoutLogs||[]).filter(l=>(l.actualDate||l.date||'').slice(0,10)===ui.date);
    return `<div class="nutritionDayHead"><span>${esc(day.cycleName)}</span><small>${s.recorded}/${day.meals.length} 餐已记录${s.estimated?' · '+s.estimated+' 餐估算':''}</small></div>
      <div class="nutritionStats"><div><span>预计 kcal</span><strong>${day.meals.some(m=>m.planned.length)?value(s.planned.kcal):'—'}</strong></div><div><span>${s.complete?'实际 kcal':'已记录 kcal'}</span><strong>${s.hasRecord?value(s.actual.kcal):'—'}</strong></div><div><span>全天差值 kcal</span><strong>${difference===null?'—':(difference>0?'+':'')+value(difference)}</strong></div></div>
      <div class="nutritionMacro">蛋白质 ${s.hasRecord?value(s.actual.protein):'—'} g · 碳水 ${s.hasRecord?value(s.actual.carbs):'—'} g · 脂肪 ${s.hasRecord?value(s.actual.fat):'—'} g</div>
      ${day.proteinTarget!==null?`<p class="nutritionMuted">蛋白质目标 ${esc(day.proteinTarget)} g · ${s.complete&&s.actual.protein!==null?(s.actual.protein>=day.proteinTarget?'已达到':'未达到'):'全天待确认'}</p>`:''}
      ${s.hasRecord&&s.actual.kcal===null?'<p class="nutritionMuted">部分份量或营养数据缺失，全天热量暂不计算。</p>':''}
      <div class="nutritionActions">${button('confirm-day','按计划完成未记录餐次',s.pending?'':'disabled')}
        ${d.cycles.length?`<details><summary>当天方案</summary><select id="nutritionDayCycle" aria-label="当天方案">${options(d.cycles.map(c=>[c.cycleId,c.name]),day.cycleId)}</select>${button('choose-cycle','使用此方案')}</details>`:button('new-cycle','设置周期方案')}</div>
      ${day.meals.map(m=>`<article class="nutritionMeal"><header><h3>${esc(m.name)}</h3><span class="nutritionBadge ${m.status}">${{pending:'未记录',confirmed:'已确认',estimated:'估算'}[m.status]}</span></header>
        ${foodsList(m.actual||m.planned)}${m.note?`<p>${esc(m.note)}</p>`:''}
        <div class="nutritionActions">${m.status==='pending'&&m.planned.length?button('confirm-meal','按计划吃了',`data-id="${m.mealId}"`):''}${button('edit-meal','修改 / 估记',`data-id="${m.mealId}"`)}${m.status==='pending'?button('skip-meal','这餐没吃',`data-id="${m.mealId}"`):button('reset-meal','撤销记录',`data-id="${m.mealId}"`)}</div></article>`).join('')}
      ${metricsForm(metric)}<div class="nutritionTraining"><h3>当日训练</h3>${logs.length?logs.map(l=>`<p>${esc(l.title||l.workoutTitle||'训练记录')}</p>`).join(''):'<p class="nutritionMuted">暂无已归档训练</p>'}</div>`;
  }
  function cyclesView(){const d=data();if(ui.editor?.type==='cycle')return cycleEditor(d.cycles.find(c=>c.cycleId===ui.editor.id));
    return `<div class="nutritionActions">${button('new-cycle','新建周期方案','class="primary"')}</div>${d.cycles.length?d.cycles.slice().sort((a,b)=>a.startDate.localeCompare(b.startDate)).map(c=>`<article class="nutritionCycle"><header><h3>${esc(c.name)}</h3><span class="nutritionBadge">${c.kind==='travel'?'出差 / 临时':'常规'}</span></header><p>${c.startDate} 至 ${c.endDate}</p><p class="nutritionMuted">${c.meals.map(m=>esc(m.name)+' '+m.foods.length+' 项').join(' · ')}</p><div class="nutritionActions">${button('edit-cycle','编辑',`data-id="${esc(c.cycleId)}"`)}${button('delete-cycle','删除方案',`data-id="${esc(c.cycleId)}"`)}</div></article>`).join(''):'<p class="nutritionEmpty">还没有周期方案</p>'}`;
  }
  function reviewView(){
    const d=data(),week=M.weekly(d,ui.date),previous=M.weekly(d,M.shiftDate(ui.date,-7));
    const delta=week.weightMean!=null&&previous.weightMean!=null?week.weightMean-previous.weightMean:null;
    return `<h3>${week.dates[0]} 至 ${ui.date}</h3><p class="nutritionMuted">已记录 ${week.recordedDays}/7 天 · 含估算 ${week.estimatedDays} 天</p>
      <div class="nutritionStats"><div><span>本期平均体重 kg</span><strong>${value(week.weightMean)}</strong><small>${week.weightDays}/7 次测量</small></div><div><span>上期平均体重 kg</span><strong>${value(previous.weightMean)}</strong><small>${previous.weightDays}/7 次测量</small></div><div><span>均重变化 kg</span><strong>${delta===null?'—':(delta>0?'+':'')+value(delta)}</strong></div></div>
      <div class="nutritionReviewGrid"><p>平均摄入 <b>${value(week.intakeMean)} kcal</b><small>${week.intakeDays} 个完整可计算日</small></p><p>平均蛋白质 <b>${value(week.proteinMean)} g</b><small>${week.proteinDays} 个完整可计算日</small></p><p>平均步数 <b>${value(week.stepsMean)}</b><small>${week.stepsDays}/7 天记录</small></p><p>Zone 2 合计 <b>${value(week.zone2)} 分钟</b><small>${week.zone2Days}/7 天记录</small></p></div>
      <div class="nutritionWeekList">${week.days.map(({date,day,metric})=>{const s=M.summary(day);return `<button type="button" data-n-action="open-date" data-id="${date}"><span>${date.slice(5)}<small>${s.recorded}/${day.meals.length} 餐${s.estimated?' · 估算':''}</small></span><span>${metric.weight==null?'—':metric.weight+' kg'}</span><span>${s.complete?value(s.actual.kcal)+' kcal':'未完整'}</span></button>`;}).join('')}</div>
      <div class="nutritionActions">${button('export','导出饮食与身体记录')}</div>`;
  }
  function render(){
    const root=$('#nutrition');if(!root)return;
    root.innerHTML=`<div class="nutritionHeading"><h2>饮食与身体</h2><div class="nutritionDate">${button('previous','‹','aria-label="前一天" title="前一天"')}<input id="nutritionDate" aria-label="饮食日期" type="date" value="${ui.date}">${button('next','›','aria-label="后一天" title="后一天"')}</div></div>
      <div class="nutritionTabs" role="tablist" aria-label="饮食视图">${[['day','今日饮食'],['cycles','周期方案'],['review','复盘']].map(([v,t])=>button('view',t,`role="tab" aria-selected="${ui.view===v}" data-id="${v}"`)).join('')}</div>
      <p id="nutritionStatus" role="status" aria-live="polite"></p><div id="nutritionContent">${ui.view==='day'?dayView():ui.view==='cycles'?cyclesView():reviewView()}</div>`;
    ui.mounted=true;ui.profileId=global.trainingTrackerState.activeProfileId;
  }
  global.renderNutrition=function(){if(ui.profileId!==global.trainingTrackerState.activeProfileId){ui.editor=null;ui.dirty=false;}if(!ui.dirty)render();};
  document.addEventListener('input',event=>{if(event.target.closest('#nutrition form')){ui.dirty=true;setStatus('有未保存的修改');}});
  document.addEventListener('change',event=>{
    const target=event.target;if(!target.closest('#nutrition'))return;
    if(target.id==='nutritionDate'){if(M.validDate(target.value)&&leave()){ui.date=target.value;ui.editor=null;ui.dirty=false;render();}else target.value=ui.date;}
    if(target.name==='unit'){
      const fieldset=target.closest('fieldset');fieldset.querySelector('[data-basis]').textContent=['g','mL'].includes(target.value)?'每100'+target.value:'每'+target.value;
      if(fieldset.dataset.unit!==target.value){M.NUTRIENTS.forEach(k=>fieldset.querySelector(`[name="${k}"]`).value='');fieldset.dataset.unit=target.value;ui.dirty=true;setStatus('单位已更改，营养数据请按新单位填写。');}
    }
  });
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-n-action]');if(!b||!b.closest('#nutrition')||ui.saving)return;
    const action=b.dataset.nAction,key=b.dataset.id;
    try{
      if(action==='add-food'){b.closest('.nutritionMealEditor').querySelector('.nutritionFoodFields').insertAdjacentHTML('beforeend',foodEditor());ui.dirty=true;setStatus('有未保存的修改');return;}
      if(action==='remove-food'){b.closest('fieldset').remove();ui.dirty=true;setStatus('有未保存的修改');return;}
      if(['view','previous','next','open-date','cancel','new-cycle','edit-cycle','edit-meal'].includes(action)){
        if(!leave())return;ui.dirty=false;ui.editor=null;
        if(action==='view')ui.view=key;
        if(action==='previous'||action==='next')ui.date=M.shiftDate(ui.date,action==='previous'?-1:1);
        if(action==='open-date'){ui.date=key;ui.view='day';}
        if(action==='new-cycle'||action==='edit-cycle'){ui.view='cycles';ui.editor={type:'cycle',id:key};}
        if(action==='edit-meal')ui.editor={type:'meal',id:key};render();return;
      }
      if(['confirm-meal','confirm-day','skip-meal','reset-meal','choose-cycle','delete-cycle'].includes(action)&&ui.dirty){if(!leave())return;ui.dirty=false;}
      if(action==='confirm-meal')return commit(d=>M.confirmPlanned(d,ui.date,key));
      if(action==='confirm-day')return commit(d=>M.confirmDay(d,ui.date));
      if(action==='skip-meal')return commit(d=>M.saveMeal(d,ui.date,key,{status:'confirmed',foods:[]}));
      if(action==='reset-meal'&&confirm('撤销本餐实际记录？预计内容保留。'))return commit(d=>M.saveMeal(d,ui.date,key,{status:'pending'}));
      if(action==='choose-cycle')return commit(d=>M.chooseCycle(d,ui.date,$('#nutritionDayCycle').value));
      if(action==='delete-cycle'&&confirm('删除此方案？已保存的每日记录不会改变。'))return commit(d=>M.deleteCycle(d,key));
      if(action==='export'){
        if(ui.dirty&&!confirm('还有未保存的编辑。仅导出已保存的记录？'))return;
        const blob=new Blob([JSON.stringify({app:'training-tracker-nutrition',version:1,exportedAt:new Date().toISOString(),profileId:global.trainingTrackerState.activeProfileId,nutrition:data()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download=ui.date+'-饮食与身体记录.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
      }
    }catch(error){setStatus(error.message,true);}
  });
  document.addEventListener('submit',event=>{
    const form=event.target;if(!form.closest('#nutrition'))return;event.preventDefault();if(ui.saving)return;
    try{
      const get=k=>form.elements.namedItem(k).value;
      if(form.id==='nutritionCycleForm'){
        const cycle={cycleId:form.dataset.cycleId||undefined,name:get('cycleName'),startDate:get('startDate'),endDate:get('endDate'),kind:get('kind'),proteinTarget:get('proteinTarget'),meals:[...form.querySelectorAll('.nutritionMealEditor')].map(node=>({foods:readFoods(node)}))};
        return commit(d=>M.saveCycle(d,cycle));
      }
      if(form.id==='nutritionMealForm'){
        const input={status:get('status'),foods:readFoods(form),note:get('mealNote')};
        if(!input.foods.length&&input.status==='confirmed')throw new Error('没有食品时，请返回并选择“这餐没吃”；仅记文字请选择“大概 / 估算”。');
        return commit(d=>M.saveMeal(d,ui.date,form.dataset.mealId,input));
      }
      if(form.id==='nutritionMetricsForm'){const metric=Object.fromEntries(['weight','waist','steps','zone2','sleepHours'].map(k=>[k,get(k)]));metric.note=get('metricNote');return commit(d=>M.saveMetrics(d,ui.date,metric));}
    }catch(error){setStatus(error.message,true);}
  });
  global.addEventListener('beforeunload',event=>{if(ui.dirty){event.preventDefault();event.returnValue='';}});
})(window);
