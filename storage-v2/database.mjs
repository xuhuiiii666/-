import Dexie from './vendor/dist/dexie.mjs';
import {LAYOUT_VERSION, ROOT_KEY, StorageV2Error, inspectSource, encodeRoot, decodeRoot, sha256} from './state-codec.mjs';

// The laboratory defaults to a separate database. Runtime activation explicitly
// uses training-tracker-data and leaves the original localStorage root intact.
export const LAB_DATABASE = 'training-tracker-storage-v2-lab';

export class TrainingDatabase {
  constructor(name = LAB_DATABASE) {
    this.db = new Dexie(name);
    this.db.version(LAYOUT_VERSION).stores({documents: '&key', metadata: '&key', originals: '&key'});
    this.db.on('versionchange', () => this.db.close());
  }
  close() { this.db.close(); }
  async status() {
    const manifest = await this.db.metadata.get('manifest');
    return manifest ? {revision: manifest.revision, fingerprint: manifest.fingerprint, sourceHash: manifest.sourceHash} : null;
  }
  async read() {
    const {manifest, documents} = await this.db.transaction('r', this.db.metadata, this.db.documents, async () => ({
      manifest: await this.db.metadata.get('manifest'), documents: await this.db.documents.toArray()
    }));
    if (!manifest) {
      if (documents.length || await this.db.originals.count()) throw new StorageV2Error('INCOMPLETE_STORAGE', '存储缺少索引，已停止读取。');
      return null;
    }
    if (manifest.layoutVersion !== LAYOUT_VERSION) throw new StorageV2Error('UNKNOWN_LAYOUT', '新存储版本不兼容。');
    const root = decodeRoot(manifest.tree, documents);
    if (await sha256(JSON.stringify(root)) !== manifest.fingerprint) throw new StorageV2Error('HASH_MISMATCH', '存储内容与校验值不一致，已停止读取。');
    return {root, revision: manifest.revision, fingerprint: manifest.fingerprint};
  }
  async original() { return (await this.db.originals.get(ROOT_KEY))?.raw ?? null; }

  async stageSource(raw, options = {}) {
    const inspected = await inspectSource(raw);
    return this.db.transaction('rw', this.db.documents, this.db.metadata, this.db.originals, async () => {
      const current = await this.db.metadata.get('manifest');
      if (current) {
        if (current.sourceHash === inspected.sourceHash && current.fingerprint === inspected.fingerprint) {
          const existing = decodeRoot(current.tree, await this.db.documents.toArray());
          if (JSON.stringify(existing) !== inspected.encoded.json || (await this.db.originals.get(ROOT_KEY))?.raw !== raw) {
            throw new StorageV2Error('HASH_MISMATCH', '已有副本未通过完整性验证。');
          }
          if (options.beforeCommit) options.beforeCommit();
          if (options.activation) await this.db.metadata.put({key:'activation', ...options.activation});
          return {revision: current.revision, fingerprint: current.fingerprint, counts: inspected.counts, unchanged: true};
        }
        throw new StorageV2Error('DESTINATION_EXISTS', '已有不同的验证副本，请先导出；本次没有覆盖。');
      }
      if (await this.db.documents.count() || await this.db.originals.count()) throw new StorageV2Error('INCOMPLETE_STORAGE', '已有未通过完整性检查的记录，本次没有覆盖。');
      await this.db.documents.bulkPut(inspected.encoded.documents);
      const reconstructed = decodeRoot(inspected.encoded.tree, await this.db.documents.toArray());
      if (JSON.stringify(reconstructed) !== inspected.encoded.json) throw new StorageV2Error('ROUND_TRIP_FAILED', '写入后比对失败，整笔事务已取消。');
      await this.db.originals.add({key: ROOT_KEY, raw, sourceHash: inspected.sourceHash});
      await this.db.metadata.add({key: 'manifest', layoutVersion: LAYOUT_VERSION, revision: 1,
        tree: inspected.encoded.tree, fingerprint: inspected.fingerprint, sourceHash: inspected.sourceHash});
      if (options.beforeCommit) options.beforeCommit();
      if (options.activation) await this.db.metadata.put({key:'activation', ...options.activation});
      return {revision: 1, fingerprint: inspected.fingerprint, counts: inspected.counts, unchanged: false};
    });
  }

  // All callers must await this commit before acknowledging a successful save.
  // Optimistic revision checks prevent two tabs silently overwriting each other.
  async commit(root, expectedRevision) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new StorageV2Error('REVISION_REQUIRED', '保存必须提供已读取的版本。');
    const previous = await this.read();
    if (!previous || previous.revision !== expectedRevision) throw new StorageV2Error('REVISION_CONFLICT', '记录已更新，请重新读取后再保存。');
    const encoded = encodeRoot(root), fingerprint = await sha256(encoded.json);
    return this.db.transaction('rw', this.db.documents, this.db.metadata, async () => {
      const current = await this.db.metadata.get('manifest');
      if (!current || current.revision !== expectedRevision) throw new StorageV2Error('REVISION_CONFLICT', '记录已由另一个页面更新，本次没有覆盖。请重新读取后再保存。');
      const existing = await this.db.documents.toArray();
      const restored = decodeRoot(current.tree, existing);
      if (JSON.stringify(restored) !== JSON.stringify(previous.root)) throw new StorageV2Error('HASH_MISMATCH', '存储在校验后发生变化，未保存。');
      const byKey = new Map(existing.map(row => [row.key, row.json]));
      const changed = encoded.documents.filter(row => byKey.get(row.key) !== row.json);
      const nextKeys = new Set(encoded.documents.map(row => row.key));
      const removed = existing.filter(row => !nextKeys.has(row.key)).map(row => row.key);
      if (!changed.length && !removed.length && JSON.stringify(current.tree) === JSON.stringify(encoded.tree)) {
        if (current.fingerprint !== fingerprint) throw new StorageV2Error('HASH_MISMATCH', '校验值不一致，未保存。');
        return {revision: current.revision, fingerprint, changedRecords: 0, removedRecords: 0};
      }
      if (changed.length) await this.db.documents.bulkPut(changed);
      if (removed.length) await this.db.documents.bulkDelete(removed);
      if (JSON.stringify(decodeRoot(encoded.tree, await this.db.documents.toArray())) !== encoded.json) throw new StorageV2Error('ROUND_TRIP_FAILED', '保存校验失败，整笔事务已取消。');
      const revision = current.revision + 1;
      await this.db.metadata.put({...current, tree: encoded.tree, revision, fingerprint});
      return {revision, fingerprint, changedRecords: changed.length, removedRecords: removed.length};
    });
  }

  async exportBackup() {
    const snapshot = await this.read();
    if (!snapshot) throw new StorageV2Error('EMPTY_STORAGE', '尚无验证副本。');
    return {app: 'training-tracker', version: 6, exportedAt: new Date().toISOString(), state: snapshot.root};
  }
}
