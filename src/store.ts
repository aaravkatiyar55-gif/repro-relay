import { LIMITS, clone } from './model.ts';
import type { Capsule } from './model.ts';
import { parseBackup, validateCapsule } from './validation.ts';
import { validateCheckpoint } from './checkpoints.ts';
import type { RunCheckpoint } from './checkpoints.ts';

export class SaveConflict extends Error {
  constructor() { super('Another tab changed this case. Your work is still here. Download a backup or save a separate copy, then reload to see the other tab’s changes.'); this.name='SaveConflict'; }
}
export class CaseStore {
  private connection: Promise<IDBDatabase> | null = null;
  private readonly factory:IDBFactory;
  private readonly name:string;
  constructor(factory: IDBFactory = indexedDB, name = 'repro-relay-v1') {this.factory=factory;this.name=name;}
  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve,reject) => {
      const request = this.factory.open(this.name,2);
      let rejected = false;
      const fail = (message:string) => { rejected=true; this.connection=null; reject(new Error(message)); };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('cases')) db.createObjectStore('cases',{keyPath:'id'});
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts',{keyPath:'caseId'});
      };
      request.onerror = () => fail('Local storage could not open. Your draft is still here; download a backup.');
      request.onblocked = () => fail('Another tab is blocking the storage upgrade. Close older Repro Relay tabs, then retry.');
      request.onsuccess = () => {
        const db=request.result;
        if (rejected) { db.close(); return; }
        db.onversionchange=() => { db.close(); this.connection=null; };
        resolve(db);
      };
    });
    return this.connection;
  }
  async list():Promise<{cases:Capsule[];checkpoints:RunCheckpoint[];warnings:string[]}> {
    const db=await this.open();
    const raw=await new Promise<{cases:unknown[];drafts:unknown[]}>((resolve,reject) => {
      const tx=db.transaction(['cases','drafts'],'readonly');
      const cases=tx.objectStore('cases').getAll(), drafts=tx.objectStore('drafts').getAll();
      tx.oncomplete=() => resolve({cases:cases.result,drafts:drafts.result});
      tx.onabort=() => reject(new Error('Saved cases could not be read. Retry or import a backup.'));
    });
    const cases:Capsule[]=[], checkpoints:RunCheckpoint[]=[], warnings:string[]=[];
    for (const item of raw.cases) {
      try { cases.push(await parseBackup(JSON.stringify(item))); }
      catch { warnings.push('A damaged saved case was skipped. It was not deleted or overwritten.'); }
    }
    for (const item of raw.drafts) {
      try {
        const capsule=cases.find(c=>c.id===(item as RunCheckpoint)?.caseId);
        if (!capsule) throw new Error('Missing case');
        validateCheckpoint(item,capsule); checkpoints.push(clone(item));
      } catch { warnings.push('A damaged draft checkpoint was skipped and kept in storage. Its completed case was not changed.'); }
    }
    return {cases:cases.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),checkpoints,warnings};
  }
  async save(capsule:Capsule, expectedUpdatedAt?:string|null, checkpoint?:RunCheckpoint|null):Promise<void> {
    validateCapsule(capsule);
    const value=clone(capsule), draft=checkpoint ? clone(checkpoint) : checkpoint;
    if (draft) validateCheckpoint(draft,value);
    const db=await this.open();
    await new Promise<void>((resolve,reject) => {
      const tx=db.transaction(['cases','drafts'],'readwrite'), cases=tx.objectStore('cases'), drafts=tx.objectStore('drafts');
      let error:Error=new Error('Local save failed (storage may be full). Your unsaved work is still here; download a backup or retry.');
      const existingCases=cases.getAll(), existingDrafts=drafts.getAll();
      existingDrafts.onsuccess=() => {
        try {
          const all=existingCases.result as Capsule[], current=all.find(c=>c?.id===value.id);
          if (expectedUpdatedAt !== undefined && (current?.updatedAt ?? null) !== expectedUpdatedAt) throw new SaveConflict();
          if (current && expectedUpdatedAt !== undefined && value.updatedAt <= current.updatedAt) throw new Error('Save timestamp did not advance. Retry the save.');
          if (current && current.runs.some((run,index)=>JSON.stringify(run)!==JSON.stringify(value.runs[index]))) throw new Error('Completed history cannot be overwritten. Save your work as a separate copy.');
          if (current) {
            const referenced=new Set(current.runs.flatMap(run=>run.observations.flatMap(row=>row.evidenceIds)));
            if (current.evidence.some(image=>referenced.has(image.id) && JSON.stringify(image)!==JSON.stringify(value.evidence.find(item=>item.id===image.id)))) throw new Error('Completed evidence cannot be replaced. Save your work as a separate copy.');
          }
          const others=all.filter(c=>c?.id!==value.id);
          if (others.length>=LIMITS.cases) throw new Error('The 20-case limit is reached. Export a case before deleting it to make room.');
          const oldDraft=(existingDrafts.result as RunCheckpoint[]).find(item=>item?.caseId===value.id);
          const nextDraft=draft===undefined ? oldDraft : draft;
          if (nextDraft) validateCheckpoint(nextDraft,value);
          const records:unknown[]=[...others,value,...existingDrafts.result.filter(item=>item?.caseId!==value.id),...(nextDraft ? [nextDraft] : [])];
          const bytes=records.reduce<number>((total,item)=>total+new TextEncoder().encode(JSON.stringify(item)).length,0);
          if (bytes>LIMITS.storageBytes) throw new Error('The 40 MB local limit is reached. Export older cases before removing them.');
          cases.put(value);
          if (draft===null) drafts.delete(value.id); else if (draft) drafts.put(draft);
        } catch(cause) { error=cause instanceof Error ? cause : error; tx.abort(); }
      };
      tx.oncomplete=()=>resolve(); tx.onabort=()=>reject(error);
      tx.onerror=()=>{ /* Only completion means saved; the abort handler reports request failures. */ };
    });
  }
  async remove(caseId:string,expectedUpdatedAt?:string|null):Promise<void> {
    const db=await this.open();
    await new Promise<void>((resolve,reject) => {
      const tx=db.transaction(['cases','drafts'],'readwrite'), cases=tx.objectStore('cases');
      let error:Error=new Error('The case was not deleted. Please retry.');
      const current=cases.get(caseId);
      current.onsuccess=()=>{
        if (expectedUpdatedAt!==undefined && (current.result?.updatedAt ?? null)!==expectedUpdatedAt) {error=new SaveConflict();tx.abort();return;}
        cases.delete(caseId);tx.objectStore('drafts').delete(caseId);
      };
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(error);
    });
  }
  async close():Promise<void> { if(this.connection)(await this.connection).close();this.connection=null; }
}
