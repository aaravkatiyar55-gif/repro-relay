import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {clone,newCase,startRun,finishRun} from '../src/model.ts';
import {labCase} from '../src/lab.ts';
import {CaseStore,SaveConflict} from '../src/store.ts';
import {SaveSession} from '../src/save-session.ts';
import {checkpointFor,validateCheckpoint,buildCheckpointBackup,parsePortable,portableCopy} from '../src/checkpoints.ts';
import {buildIssueMarkdown,handoffChecks} from '../src/handoff.ts';
import {hashBytes,pngBytes} from '../src/validation.ts';

test('two real store connections reject stale writes and preserve the other tab’s saved case',async()=>{
  const factory=new IDBFactory(), first=new CaseStore(factory,'conflict'), second=new CaseStore(factory,'conflict'), session=new SaveSession();
  const original=labCase();await first.save(original,null);
  const a=clone(original),b=clone(original);a.spec.title='First correction';b.spec.title='Second correction';
  const attempt=session.capture(a,original);await first.save(attempt.snapshot,attempt.expected);
  const stale=session.capture(b,original);await assert.rejects(second.save(stale.snapshot,stale.expected),SaveConflict);
  assert.equal((await second.list()).cases[0].spec.title,'First correction');assert.equal(b.spec.title,'Second correction');
  const copy=portableCopy({capsule:b,checkpoint:null}).capsule;await second.save(copy,null);
  assert.equal((await first.list()).cases.length,2);await first.close();await second.close();
});
test('editing during an actual asynchronous save keeps the new edit unsaved and stores only the captured snapshot',async()=>{
  const store=new CaseStore(new IDBFactory(),'mid-save'),session=new SaveSession(),c=labCase();
  session.touch(c.id);const attempt=session.capture(c);const operation=store.save(attempt.snapshot,attempt.expected);
  c.spec.title='Edited while storage was opening';session.touch(c.id);await operation;
  assert.equal(session.accept(c,attempt),false);const persisted=(await store.list()).cases[0];
  assert.equal(persisted.spec.title,attempt.snapshot.spec.title);assert.notEqual(persisted.spec.title,c.spec.title);
  const next=session.capture(c,persisted);await store.save(next.snapshot,next.expected);assert.equal(session.accept(c,next),true);
  assert.equal((await store.list()).cases[0].spec.title,c.spec.title);await store.close();
});
test('save tokens advance even when the old timestamp is ahead of the wall clock',()=>{
  const c=labCase();c.updatedAt='2099-01-01T00:00:00.000Z';const session=new SaveSession(),a=session.capture(c,c);
  assert.equal(a.snapshot.updatedAt,'2099-01-01T00:00:00.001Z');session.accept(c,a);
  assert.equal(session.capture(c,c).snapshot.updatedAt,'2099-01-01T00:00:00.002Z');
});
test('an IndexedDB v1 database upgrades without deleting any existing case',async()=>{
  const factory=new IDBFactory(),c=labCase();
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open('upgrade',1);request.onupgradeneeded=()=>request.result.createObjectStore('cases',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('cases','readwrite');tx.objectStore('cases').put(c);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
  const store=new CaseStore(factory,'upgrade'),listed=await store.list();assert.deepEqual(listed.cases,[c]);assert.deepEqual(listed.checkpoints,[]);await store.close();
});
test('unfinished observations survive a new connection without becoming a completed run',async()=>{
  const factory=new IDBFactory(),store=new CaseStore(factory,'draft'),c=labCase(),run=startRun(c);run.observations[0].outcome='fail';run.observations[0].actual='Two Alex rows';
  const cp=checkpointFor(c,run);await store.save(c,null,cp);await store.close();
  const fresh=new CaseStore(factory,'draft'),state=await fresh.list();assert.equal(state.cases[0].runs.length,0);assert.deepEqual(state.checkpoints,[cp]);assert.equal(state.checkpoints[0].run.completedAt,'');
  const completed=finishRun(state.cases[0],state.checkpoints[0].run),session=new SaveSession(),attempt=session.capture(completed,state.cases[0]);
  await fresh.save(attempt.snapshot,attempt.expected,null);const finished=await fresh.list();assert.equal(finished.cases[0].runs.length,1);assert.equal(finished.checkpoints.length,0);await fresh.close();
});
test('stale checkpoint/completion/delete transactions leave both saved records untouched',async()=>{
  const factory=new IDBFactory(),a=new CaseStore(factory,'atomic'),b=new CaseStore(factory,'atomic'),c=labCase(),run=startRun(c),session=new SaveSession();
  const cp=checkpointFor(c,run);await a.save(c,null,cp);
  const edited=clone(c);edited.spec.summary='Other tab update';const update=session.capture(edited,c);await a.save(update.snapshot,update.expected);
  const changed=clone(run);changed.observations[0].outcome='pass';const stale=session.capture(c,c);
  await assert.rejects(b.save(stale.snapshot,stale.expected,checkpointFor(stale.snapshot,changed)),SaveConflict);
  const complete=session.capture(finishRun(c,changed),c);await assert.rejects(b.save(complete.snapshot,complete.expected,null),SaveConflict);
  await assert.rejects(b.remove(c.id,c.updatedAt),SaveConflict);
  const state=await b.list();assert.deepEqual(state.cases,[update.snapshot]);assert.deepEqual(state.checkpoints,[cp]);await a.close();await b.close();
});
test('completed run history cannot be silently replaced on save',async()=>{
  const store=new CaseStore(new IDBFactory(),'history'),fixture=labCase(),c=finishRun(fixture,startRun(fixture));
  await store.save(c,null);const altered=clone(c);altered.runs[0].observations[0].outcome='pass';const attempt=new SaveSession().capture(altered,c);
  await assert.rejects(store.save(attempt.snapshot,attempt.expected),/history cannot/);assert.deepEqual((await store.list()).cases,[c]);await store.close();
});
test('evidence referenced by a completed run is preserved, including its caption and processed bytes',async()=>{
  const store=new CaseStore(new IDBFactory(),'evidence'),c=labCase();
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxWQAAAAASUVORK5CYII=';
  c.evidence.push({id:'shot',caption:'First caption',width:1,height:1,png,sha256:await hashBytes(pngBytes(png))});
  const run=startRun(c);run.observations[0].evidenceIds=['shot'];const done=finishRun(c,run);await store.save(done,null);
  const altered=clone(done);altered.evidence[0].caption='Changed caption';const attempt=new SaveSession().capture(altered,done);
  await assert.rejects(store.save(attempt.snapshot,attempt.expected),/evidence cannot/);assert.deepEqual((await store.list()).cases,[done]);
  assert.ok(buildIssueMarkdown(done).includes('processed-shot.png'));assert.ok(!buildIssueMarkdown(done).includes(png));await store.close();
});
test('a damaged checkpoint is skipped and preserved without damaging its saved case',async()=>{
  const factory=new IDBFactory(),store=new CaseStore(factory,'damaged'),c=labCase();await store.save(c,null);
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open('damaged',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({caseId:c.id,savedAt:'bad',run:{}});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
  const state=await store.list();assert.deepEqual(state.cases,[c]);assert.equal(state.checkpoints.length,0);assert.equal(state.warnings.length,1);
  const retained=await new Promise<unknown>((resolve,reject)=>{const tx=db.transaction('drafts','readonly'),request=tx.objectStore('drafts').get(c.id);tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);});
  assert.deepEqual(retained,{caseId:c.id,savedAt:'bad',run:{}});db.close();await store.close();
});
test('draft backups import as separate cases, preserve IDs and reject invalid references/extra fields',async()=>{
  const c=labCase(),run=startRun(c);run.observations[1].outcome='blocked';run.fixNote='Waiting for a local fix';
  const source=buildCheckpointBackup(c,run),parsed=await parsePortable(source),copy=portableCopy(parsed);
  assert.notEqual(copy.capsule.id,c.id);assert.equal(copy.checkpoint?.caseId,copy.capsule.id);assert.equal(copy.checkpoint?.run.completedAt,'');assert.deepEqual(copy.checkpoint?.run.spec.steps,run.spec.steps);assert.equal(c.runs.length,0);
  for(const mutate of [(p:any)=>p.checkpoint.run.completedAt=p.checkpoint.savedAt,(p:any)=>p.checkpoint.run.observations[0].evidenceIds=['missing'],(p:any)=>p.checkpoint.run.baselineId='missing',(p:any)=>p.extra=true,(p:any)=>p.checkpoint.run.extra=true,(p:any)=>p.checkpoint.caseId='other']){
    const malformed=JSON.parse(source);mutate(malformed);await assert.rejects(parsePortable(JSON.stringify(malformed)));
  }
  assert.equal((await parsePortable(JSON.stringify(c))).checkpoint,null);assert.throws(()=>validateCheckpoint({...checkpointFor(c,run),savedAt:'bad'},c),/save time/);
});
test('removing a case removes its checkpoint in the same transaction',async()=>{
  const store=new CaseStore(new IDBFactory(),'remove'),c=labCase();await store.save(c,null,checkpointFor(c,startRun(c)));await store.remove(c.id,c.updatedAt);
  assert.deepEqual(await store.list(),{cases:[],checkpoints:[],warnings:[]});await store.close();
});
test('handoff checks explain missing context without crashing on a new, incomplete case',()=>{
  const checks=handoffChecks(newCase());assert.equal(checks.find(c=>c.label==='Reproduction criteria')?.complete,false);assert.equal(checks.find(c=>c.label==='Recorded run')?.complete,false);
  const c=labCase(),run=startRun(c);run.observations.forEach(row=>{row.outcome='fail';row.actual='Observed failure';});const done=finishRun(c,run);
  assert.equal(handoffChecks(done).find(c=>c.label==='Remaining checks')?.complete,true);
  done.runs[0].observations[0].outcome='blocked';assert.equal(handoffChecks(done).find(c=>c.label==='Remaining checks')?.complete,false);
});
test('issue Markdown uses frozen context, explicit untested states and escaped hostile-looking text',()=>{
  const c=labCase();c.spec.title='<script>alert(1)</script> [click](javascript:bad)';c.spec.sourceUrl='https://example.com/source-v1';
  const run=startRun(c);run.observations[0].outcome='fail';run.observations[0].actual='</blockquote><img onerror=boom>\n```\n# spoofed heading';
  const done=finishRun(c,run);done.spec.sourceUrl='https://example.com/source-v2';const markdown=buildIssueMarkdown(done);
  assert.ok(markdown.includes('https://example.com/source-v1'));assert.ok(!markdown.includes('https://example.com/source-v2'));assert.ok(markdown.includes('Not tested'));assert.ok(markdown.includes('&lt;script&gt;'));assert.ok(!markdown.includes('<img'));assert.ok(markdown.includes('\\[click\\]'));assert.ok(!markdown.includes('\n# spoofed heading'));assert.ok(!markdown.includes('data:image'));
  done.spec.steps[0].expected='Changed expectation';const retest=startRun(done,done.runs[0].id);retest.observations[0].outcome='pass';const after=finishRun(done,retest);assert.ok(buildIssueMarkdown(after).includes('Criteria changed'));assert.ok(buildIssueMarkdown(after).includes('Earlier expected result'));
});
