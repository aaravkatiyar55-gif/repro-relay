import { LIMITS, clone } from './model.ts';
import type { Capsule } from './model.ts';
import { parseBackup, validateCapsule } from './validation.ts';

export class CaseStore {
  private connection: Promise<IDBDatabase> | null = null;
  private readonly factory: IDBFactory;
  private readonly name: string;
  constructor(factory: IDBFactory = indexedDB, name = 'repro-relay-v1') { this.factory = factory; this.name = name; }
  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      const request = this.factory.open(this.name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('cases', { keyPath: 'id' }); };
      request.onerror = () => { this.connection = null; reject(new Error('Local storage could not open. Your draft is still here; download a backup.')); };
      request.onblocked = () => { this.connection = null; reject(new Error('Another tab is blocking storage. Close older Repro Relay tabs, then retry.')); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.connection = null; };
        resolve(db);
      };
    });
    return this.connection;
  }
  async list(): Promise<{ cases: Capsule[]; warnings: string[] }> {
    const db = await this.open();
    const raw = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = db.transaction('cases', 'readonly');
      const request = transaction.objectStore('cases').getAll();
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(new Error('Saved cases could not be read. Retry or import a backup.'));
    });
    const cases: Capsule[] = [], warnings: string[] = [];
    for (const item of raw) {
      try { cases.push(await parseBackup(JSON.stringify(item))); }
      catch { warnings.push('A damaged saved case was skipped. It was not deleted or overwritten.'); }
    }
    return { cases: cases.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), warnings };
  }
  async save(capsule: Capsule): Promise<void> {
    validateCapsule(capsule);
    const value = clone(capsule);
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('cases', 'readwrite');
      const store = transaction.objectStore('cases');
      let message = 'Local save failed (storage may be full). Your unsaved work is still here; download a backup or retry.';
      const request = store.getAll();
      request.onsuccess = () => {
        const existing = request.result as Capsule[];
        const others = existing.filter(item => item.id !== value.id);
        if (others.length >= LIMITS.cases) { message = 'The 20-case limit is reached. Export a case before deleting it to make room.'; transaction.abort(); return; }
        const bytes = [...others, value].reduce((total,item) => total + new TextEncoder().encode(JSON.stringify(item)).length, 0);
        if (bytes > LIMITS.storageBytes) { message = 'The 40 MB local limit is reached. Export older cases before removing them.'; transaction.abort(); return; }
        store.put(value);
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error(message));
      transaction.onerror = () => { /* onabort reports the failed transaction, never a successful save */ };
    });
  }
  async remove(caseId: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('cases', 'readwrite');
      transaction.objectStore('cases').delete(caseId);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error('The case was not deleted. Please retry.'));
    });
  }
  async close(): Promise<void> { if (this.connection) (await this.connection).close(); this.connection = null; }
}
