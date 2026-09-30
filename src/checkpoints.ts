import { LIMITS, clone, importedCopy } from './model.ts';
import type { Capsule, Evidence, Run } from './model.ts';
import { parseBackup, validateCapsule } from './validation.ts';

export interface RunCheckpoint { caseId: string; savedAt: string; run: Run }
const keys = (value: unknown, fields: string[], label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(record,key))) throw new Error(`${label} has missing or unexpected fields.`);
  return record;
};
export function validateCheckpoint(value: unknown, capsule: Capsule): asserts value is RunCheckpoint {
  validateCapsule(capsule);
  const checkpoint = keys(value,['caseId','savedAt','run'],'Draft checkpoint');
  if (checkpoint.caseId !== capsule.id) throw new Error('This draft belongs to another case.');
  if (typeof checkpoint.savedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(checkpoint.savedAt) || !Number.isFinite(Date.parse(checkpoint.savedAt)) || new Date(checkpoint.savedAt).toISOString() !== checkpoint.savedAt) throw new Error('Invalid draft save time.');
  const run = keys(checkpoint.run,['id','completedAt','spec','observations','baselineId','fixNote'],'Draft run');
  if (run.completedAt !== '') throw new Error('A checkpoint must contain an unfinished run.');
  if (capsule.runs.some(item => item.id === run.id)) throw new Error('This draft is already in the completed history.');
  // Reuse the full run/reference validator without changing the actual unfinished run.
  const candidate = clone(capsule);
  candidate.runs.push({...clone(run),completedAt:checkpoint.savedAt} as unknown as Run);
  validateCapsule(candidate);
}
export function checkpointFor(capsule: Capsule, run: Run): RunCheckpoint {
  const result = {caseId:capsule.id,savedAt:new Date().toISOString(),run:clone(run)};
  validateCheckpoint(result,capsule);
  return result;
}
export function buildCheckpointBackup(capsule: Capsule, run: Run): string {
  const checkpoint = checkpointFor(capsule,run);
  return JSON.stringify({format:'repro-relay-checkpoint',schemaVersion:1,capsule,checkpoint},null,2);
}
export async function parsePortable(source: string, checkImage?: (image: Evidence) => Promise<void>): Promise<{capsule:Capsule;checkpoint:RunCheckpoint|null}> {
  if (new TextEncoder().encode(source).length > LIMITS.importBytes) throw new Error('Backup exceeds 20 MB.');
  let raw: unknown;
  try { raw = JSON.parse(source); } catch { throw new Error('This file is not valid JSON.'); }
  if ((raw as {format?:unknown} | null)?.format !== 'repro-relay-checkpoint') return {capsule:await parseBackup(source,checkImage),checkpoint:null};
  const packet = keys(raw,['format','schemaVersion','capsule','checkpoint'],'Draft backup');
  if (packet.schemaVersion !== 1) throw new Error('Unsupported draft backup version.');
  const capsule = await parseBackup(JSON.stringify(packet.capsule),checkImage);
  validateCheckpoint(packet.checkpoint,capsule);
  return {capsule,checkpoint:clone(packet.checkpoint)};
}
export function portableCopy(packet: {capsule:Capsule;checkpoint:RunCheckpoint|null}) {
  const capsule = importedCopy(packet.capsule);
  const checkpoint = packet.checkpoint ? {...clone(packet.checkpoint),caseId:capsule.id} : null;
  if (checkpoint) validateCheckpoint(checkpoint,capsule);
  return {capsule,checkpoint};
}
