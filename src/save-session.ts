import { clone } from './model.ts';
import type { Capsule } from './model.ts';
export interface SaveAttempt { snapshot: Capsule; expected: string|null; revision: number }

/** Keeps edits made during slow storage work separate from the snapshot being saved. */
export class SaveSession {
  private revisions = new Map<string,number>();
  touch(caseId:string) { this.revisions.set(caseId,(this.revisions.get(caseId) || 0)+1); }
  capture(capsule:Capsule, previous?:Capsule):SaveAttempt {
    const snapshot = clone(capsule);
    snapshot.updatedAt = new Date(Math.max(Date.now(),Date.parse(previous?.updatedAt || capsule.updatedAt)+1)).toISOString();
    return {snapshot,expected:previous?.updatedAt ?? null,revision:this.revisions.get(capsule.id) || 0};
  }
  accept(capsule:Capsule,attempt:SaveAttempt):boolean {
    if (capsule.id !== attempt.snapshot.id) throw new Error('Save result belongs to another case.');
    capsule.updatedAt = attempt.snapshot.updatedAt;
    return (this.revisions.get(capsule.id) || 0) === attempt.revision;
  }
  forget(caseId:string) { this.revisions.delete(caseId); }
}
