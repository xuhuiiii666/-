import {openRuntimeStorage, activateRuntimeStorage, DATABASE_NAME} from './runtime.mjs?v=20261006-nutrition-local-1';
import {TrainingDatabase} from './database.mjs';

const $ = id => document.getElementById(id);
let ready = false, busy = 0;
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
  if (!confirm('将下载原始备份，然后复制并切换到本机数据库。请确认备份下载成功，并关闭其他旧版训练器页面。旧存档不会删除。继续？')) return;
  window.setStorageOperationBusy(true);
  try {
    const raw = localStorage.getItem('training-tracker-state') || JSON.stringify(window.trainingTrackerState);
    download(raw,'训练器-切换前原始存档.json');
    window.trainingStorageBackend = await activateRuntimeStorage(raw,localStorage,status);
    window.trainingStorageBackend.emit();
    window.refreshStorageMode(); window.renderSettings();
    alert('已核对并切换到本机数据库。原计划、记录和 ID 保留，旧存档未删除。');
  } catch (error) { window.reportStorageActionError(error); }
  finally { window.setStorageOperationBusy(false); }
};
window.retryTrainingStorage = async function() {
  if (!window.trainingStorageBackend || busy) return;
  window.setStorageOperationBusy(true);
  try { await window.trainingStorageBackend.retry(window.trainingTrackerState); }
  catch(error) { alert('重试未完成：' + error.message); }
  finally { window.setStorageOperationBusy(false); }
};
window.exportUnsavedTrainingState = function() {
  if (window.trainingTrackerState) download(JSON.stringify({app:'training-tracker',version:6,state:window.trainingTrackerState},null,2),'训练器-未保存页面数据.json');
};
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
