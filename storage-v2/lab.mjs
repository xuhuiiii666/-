import {TrainingDatabase} from './database.mjs';
import {inspectSource, inventory} from './state-codec.mjs';
import {demoRoot} from './demo.mjs';

const $ = id => document.getElementById(id);
const database = new TrainingDatabase();
let selected = null, busy = false, selection = 0;
const labels = {profiles:'档案',programs:'训练计划',workouts:'训练日',exercises:'动作',sets:'训练组',logs:'训练日志',
  weightedEntries:'有重量的历史条目',actualDates:'实际日期',drafts:'训练草稿',templates:'动作及热身模板',rmRecords:'RM 记录'};
function status(text, state = '') { $('status').textContent = text; $('status').dataset.state = state; }
function counts(target, value, before) {
  const nodes = [];
  for (const [key, label] of Object.entries(labels)) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = before ? `${before[key]} → ${value[key]}` : String(value[key]);
    nodes.push(dt, dd);
  }
  $(target).replaceChildren(...nodes);
}
function controls() {
  $('stage').disabled = busy || !selected;
  for (const id of ['demo', 'file', 'inspect']) $(id).disabled = busy;
}
async function choose(raw, name) {
  if (busy) return;
  const token = ++selection;
  selected = null; $('inventory').replaceChildren(); $('fingerprint').textContent = ''; controls();
  try {
    const checked = await inspectSource(raw);
    if (token !== selection) return;
    selected = {raw, checked}; $('source-label').textContent = `${name} · ${(checked.bytes / 1048576).toFixed(2)} MiB`;
    counts('inventory', checked.counts); $('fingerprint').textContent = `内容校验 SHA-256：${checked.fingerprint}`;
    status('结构检查通过。尚未复制，也没有修改当前训练器。');
  } catch (error) { if (token === selection) { $('source-label').textContent = name; status(error.message, 'error'); } }
  controls();
}
async function run(action) {
  if (busy) return;
  busy = true; controls();
  try { await action(); }
  catch (error) { console.error('[storage-v2-lab]', error); status(error.message || String(error), 'error'); }
  finally { busy = false; controls(); }
}
function download(text, name) {
  const href = URL.createObjectURL(new Blob([text], {type:'application/json'}));
  const a = document.createElement('a'); a.href = href; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 10000);
}
$('demo').addEventListener('click', () => choose(JSON.stringify(demoRoot(), null, 2), '匿名格式示例'));
$('file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (file) await choose(await file.text(), file.name);
  event.target.value = '';
});
$('stage').addEventListener('click', () => run(async () => {
  if (!selected) return;
  status('正在复制并比对…');
  await database.stageSource(selected.raw);
  const loaded = await database.read();
  if (JSON.stringify(loaded.root) !== selected.checked.encoded.json) throw new Error('逐字段验证失败。');
  counts('comparison', inventory(loaded.root), selected.checked.counts);
  $('export').disabled = false; $('original').disabled = false;
  status('复制验证通过：完整内容、ID、历史、备注和草稿一致。原存档未修改，训练器尚未切换存储。', 'success');
}));
$('inspect').addEventListener('click', () => run(async () => {
  const loaded = await database.read();
  if (!loaded) { status('尚无验证副本。'); return; }
  counts('comparison', inventory(loaded.root)); $('export').disabled = false; $('original').disabled = false;
  status('已重新读取验证副本，内容校验通过。训练器仍使用原存储。', 'success');
}));
$('export').addEventListener('click', () => run(async () => download(JSON.stringify(await database.exportBackup(), null, 2), '训练器-验证副本-总存档.json')));
$('original').addEventListener('click', () => run(async () => {
  const raw = await database.original(); if (raw === null) throw new Error('没有原始文件。');
  download(raw, '训练器-迁移前原始文件.json');
}));
