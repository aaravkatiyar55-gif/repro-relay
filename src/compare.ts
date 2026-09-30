import type { Run, Outcome } from './model.ts';
export type Change = 'resolved' | 'regressed' | 'still-failing' | 'unverified' | 'unchanged' | 'criteria-changed' | 'added' | 'removed';
export interface Comparison {
  stepId: string; action: string; expected: string; before: Outcome | null; after: Outcome | null;
  beforeActual: string; afterActual: string; change: Change;
}
export const changeLabel: Record<Change, string> = {
  resolved: 'Passed on retest', regressed: 'New failure', 'still-failing': 'Still failing',
  unverified: 'Needs checking', unchanged: 'Same result', 'criteria-changed': 'Criteria changed',
  added: 'Added step', removed: 'Removed step',
};
export function compareRuns(before: Run, after: Run): Comparison[] {
  const ids = [...new Set([...before.spec.steps.map(s => s.id), ...after.spec.steps.map(s => s.id)])];
  return ids.map(stepId => {
    const oldStep = before.spec.steps.find(s => s.id === stepId);
    const newStep = after.spec.steps.find(s => s.id === stepId);
    const oldResult = before.observations.find(o => o.stepId === stepId);
    const newResult = after.observations.find(o => o.stepId === stepId);
    const oldOutcome = oldResult?.outcome ?? null;
    const newOutcome = newResult?.outcome ?? null;
    let change: Change = 'unchanged';
    if (!oldStep) change = 'added';
    else if (!newStep) change = 'removed';
    else if (oldStep.action !== newStep.action || oldStep.expected !== newStep.expected || before.spec.preconditions !== after.spec.preconditions) change = 'criteria-changed';
    else if (!oldOutcome || !newOutcome || ['not-tested', 'blocked'].includes(oldOutcome) || ['not-tested', 'blocked'].includes(newOutcome)) change = 'unverified';
    else if (oldOutcome === 'fail' && newOutcome === 'pass') change = 'resolved';
    else if (oldOutcome === 'pass' && newOutcome === 'fail') change = 'regressed';
    else if (oldOutcome === 'fail' && newOutcome === 'fail') change = 'still-failing';
    return { stepId, action: (newStep ?? oldStep)!.action, expected: (newStep ?? oldStep)!.expected,
      before: oldOutcome, after: newOutcome, beforeActual: oldResult?.actual ?? '', afterActual: newResult?.actual ?? '', change };
  });
}
