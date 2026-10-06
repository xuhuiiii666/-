// Storage layout version is independent of the application's unchanged v6 schema.
export const LAYOUT_VERSION = 1;
export const ROOT_KEY = 'training-tracker-state';

export class StorageV2Error extends Error {
  constructor(code, message) { super(message); this.name = 'StorageV2Error'; this.code = code; }
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new StorageV2Error('INVALID_STATE', message); };

export function validateRoot(root) {
  if (!object(root) || root.schemaVersion !== 6 || !object(root.profiles)) fail('需要 Schema 6 训练器总存档。');
  const active = root.profiles[root.activeProfileId];
  if (!object(active) || !object(active.programs) || !Object.hasOwn(active.programs, root.activeProgramId)) fail('当前档案或训练计划引用无效。');
  for (const profile of Object.values(root.profiles)) {
    if (!object(profile) || !object(profile.programs)) fail('档案缺少 programs。');
    for (const program of Object.values(profile.programs)) {
      if (!object(program) || !Array.isArray(program.days)) fail('训练计划缺少 days。');
      if (program.workoutLogs !== undefined && !Array.isArray(program.workoutLogs)) fail('workoutLogs 必须为数组。');
      const workouts = new Set();
      for (const day of program.days) {
        if (!object(day) || !day.workoutId || workouts.has(day.workoutId)) fail('Workout ID 缺失或重复，已停止复制。');
        workouts.add(day.workoutId);
      }
    }
  }
  return root;
}

export function parseSource(raw) {
  if (typeof raw !== 'string' || !raw.trim()) fail('存档为空。');
  let source;
  try { source = JSON.parse(raw); } catch { fail('存档不是有效的 JSON。'); }
  const root = source?.app === 'training-tracker' && object(source.state) ? source.state : source;
  return validateRoot(root);
}

// Store descriptors separately from user payload, so user fields cannot collide
// with reference markers. Property and array order are preserved on reconstruction.
export function encodeRoot(root) {
  validateRoot(root);
  const documents = [];
  function walk(value, path, mode) {
    if (['root','profiles','profile','programs','program','nutrition','nutritionDays'].includes(mode)) {
      return {type: 'object', entries: Object.entries(value).map(([key, child]) => {
        let next = 'leaf';
        if (mode === 'root' && key === 'profiles') next = 'profiles';
        if (mode === 'profiles') next = 'profile';
        if (mode === 'profile' && key === 'programs') next = 'programs';
        if (mode === 'profile' && key === 'nutrition' && object(child)) next = 'nutrition';
        if (mode === 'nutrition' && ['days','metrics'].includes(key) && object(child)) next = 'nutritionDays';
        if (mode === 'nutrition' && key === 'cycles' && Array.isArray(child)) next = 'array';
        if (mode === 'programs') next = 'program';
        if (mode === 'program' && ['days', 'workoutLogs'].includes(key) && Array.isArray(child)) next = 'array';
        return [key, walk(child, [...path, key], next)];
      })};
    }
    if (mode === 'array') return {type: 'array', items: value.map((child, index) => walk(child, [...path, index], 'leaf'))};
    const key = JSON.stringify(path), json = JSON.stringify(value);
    if (json === undefined) fail('存档包含无法序列化的字段。');
    documents.push({key, json});
    return {type: 'document', key};
  }
  const tree = walk(root, [], 'root');
  return {layoutVersion: LAYOUT_VERSION, tree, documents, json: JSON.stringify(root)};
}

export function decodeRoot(tree, documents) {
  const map = new Map(documents.map(row => [row.key, row.json]));
  function walk(node) {
    if (node.type === 'object') return Object.fromEntries(node.entries.map(([key, child]) => [key, walk(child)]));
    if (node.type === 'array') return node.items.map(walk);
    if (node.type !== 'document' || !map.has(node.key)) throw new StorageV2Error('INCOMPLETE_STORAGE', '新存储缺少记录，已停止读取；不会回退并覆盖旧存档。');
    return JSON.parse(map.get(node.key));
  }
  return validateRoot(walk(tree));
}

export async function sha256(text) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
}
export const byteSize = text => new TextEncoder().encode(text).byteLength;

export function inventory(root) {
  validateRoot(root);
  const count = {profiles: 0, programs: 0, workouts: 0, exercises: 0, sets: 0, logs: 0,
    weightedEntries: 0, actualDates: 0, drafts: 0, templates: 0, rmRecords: 0};
  for (const profile of Object.values(root.profiles)) {
    count.profiles++;
    for (const key of ['exerciseTemplates', 'warmupTemplates', 'warmupActionTemplates']) count.templates += (profile[key] || []).length;
    count.rmRecords += (profile.rmRecords || []).length;
    for (const program of Object.values(profile.programs)) {
      count.programs++; count.workouts += program.days.length;
      count.logs += (program.workoutLogs || []).length;
      count.actualDates += Object.keys(program.actualDates || {}).length;
      count.drafts += Object.keys(program.currentWorkoutDrafts || {}).length;
      for (const day of program.days) for (const exercise of day.exercises || []) {
        count.exercises++; count.sets += (exercise.sets || []).length;
      }
      for (const log of program.workoutLogs || []) {
        const entries = log.entries || (log.exercises || log.training || log.items || []).flatMap(ex => ex.sets || []);
        count.weightedEntries += entries.filter(e => (e.weight !== undefined && e.weight !== null && String(e.weight) !== '') || Number(e.weightKg) > 0).length;
      }
    }
  }
  return count;
}

export async function inspectSource(raw) {
  const root = parseSource(raw), encoded = encodeRoot(root);
  if (JSON.stringify(decodeRoot(encoded.tree, encoded.documents)) !== encoded.json) throw new StorageV2Error('ROUND_TRIP_FAILED', '完整性比对失败。');
  return {root, encoded, sourceHash: await sha256(raw), fingerprint: await sha256(encoded.json), bytes: byteSize(raw), counts: inventory(root)};
}
