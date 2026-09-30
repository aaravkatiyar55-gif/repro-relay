import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { newCase, startRun, finishRun, importedCopy, safeUrl, clone, LIMITS } from '../src/model.ts';
import type { Capsule } from '../src/model.ts';
import { compareRuns } from '../src/compare.ts';
import { validateCapsule, parseBackup, hashBytes, pngBytes } from '../src/validation.ts';
import { imageSize, clampRect, burnRedactions } from '../src/images.ts';
import { CaseStore } from '../src/store.ts';
import { buildReport } from '../src/report.ts';
import { labCase, seedRows, register, filterRows, checkRow } from '../src/lab.ts';

const fixture = (): Capsule => labCase();
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxWQAAAAASUVORK5CYII=';
async function withImage(): Promise<Capsule> {
  const c = fixture(); c.evidence.push({ id:'shot', caption:'Processed shot', width:1, height:1, png:tinyPng, sha256:await hashBytes(pngBytes(tinyPng)) }); return c;
}
function recorded() {
  let c = fixture(); const draft = startRun(c); draft.observations.forEach(row => { row.outcome = 'fail'; row.actual = 'Original failure'; });
  c = finishRun(c, draft); return c;
}
test('finishing a run copies its criteria and results; subsequent edits do not alter the snapshot', () => {
  const c = fixture(), draft = startRun(c); draft.observations[0].outcome = 'fail';
  const saved = finishRun(c, draft); draft.spec.steps[0].expected = 'Changed'; draft.observations[0].outcome = 'pass'; c.spec.steps[0].action = 'Changed action';
  assert.equal(saved.runs[0].observations[0].outcome,'fail'); assert.notEqual(saved.runs[0].spec.steps[0].expected,'Changed'); assert.notEqual(saved.runs[0].spec.steps[0].action,'Changed action');
  assert.throws(() => finishRun(saved,draft),/already completed/); assert.equal(c.runs.length,0);
});
test('stable IDs survive reordered steps and match failure with retest', () => {
  const c = recorded(); c.spec.steps.reverse(); const retest = startRun(c,c.runs[0].id); retest.observations.forEach(row => { row.outcome = 'pass'; });
  const next = finishRun(c,retest); const rows = compareRuns(next.runs[0], next.runs[1]);
  assert.equal(rows.length,3); assert.ok(rows.every(row => row.change === 'resolved')); assert.equal(rows[0].stepId,'duplicate');
});
test('changed criteria never silently turn an old failure green', () => {
  const c = recorded(); c.spec.steps[0].expected = 'Duplicates are allowed'; const retest = startRun(c,c.runs[0].id); retest.observations.forEach(row => { row.outcome = 'pass'; });
  const next = finishRun(c,retest); assert.equal(compareRuns(next.runs[0],next.runs[1])[0].change,'criteria-changed');
  next.runs[1].spec.preconditions = 'Different setup'; assert.ok(compareRuns(next.runs[0],next.runs[1]).every(row => row.change === 'criteria-changed'));
});
test('incomplete and blocked retests stay unverified; added, removed and regressed steps are explicit', () => {
  const c = recorded(), retest = startRun(c,c.runs[0].id); retest.observations[0].outcome = 'blocked';
  const next = finishRun(c,retest); assert.ok(compareRuns(next.runs[0],next.runs[1]).every(row => row.change === 'unverified'));
  const after = clone(next.runs[1]); after.spec.steps.shift(); after.observations.shift();
  after.spec.steps.push({ id:'new-step', action:'A new action', expected:'A new result' }); after.observations.push({ stepId:'new-step',outcome:'pass',actual:'',evidenceIds:[] });
  const changes = compareRuns(next.runs[0],after).map(row => row.change); assert.ok(changes.includes('removed')); assert.ok(changes.includes('added'));
  next.runs[0].observations[1].outcome = 'pass'; after.observations[0].outcome = 'fail'; assert.equal(compareRuns(next.runs[0],after)[1].change,'regressed');
});
test('schema rejects empty cases, unexpected fields, duplicate step IDs and unsafe links', () => {
  assert.throws(() => validateCapsule(newCase()),/Title/);
  for (const mutate of [
    (c: any) => { c.extra = true; }, (c: any) => { c.spec.steps[1].id = c.spec.steps[0].id; },
    (c: any) => { c.spec.demoUrl = 'javascript:alert(1)'; }, (c: any) => { c.schemaVersion = 9; },
    (c: any) => { c.runs = [{ id:'bad' }]; }, (c: any) => { c.spec.steps[0].expected = ''; },
  ]) { const c = fixture(); mutate(c); assert.throws(() => validateCapsule(c)); }
  assert.equal(safeUrl('https://user:password@example.com'),''); assert.equal(safeUrl('file:///tmp/a'),''); assert.equal(safeUrl('https://example.com'),'https://example.com/');
});
test('each run has one result per step and only existing evidence / earlier baselines', () => {
  const c = recorded(); c.runs[0].observations[0].evidenceIds = ['missing']; assert.throws(() => validateCapsule(c),/reference/);
  c.runs[0].observations[0].evidenceIds = []; c.runs[0].baselineId = c.runs[0].id; assert.throws(() => validateCapsule(c),/earlier/);
  c.runs[0].baselineId = null; c.runs[0].observations.pop(); assert.throws(() => validateCapsule(c),/Every step/);
});
test('backups verify hashes and image dimensions before import; decoded failures leave the input untouched', async () => {
  const c = await withImage(), source = JSON.stringify(c); const restored = await parseBackup(source); assert.deepEqual(restored,c);
  restored.evidence[0].sha256 = '0'.repeat(64); await assert.rejects(parseBackup(JSON.stringify(restored)),/SHA-256/);
  restored.evidence[0].width = 2; await assert.rejects(parseBackup(JSON.stringify(restored)),/dimensions/);
  await assert.rejects(parseBackup(source, async () => { throw new Error('Cannot decode'); }),/Cannot decode/); assert.equal(JSON.stringify(c),source);
  await assert.rejects(parseBackup('{'),/valid JSON/); await assert.rejects(parseBackup(' '.repeat(LIMITS.importBytes+1)),/20 MB/);
});
test('imports make a separate copy without replacing the original case or changing internal step IDs', () => {
  const c = recorded(), copy = importedCopy(c); assert.notEqual(copy.id,c.id); assert.deepEqual(copy.runs,c.runs); copy.spec.title = 'Copy'; assert.notEqual(c.spec.title,'Copy');
});
test('IndexedDB survives a new store connection; a failed import/transaction preserves all existing cases', async () => {
  const factory = new IDBFactory(), first = new CaseStore(factory,'test-persist'), c = recorded(); await first.save(c); await first.close();
  const second = new CaseStore(factory,'test-persist'); assert.deepEqual((await second.list()).cases,[c]);
  const invalid = clone(c); invalid.spec.title = ''; await assert.rejects(second.save(invalid),/Title/); assert.deepEqual((await second.list()).cases,[c]);
  for (let i=1;i<LIMITS.cases;i++) await second.save(importedCopy(c));
  const extra = importedCopy(c); await assert.rejects(second.save(extra),/20-case/); const list = (await second.list()).cases; assert.equal(list.length,20); assert.ok(list.some(item => item.id === c.id)); assert.ok(!list.some(item => item.id === extra.id));
  await second.remove(c.id); assert.equal((await second.list()).cases.length,19); await second.close();
});
test('local storage failure is reported, never labelled saved', async () => {
  const broken = { open: () => { const request: any = {}; queueMicrotask(() => request.onerror()); return request; } } as IDBFactory;
  await assert.rejects(new CaseStore(broken).save(fixture()),/draft is still here/);
});
test('pixel redaction is opaque even over transparent pixels; clipped rectangles do not touch neighbours', () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(240); pixels[3] = 0;
  burnRedactions(pixels,4,4,[{x:0,y:0,width:1,height:1},{x:3.2,y:3.2,width:10,height:10}]);
  assert.deepEqual([...pixels.slice(0,4)],[17,24,22,255]); assert.deepEqual([...pixels.slice(4,8)],[240,240,240,240]); assert.deepEqual([...pixels.slice(-4)],[17,24,22,255]);
  assert.throws(() => clampRect({x:0,y:0,width:-1,height:2},4,4)); assert.throws(() => clampRect({x:9,y:9,width:1,height:1},4,4)); assert.throws(() => burnRedactions(new Uint8ClampedArray(2),4,4,[]));
});
test('image headers are size checked before decoding; fake formats, truncated JPEGs and oversized PNGs fail', () => {
  assert.equal(imageSize(pngBytes(tinyPng)).width,1); assert.throws(() => imageSize(new Uint8Array([1,2,3])),/PNG and JPEG/);
  const png = pngBytes(tinyPng); const view = new DataView(png.buffer); view.setUint32(16,9000); view.setUint32(20,9000); assert.throws(() => imageSize(png),/8 megapixels/);
  assert.throws(() => imageSize(new Uint8Array(LIMITS.sourceBytes+1)),/5 MB/);
  assert.throws(() => imageSize(new Uint8Array([255,216,255,192,0,10,0])),/Truncated/);
  const jpeg = new Uint8Array([255,216,255,192,0,8,8,0,10,0,20,0]); assert.deepEqual(imageSize(jpeg),{width:20,height:10,type:'image/jpeg'});
});
test('HTML reports escape script-like text, contain processed images and have no scripts or remote resources', async () => {
  const c = await withImage(); c.spec.title = '<script>alert("test")</script>'; c.spec.summary = '<img src=x onerror=alert(1)>'; c.spec.demoUrl = 'https://example.com/?q="evil"';
  c.spec.sourceUrl = 'https://example.com/source-v1';
  const draft = startRun(c); draft.observations[0].evidenceIds = ['shot']; draft.observations[0].actual = '</p><script>oops</script>';
  const saved = finishRun(c,draft); saved.spec.sourceUrl = 'https://example.com/source-v2'; const html = buildReport(saved);
  assert.ok(html.includes('href="https://example.com/source-v1"')); assert.ok(html.includes('href="https://example.com/source-v2"')); assert.equal(saved.runs[0].spec.sourceUrl,'https://example.com/source-v1');
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes(tinyPng)); assert.ok(html.includes("default-src 'none'")); assert.ok(!/<script[\s>]/i.test(html)); assert.ok(!/<img[^>]+src="https?:/i.test(html)); assert.ok(!html.includes('onerror=alert(1)>')); assert.ok(html.includes('Not tested')); assert.ok(!html.includes('<script>oops'));
});
test('all three fictional bugs fail in broken mode and pass with the actual fixed implementation', () => {
  let broken = register(register(seedRows(),'Alex','broken'),'Alex','broken'); let fixed = register(register(seedRows(),'Alex','fixed'),' Alex ','fixed');
  assert.equal(broken.filter(row => row.name === 'Alex').length,2); assert.equal(fixed.filter(row => row.name === 'Alex').length,1);
  assert.equal(filterRows(seedRows(),'  Mina  ','broken').length,0); assert.equal(filterRows(seedRows(),'  Mina  ','fixed')[0].id,'mina');
  const rows = seedRows(); const visible = filterRows(rows,'Sam','broken'); broken = checkRow(rows,visible,0,'broken'); fixed = checkRow(rows,visible,0,'fixed');
  assert.equal(broken.find(row => row.checked)?.id,'mina'); assert.equal(fixed.find(row => row.checked)?.id,'sam');
});
