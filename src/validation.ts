import { LIMITS, safeUrl } from './model.ts';
import type { Capsule, Spec, Run, Evidence } from './model.ts';
const fail = (message: string): never => { throw new Error(message); };
function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key)) || keys.some(key => !(key in record))) fail(`${label} has missing or unexpected fields.`);
  return record;
}
function text(value: unknown, label: string, max = 2000, required = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${label} must be ${required ? 'non-empty text' : 'text'} of at most ${max} characters.`);
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) fail('Invalid identifier.');
}
function timestamp(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('Invalid ISO UTC timestamp.');
}
function array(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(`${label} must contain at most ${max} items.`);
  return value as unknown[];
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicate identifiers.`);
}
function validateSpec(value: unknown): asserts value is Spec {
  const s = object(value, ['title','summary','demoUrl','sourceUrl','version','environment','preconditions','steps'], 'Case details');
  text(s.title, 'Title', 120, true); text(s.summary, 'Summary'); text(s.version, 'Version', 200);
  text(s.environment, 'Environment'); text(s.preconditions, 'Preconditions');
  for (const key of ['demoUrl','sourceUrl']) {
    text(s[key], key, 2048);
    if (s[key] && !safeUrl(s[key] as string)) fail('Links must use HTTP(S), without embedded credentials.');
  }
  const steps = array(s.steps, LIMITS.steps, 'Steps');
  if (!steps.length) fail('Add at least one reproduction step.');
  for (const step of steps) {
    const row = object(step, ['id','action','expected'], 'Step');
    identifier(row.id); text(row.action, 'Action', 1500, true); text(row.expected, 'Expected result', 1500, true);
  }
  unique((steps as Spec['steps']).map(step => step.id), 'Steps');
}
export function pngBytes(dataUrl: string): Uint8Array {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) fail('Evidence must be a PNG data URL.');
  const base64 = dataUrl.slice('data:image/png;base64,'.length);
  if (base64.length > Math.ceil(LIMITS.imageBytes / 3) * 4 + 4 || base64.length % 4) fail('Evidence exceeds 2 MB or has invalid base64.');
  let raw: string;
  try { raw = atob(base64); } catch { return fail('Invalid evidence encoding.'); }
  const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
  if (bytes.length > LIMITS.imageBytes || bytes.length < 33) fail('Evidence size is invalid.');
  return bytes;
}
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137,80,78,71,13,10,26,10];
  if (bytes.length < 33 || signature.some((n,i) => bytes[i] !== n) || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR') fail('Invalid PNG header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width * height > LIMITS.pixels) fail('Image must be at most 8 megapixels.');
  return { width, height };
}
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
}
export function validateCapsule(value: unknown): asserts value is Capsule {
  const c = object(value, ['format','schemaVersion','id','createdAt','updatedAt','spec','runs','evidence'], 'Backup');
  if (c.format !== 'repro-relay' || c.schemaVersion !== 1) fail('This is not a supported Repro Relay v1 backup.');
  identifier(c.id); timestamp(c.createdAt); timestamp(c.updatedAt); validateSpec(c.spec);
  const evidence = array(c.evidence, LIMITS.images, 'Evidence');
  for (const item of evidence) {
    const image = object(item, ['id','caption','width','height','png','sha256'], 'Evidence');
    identifier(image.id); text(image.caption, 'Caption', 240); text(image.png, 'Image', LIMITS.imageBytes * 1.4);
    if (typeof image.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(image.sha256)) fail('Invalid evidence digest.');
    const size = pngSize(pngBytes(image.png as string));
    if (size.width !== image.width || size.height !== image.height || Math.max(size.width,size.height) > LIMITS.edge) fail('Evidence dimensions do not match, or exceed 1600px.');
  }
  unique((evidence as Evidence[]).map(image => image.id), 'Evidence');
  const imageIds = new Set((evidence as Evidence[]).map(image => image.id));
  const runs = array(c.runs, LIMITS.runs, 'Runs');
  unique((runs as Run[]).map(run => run?.id), 'Runs');
  const finished = new Set<string>();
  for (const item of runs) {
    const run = object(item, ['id','completedAt','spec','observations','baselineId','fixNote'], 'Run');
    identifier(run.id); timestamp(run.completedAt); text(run.fixNote, 'Fix note'); validateSpec(run.spec);
    if (run.baselineId !== null && (typeof run.baselineId !== 'string' || !finished.has(run.baselineId))) fail('A retest must reference an earlier completed run.');
    const observations = array(run.observations, LIMITS.steps, 'Results');
    const stepIds = new Set((run.spec as Spec).steps.map(step => step.id));
    for (const item of observations) {
      const observation = object(item, ['stepId','outcome','actual','evidenceIds'], 'Result');
      identifier(observation.stepId); text(observation.actual, 'Observed result', 2000);
      if (!stepIds.has(observation.stepId) || !['not-tested','pass','fail','blocked'].includes(observation.outcome as string)) fail('Result does not match a step or outcome.');
      const ids = array(observation.evidenceIds, LIMITS.images, 'Evidence references');
      if (ids.some(value => typeof value !== 'string' || !imageIds.has(value))) fail('Evidence reference is missing.');
      unique(ids as string[], 'Evidence references');
    }
    const observedIds = observations.map(item => (item as {stepId:string}).stepId);
    unique(observedIds, 'Results');
    if (observedIds.length !== stepIds.size) fail('Every step needs a result, including untested steps.');
    finished.add(run.id as string);
  }
}
export async function parseBackup(source: string, checkImage?: (image: Evidence) => Promise<void>): Promise<Capsule> {
  if (new TextEncoder().encode(source).length > LIMITS.importBytes) fail('Backup exceeds 20 MB.');
  let value: unknown;
  try { value = JSON.parse(source); } catch { return fail('This file is not valid JSON.'); }
  validateCapsule(value);
  for (const image of value.evidence) {
    if (await hashBytes(pngBytes(image.png)) !== image.sha256) fail('An evidence image changed: its SHA-256 does not match.');
    if (checkImage) await checkImage(image);
  }
  return structuredClone(value);
}
