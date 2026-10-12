import {openRuntimeStorage, activateRuntimeStorage, DATABASE_NAME} from './runtime.mjs?v=20261012-indexeddb-guarded-release-1';
import {TrainingDatabase} from './database.mjs?v=20261012-indexeddb-guarded-release-1';

const $ = id => document.getElementById(id);
let ready = false, busy = 0, preparedRecovery = null;
function status(event) {
  const box = $('storageSaveStatus'); if (!box) return;
  box.hidden = false;
  box.textContent = event.error ? '保存失败：' + event.error.message : event.pending ? '正在保存，请稍候…' : '已保存到本机数据库';
  box.dataset.error = event.error ? 'true' : 'false';
  $('storageRecovery').hidden = !event.error;
  updateLock();
}
function updateLock() {
  const locked = !ready || busy > 0 || !!window.trainingStorageBackend?.failure;
  for (const child of document.body.children) {
    if (child.matches('script,link,#storageShell')) continue;
    child.inert = locked;
  }
  $('storageBusy').hidden = ready && busy === 0;
}
window.setStorageOperationBusy = function(value) { busy = Math.max(0,busy + (value ? 1 : -1)); updateLock(); };
window.reportStorageActionError = function(error) {
  console.error('[storage]',error);
  if (!window.trainingStorageBackend?.failure) alert('保存未完成：' + (error.message || error));
};
window.refreshStorageMode = function() {
  if (!$('storageMode')) return;
  const enabled = !!window.trainingStorageBackend;
  $('storageMode').textContent = enabled ? '当前保存位置：本机数据库（IndexedDB）。旧存档保留，云端尚未连接。' : '当前保存位置：旧版 localStorage。切换前会下载原始备份，核对成功后启用新存储。';
  $('activateStorage').hidden = enabled;
};
function download(text, name) {
  const link = document.createElement('a'), url = URL.createObjectURL(new Blob([text],{type:'application/json'}));
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url),10000);
}
window.activateNewTrainingStorage = async function() {
  if (busy || window.trainingStorageBackend) return;
  const raw = localStorage.getItem('training-tracker-state');
  if (!raw) { window.reportStorageActionError(new Error('没有可验证的原始 ROOT，未切换。')); return; }
  const recovery = buildPageRecoverySnapshot();
  const signature = JSON.stringify({raw,state:recovery.state,pageRecovery:recovery.pageRecovery});
  if (preparedRecovery !== signature) {
    download(JSON.stringify({...recovery,rootRaw:raw},null,2),'训练器-迁移前独立救援副本.json');
    preparedRecovery = signature;
    alert('尚未迁移。请先确认救援文件已保存且可打开，再点击本按钮。文件包含原始 ROOT 和未保存页面输入；未确认的输入不会自动恢复。');
    return;
  }
  if (!confirm('确认独立救援文件已保存且可打开，并已关闭其他训练器标签页？继续后将只复制已保存 ROOT，重新加载其验证副本；未保存输入留在救援文件中，需另行确认恢复。')) return;
  let committed = false;
  window.trainingStorageMigrationInProgress = true;
  window.setStorageOperationBusy(true);
  try {
    const backend = await activateRuntimeStorage(raw,localStorage,status);
    committed = true;
    backend.database.close();
    // Reload removes both stale runtime aliases and stale DOM inputs before any save.
    ready = false;
    updateLock();
    location.reload();
  } catch (error) { window.reportStorageActionError(error); }
  finally {
    if (!committed) {
      window.trainingStorageMigrationInProgress = false;
      window.setStorageOperationBusy(false);
    }
  }
};
window.retryTrainingStorage = async function() {
  if (!window.trainingStorageBackend || busy) return;
  window.setStorageOperationBusy(true);
  try { await window.trainingStorageBackend.retry(window.trainingTrackerState); }
  catch(error) { alert('重试未完成：' + error.message); }
  finally { window.setStorageOperationBusy(false); }
};
window.exportUnsavedTrainingState = function() {
  if (window.trainingTrackerState) download(JSON.stringify(buildPageRecoverySnapshot(),null,2),'训练器-未保存页面数据.json');
};
function buildPageRecoverySnapshot() {
  // Preserve visible inputs separately without turning a reference into execution data.
  const inputs=[...document.querySelectorAll('#exercises input,#exercises select,#exercises textarea,#warmupExercises input,#warmupExercises select,#warmupExercises textarea,#nutrition input,#nutrition select,#nutrition textarea,#sessionNote,#floatingSessionNote')].map(node=>({
    id:node.id,name:node.name,field:node.dataset.field||'',value:node.value,
    setId:node.closest('[data-set-id]')?.dataset.setId||'',
    exerciseId:node.closest('[data-card-id]')?.dataset.cardId||'',
    reference:node.closest('[data-history-weight-reference]')?.dataset.historyWeightReference||'',
    completed:node.closest('.setrow')?.classList.contains('done')||false
  }));
  return {app:'training-tracker',version:6,exportedAt:new Date().toISOString(),state:window.trainingTrackerState,
    pageRecovery:{workoutId:window.state?.currentWorkoutId||'',inputs,nutritionHTML:document.getElementById('nutrition')?.innerHTML||''}};
}
window.exportLegacyRootSnapshot = function() {
  const raw=localStorage.getItem('training-tracker-state');
  if(raw===null){alert('没有旧版原始存档。');return;}
  download(raw,'训练器-旧版原始存档.json');
};
window.exportIndexedTrainingState = async function() {
  try {
    const db = window.trainingStorageBackend?.database || new TrainingDatabase(DATABASE_NAME);
    download(JSON.stringify(await db.exportBackup(),null,2),'训练器-本机数据库-总存档.json');
  } catch(error) { alert('导出失败：'+error.message); }
};
window.addEventListener('beforeunload', event => {
  const backend = window.trainingStorageBackend;
  if (backend?.pending || backend?.failure) { event.preventDefault(); event.returnValue=''; }
});
updateLock();
try {
  window.trainingStorageBackend = await openRuntimeStorage(localStorage,status);
  await new Promise((resolve,reject) => {
    const script=document.createElement('script');
    script.src='app.js?v='+encodeURIComponent(window.APP_BUILD_VERSION);
    script.onload=resolve;script.onerror=()=>reject(new Error('训练器脚本加载失败，请刷新。'));
    document.body.append(script);
  });
  if(!window.trainingAppInitialized)throw new Error('训练页面初始化失败，已保留数据并停止操作。');
  ready=true; updateLock(); window.refreshStorageMode();
  $('appBuildVersion').textContent=window.APP_BUILD_VERSION;
  if(window.trainingStorageBackend)window.trainingStorageBackend.emit();
  window.trainingAppReady=true;
} catch(error) {
  console.error('[storage startup]',error);
  $('storageBusy').textContent='启动已停止：'+error.message+' 原始存档没有被覆盖。';
  $('storageRecovery').hidden=false;
  $('retryStorage').hidden=true;
}
