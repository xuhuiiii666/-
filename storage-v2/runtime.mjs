import {TrainingDatabase} from './database.mjs';
import {ROOT_KEY, sha256, StorageV2Error} from './state-codec.mjs';

export const DATABASE_NAME = 'training-tracker-data';
const clone = value => JSON.parse(JSON.stringify(value));

export class RuntimeStorage {
  constructor(database, source, snapshot, activation, notify = () => {}) {
    this.database = database; this.source = source; this.root = snapshot.root;
    this.revision = snapshot.revision; this.activation = activation; this.notify = notify;
    this.pending = 0; this.failure = null; this.tail = Promise.resolve(); this.lastRaw = JSON.stringify(this.root);
  }
  async checkSource() {
    const raw = this.source.getItem(ROOT_KEY);
    const fingerprint = raw === null ? null : await sha256(raw);
    if (fingerprint !== this.activation.legacyHash) throw new StorageV2Error('LEGACY_CHANGED', '旧页面修改了升级前存档。已停止保存，请先导出当前数据和旧存档，再检查两份记录。');
  }
  save(root) {
    const candidate = clone(root);
    this.pending++; this.emit();
    const operation = this.tail.then(async () => {
      if (this.failure) throw this.failure;
      await this.checkSource();
      const result = await this.database.commit(candidate, this.revision);
      this.revision = result.revision; this.root = candidate; this.lastRaw = JSON.stringify(candidate);
      return root;
    });
    this.tail = operation.then(() => { this.pending--; this.emit(); }, error => {
      this.pending--; this.failure = error; this.emit();
    });
    // Autosave callers may intentionally keep typing without awaiting. The error
    // is always surfaced via status; explicit commit callers still see rejection.
    operation.catch(() => {});
    return operation;
  }
  async flush() { await this.tail; if (this.failure) throw this.failure; }
  emit() { this.notify({pending:this.pending, error:this.failure, revision:this.revision}); }
  async retry(root) {
    await this.tail;
    if (['LEGACY_CHANGED','REVISION_CONFLICT','HASH_MISMATCH','INCOMPLETE_STORAGE'].includes(this.failure?.code)) throw this.failure;
    this.failure = null;
    return this.save(root);
  }
}

export async function openRuntimeStorage(source, notify) {
  const database = new TrainingDatabase(DATABASE_NAME);
  const activation = await database.db.metadata.get('activation');
  if (!activation) { database.close(); return null; }
  const snapshot = await database.read();
  if (!snapshot) throw new StorageV2Error('INCOMPLETE_STORAGE','新存储已启用但数据不可读，已停止启动。旧存档未覆盖。');
  const runtime = new RuntimeStorage(database, source, snapshot, activation, notify);
  await runtime.checkSource();
  return runtime;
}

export async function activateRuntimeStorage(raw, source, notify) {
  const database = new TrainingDatabase(DATABASE_NAME), before = source.getItem(ROOT_KEY);
  if(before!==null&&before!==raw)throw new StorageV2Error('LEGACY_CHANGED','原存档已经变化，本次未切换。请重新备份后再试。');
  const activation = {legacyHash:before === null ? null : await sha256(before), activatedAt:new Date().toISOString()};
  await database.stageSource(raw, {activation, beforeCommit() {
    if (source.getItem(ROOT_KEY) !== before) throw new StorageV2Error('LEGACY_CHANGED','复制期间原存档发生变化，本次未切换。请重新备份后再试。');
  }});
  const snapshot = await database.read();
  return new RuntimeStorage(database, source, snapshot, activation, notify);
}
