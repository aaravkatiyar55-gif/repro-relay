export type Outcome = 'not-tested' | 'pass' | 'fail' | 'blocked';
export interface Step { id: string; action: string; expected: string }
export interface Spec {
  title: string; summary: string; demoUrl: string; sourceUrl: string; version: string;
  environment: string; preconditions: string; steps: Step[];
}
export interface Observation { stepId: string; outcome: Outcome; actual: string; evidenceIds: string[] }
export interface Run {
  id: string; completedAt: string; spec: Spec; observations: Observation[];
  baselineId: string | null; fixNote: string;
}
export interface Evidence {
  id: string; caption: string; width: number; height: number; png: string; sha256: string;
}
export interface Capsule {
  format: 'repro-relay'; schemaVersion: 1; id: string; createdAt: string; updatedAt: string;
  spec: Spec; runs: Run[]; evidence: Evidence[];
}
export const LIMITS = Object.freeze({
  cases: 20, steps: 12, runs: 20, images: 6, imageBytes: 2 * 1024 * 1024,
  sourceBytes: 5 * 1024 * 1024, pixels: 8_000_000, edge: 1600,
  importBytes: 20 * 1024 * 1024, storageBytes: 40 * 1024 * 1024,
});
export const id = () => crypto.randomUUID();
export const clone = <T>(value: T): T => structuredClone(value);
export const blankStep = (): Step => ({ id: id(), action: '', expected: '' });
export function newCase(): Capsule {
  const now = new Date().toISOString();
  return { format: 'repro-relay', schemaVersion: 1, id: id(), createdAt: now, updatedAt: now,
    spec: { title: '', summary: '', demoUrl: '', sourceUrl: '', version: '', environment: '', preconditions: '', steps: [blankStep()] },
    runs: [], evidence: [] };
}
export function startRun(capsule: Capsule, baselineId: string | null = null): Run {
  if (baselineId && !capsule.runs.some(run => run.id === baselineId)) throw new Error('The baseline run is missing.');
  return { id: id(), completedAt: '', spec: clone(capsule.spec), baselineId, fixNote: '',
    observations: capsule.spec.steps.map(step => ({ stepId: step.id, outcome: 'not-tested', actual: '', evidenceIds: [] })) };
}
export function finishRun(capsule: Capsule, draft: Run): Capsule {
  if (capsule.runs.length >= LIMITS.runs) throw new Error('This case already has 20 runs. Export it and start a separate case.');
  if (capsule.runs.some(run => run.id === draft.id)) throw new Error('This run is already completed. Start a new retest.');
  const result = clone(capsule);
  const run = clone(draft);
  run.completedAt = new Date().toISOString();
  result.runs.push(run);
  result.updatedAt = run.completedAt;
  return result;
}
export function importedCopy(capsule: Capsule): Capsule {
  const result = clone(capsule);
  result.id = id();
  result.updatedAt = new Date().toISOString();
  return result;
}
export const safeUrl = (value: string): string => {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
};
export const outcomeLabel: Record<Outcome, string> = {
  'not-tested': 'Not tested', pass: 'Pass', fail: 'Fail', blocked: 'Blocked',
};
