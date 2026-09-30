import './style.css';
import { h, button, field, selectField, badge, notice } from './dom.ts';
import { newCase, startRun, finishRun, importedCopy, clone, blankStep, LIMITS, outcomeLabel, safeUrl } from './model.ts';
import type { Capsule, Run, Outcome, Evidence } from './model.ts';
import { compareRuns, changeLabel } from './compare.ts';
import { CaseStore } from './store.ts';
import { parseBackup, validateCapsule } from './validation.ts';
import { prepareImage, processEvidence, clampRect, verifyDecodedEvidence } from './images.ts';
import type { Rect } from './images.ts';
import { buildReport, download, fileStem } from './report.ts';
import { labCase, seedRows, register, filterRows, checkRow } from './lab.ts';
import type { BoardVersion } from './lab.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const store = new CaseStore();
const saved = new Map<string,Capsule>(), drafts = new Map<string,Capsule>(), runDrafts = new Map<string,Run>(), dirty = new Set<string>();
let loaded = false, storageProblem = '', message = '', messageType = '', busy = false, offlineReady = false;
let search = '', statusFilter = 'all';
let imageCleanup: (() => void) | null = null;
const lab = { capsule:labCase(), version:'broken' as BoardVersion, rows:seedRows(), query:'', name:'Alex', draft:null as Run | null, currentStep:0, feedback:'' };
const time = (iso:string) => new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const route = () => location.hash.slice(1) || '/';
function go(path:string) { if (route() === path) render(); else location.hash = path; }
function say(text:string,type = 'success') { message = text; messageType = type; updateMessage(); }
function updateMessage() {
  const region = document.querySelector('#message');
  region?.replaceChildren(message ? h('div',{class:`notice ${messageType}`},h('span',{},message),button('Dismiss',() => { message = ''; updateMessage(); },'quiet')) : h('span',{class:'sr-only'},''));
}
const errorText = (error:unknown) => error instanceof Error ? error.message : 'Something did not finish. Your current work is still here.';
async function task(action: () => Promise<void>) {
  if (busy) { say('A local operation is still finishing. Try again in a moment.','warning'); return; }
  busy = true;
  document.querySelector('#main')?.setAttribute('aria-busy','true');
  try { await action(); } catch(error) { say(errorText(error),'error'); }
  finally { busy = false; document.querySelector('#main')?.setAttribute('aria-busy','false'); }
}
function working(caseId:string): Capsule | undefined {
  if (drafts.has(caseId)) return drafts.get(caseId);
  const source = saved.get(caseId);
  if (source) { const copy = clone(source); drafts.set(caseId,copy); return copy; }
  return undefined;
}
function markDirty(capsule:Capsule) { dirty.add(capsule.id); const state = document.querySelector('#save-state'); if (state) state.textContent = 'Unsaved changes'; }
async function save(capsule:Capsule) {
  capsule.updatedAt = new Date().toISOString(); validateCapsule(capsule);
  await store.save(capsule); saved.set(capsule.id,clone(capsule)); dirty.delete(capsule.id); storageProblem = '';
}
function addCase() { const capsule = newCase(); drafts.set(capsule.id,capsule); dirty.add(capsule.id); go(`/case/${capsule.id}/edit`); }
function downloadJson(capsule:Capsule) {
  validateCapsule(capsule); download(JSON.stringify(capsule,null,2),fileStem(capsule.spec.title) + '.repro.json','application/json');
  say('JSON backup prepared. Keep it somewhere outside this browser.');
}
function downloadHtml(capsule:Capsule) { download(buildReport(capsule),fileStem(capsule.spec.title) + '.report.html','text/html'); say('Read-only HTML report prepared. It opens without an account or internet.'); }
function preview(capsule:Capsule,kind:'json'|'html') {
  validateCapsule(capsule);
  const dialogId = 'export-preview-title';
  const content = kind === 'json' ? h('div',{},h('label',{for:'backup-json'},'Backup JSON'),h('textarea',{id:'backup-json',readonly:true,spellcheck:'false',class:'backup-json',value:JSON.stringify(capsule,null,2)})) : h('iframe',{class:'report-frame',title:'Read-only HTML report preview',sandbox:'',srcdoc:buildReport(capsule,true)});
  const dialog = h('dialog',{'aria-labelledby':dialogId,class:'export-preview'},h('div',{class:'section-title'},h('h2',{id:dialogId},kind === 'json' ? 'Your portable backup' : 'Your portable report'),button('Close preview',() => dialog.close(),'quiet')),h('p',{class:'muted'},kind === 'json' ? 'This validated backup can be imported as a separate case. You can also select and copy this text if downloads are unavailable.' : 'A read-only preview of your portable report. Processed images are embedded; the report needs no scripts or internet.'),content,button(kind === 'json' ? 'Download this JSON' : 'Download this HTML',() => kind === 'json' ? downloadJson(capsule) : downloadHtml(capsule),'primary'));
  dialog.addEventListener('close',() => dialog.remove()); document.body.append(dialog); dialog.showModal(); dialog.querySelector<HTMLButtonElement>('button')?.focus();
}
function exports(capsule:Capsule) { return h('div',{class:'actions'},button('JSON backup',() => task(async() => downloadJson(capsule))),button('HTML report',() => task(async() => downloadHtml(capsule))),button('Preview backup',() => task(async() => preview(capsule,'json')),'quiet'),button('Preview report',() => task(async() => preview(capsule,'html')),'quiet')); }
function beginRun(capsule:Capsule,baselineId:string|null = null) {
  validateCapsule(capsule);
  if (runDrafts.has(capsule.id)) say('Your unfinished run is still here. Complete or discard it before starting another.','warning');
  else runDrafts.set(capsule.id,startRun(capsule,baselineId));
  go(`/case/${capsule.id}/run`);
}
function external(label:string,url:string) { const safe = safeUrl(url); return safe ? h('a',{href:safe,target:'_blank',rel:'noopener noreferrer',class:'text-link'},label,' ↗') : null; }
function pageHeading(kicker:string,title:string,description:string,actions:HTMLElement[] = []) {
  return h('div',{class:'page-heading'},h('div',{},h('p',{class:'eyebrow'},kicker),h('h1',{tabindex:-1},title),h('p',{class:'lede'},description)),h('div',{class:'actions'},...actions));
}
function render() {
  imageCleanup?.(); imageCleanup = null;
  const path = route();
  const header = h('header',{class:'app-header'},h('a',{class:'brand',href:'#/'},h('img',{src:'./mark.svg',width:36,height:36,alt:''}),h('span',{},'Repro ',h('strong',{},'Relay'))),h('nav',{'aria-label':'Main navigation'},h('a',{href:'#/','aria-current':path === '/' ? 'page' : undefined},'Cases'),h('a',{href:'#/demo','aria-current':path === '/demo' ? 'page' : undefined},'Try the demo'),h('a',{href:'#/about','aria-current':path === '/about' ? 'page' : undefined},'How it works')),h('span',{class:'local-label'},h('span',{class:'status-dot'}),offlineReady ? 'Offline copy ready' : 'Local-first · no account'));
  const main = h('main',{id:'main',tabindex:-1});
  app.replaceChildren(header,h('div',{id:'message',role:'status','aria-live':'polite'}),main,h('footer',{class:'app-footer'},h('span',{},'Caught → reproduced → fixed → checked again.'),h('span',{},'Stored in this browser. Export before clearing it.')));
  updateMessage();
  if (storageProblem) main.append(notice(storageProblem,'error'));
  if (!loaded) { main.append(notice('Opening your local inspection desk…')); return; }
  if (path === '/') home(main);
  else if (path === '/demo') demo(main);
  else if (path === '/about') about(main);
  else {
    const match = /^\/case\/([a-zA-Z0-9_-]{1,80})\/(edit|run|compare)$/.exec(path);
    const capsule = match ? working(match[1]!) : undefined;
    if (!match || !capsule) { main.append(pageHeading('Not found','This case is not here','It may belong to another browser. Import its JSON backup to open a separate copy.',[button('Back to cases',() => go('/'))])); }
    else casePage(main,capsule,match[2]!);
  }
}
function home(main:HTMLElement) {
  main.append(pageHeading('The inspection desk','A bug needs a trail.','Write the steps. Capture the failure. Come back after the fix and check the same thing again.',[button('New case',addCase,'primary')]));
  main.append(h('section',{class:'demo-callout'},h('div',{},h('p',{class:'eyebrow'},'ONE MINUTE · THREE REAL FAILURES'),h('h2',{},'The signup board that gets it wrong.'),h('p',{},'Catch a duplicate, a search miss and a row that checks the wrong person. Then try their fixes.')),button('Open the interactive demo →',() => go('/demo'),'primary')));
  const importInput = h('input',{type:'file',accept:'.json,application/json','aria-label':'Choose a Repro Relay JSON backup',class:'file-input',tabindex:-1});
  importInput.addEventListener('change',() => task(async() => {
    const file = importInput.files?.[0]; if (!file) return;
    try {
      if (file.size > LIMITS.importBytes) throw new Error('Backup exceeds 20 MB. Nothing was imported.');
      const capsule = importedCopy(await parseBackup(await file.text(),verifyDecodedEvidence));
      await save(capsule); drafts.set(capsule.id,clone(capsule)); say('Imported as a separate case. Existing cases were kept.'); go(`/case/${capsule.id}/compare`);
    } finally { importInput.value = ''; }
  }));
  const list = h('div',{class:'case-grid'}), count = h('p',{class:'muted'});
  const updateList = () => {
    const all = [...new Map([...saved,...drafts]).values()].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
    const filtered = all.filter(c => (c.spec.title + ' ' + c.spec.summary).toLowerCase().includes(search.toLowerCase()) && (statusFilter === 'all' || (statusFilter === 'unrecorded' ? !c.runs.length : c.runs.some(run => run.observations.some(row => row.outcome === 'fail')))));
    count.textContent = `${filtered.length} of ${all.length} cases · ${LIMITS.cases} saved-case limit`;
    list.replaceChildren(...filtered.map(c => h('article',{class:'case-card'},h('div',{class:'card-top'},badge(c.runs.length ? `${c.runs.length} completed run${c.runs.length === 1 ? '' : 's'}` : 'No runs yet'),dirty.has(c.id) ? badge('Unsaved','warning') : badge('Saved locally','neutral')),h('h2',{},c.spec.title || 'Untitled draft'),h('p',{},c.spec.summary || 'Add a clear reproduction and the result you expected.'),h('small',{},`Updated ${time(c.updatedAt)}`),h('div',{class:'actions'},button('Open case',() => go(`/case/${c.id}/edit`)),button('Review runs',() => go(`/case/${c.id}/compare`),'quiet')))));
    if (!filtered.length) list.append(h('div',{class:'empty-state'},h('h2',{},all.length ? 'No matching cases' : 'Your first case starts with one clear step.'),h('p',{},all.length ? 'Change the search or filter.' : 'Try the fictional demo, or create a case for your own project. No sample data is saved automatically.')));
  };
  main.append(h('section',{class:'desk-tools'},field('Find a case',search,value => { search=value; updateList(); },{max:120}),selectField('Show',statusFilter,[{value:'all',label:'All cases'},{value:'unrecorded',label:'No runs yet'},{value:'failures',label:'Has recorded failures'}],value => { statusFilter=value; updateList(); }),h('div',{class:'import-control'},h('span',{class:'label-like'},'Bring a case here'),button('Import JSON',() => importInput.click()),importInput)));
  main.append(count,list); updateList();
}
function casePage(main:HTMLElement,c:Capsule,tab:string) {
  main.append(pageHeading('CASE FILE',c.spec.title || 'A new reproduction','Completed runs keep their own criteria. Editing this case affects the next run only.',[button('Back to cases',() => go('/'),'quiet')]));
  main.append(h('div',{class:'case-bar'},h('nav',{'aria-label':'Case sections',class:'tabs'},...['edit','run','compare'].map((key,index) => h('a',{href:`#/case/${c.id}/${key}`,'aria-current':tab === key ? 'page' : undefined},['1 · Build case','2 · Record a run','3 · Compare & hand off'][index]))),h('span',{id:'save-state',class:'save-state'},dirty.has(c.id) ? 'Unsaved changes' : 'Saved locally')));
  if (tab === 'edit') editCase(main,c);
  if (tab === 'run') review(main,c);
  if (tab === 'compare') comparePage(main,c);
}
function editCase(main:HTMLElement,c:Capsule) {
  const mutate = (key:keyof Omit<Capsule['spec'],'steps'>,value:string) => { c.spec[key]=value; markDirty(c); };
  const form = h('form',{class:'panel',onsubmit:event => { event.preventDefault(); task(async() => { await save(c); say('Case saved locally. Its completed runs were kept unchanged.'); render(); }); }},
    h('h2',{},'What should somebody try?'),h('div',{class:'form-grid'},field('Case title',c.spec.title,value => mutate('title',value),{max:120,required:true}),field('Project version / commit',c.spec.version,value => mutate('version',value),{max:200,hint:'Use a release, commit or build label you can find again.'})),
    field('Why this case matters',c.spec.summary,value => mutate('summary',value),{area:true}),h('div',{class:'form-grid'},field('Demo URL',c.spec.demoUrl,value => mutate('demoUrl',value),{type:'url',max:2048}),field('Source URL',c.spec.sourceUrl,value => mutate('sourceUrl',value),{type:'url',max:2048})),
    h('div',{class:'form-grid'},field('Environment',c.spec.environment,value => mutate('environment',value),{area:true,hint:'Browser, device, screen size and anything that changes the result.'}),field('Before you begin',c.spec.preconditions,value => mutate('preconditions',value),{area:true,hint:'Starting data, permissions and reset instructions.'})),h('div',{class:'section-title'},h('h2',{},'Reproduction steps'),badge(`${c.spec.steps.length} / ${LIMITS.steps}`)));
  const steps = h('div',{class:'steps-editor'});
  c.spec.steps.forEach((step,index) => {
    const row = h('fieldset',{class:'step-editor'},h('legend',{},`Step ${index + 1}`),field('Action',step.action,value => { step.action=value; markDirty(c); },{area:true,max:1500,required:true}),field('Expected result',step.expected,value => { step.expected=value; markDirty(c); },{area:true,max:1500,required:true}),h('div',{class:'actions'},button('Move up',() => { [c.spec.steps[index-1],c.spec.steps[index]]=[c.spec.steps[index]!,c.spec.steps[index-1]!]; markDirty(c); render(); },'quiet',index === 0),button('Move down',() => { [c.spec.steps[index+1],c.spec.steps[index]]=[c.spec.steps[index]!,c.spec.steps[index+1]!]; markDirty(c); render(); },'quiet',index === c.spec.steps.length-1),button('Remove step',() => { c.spec.steps.splice(index,1); markDirty(c); render(); },'danger-quiet',c.spec.steps.length === 1)));
    steps.append(row);
  });
  form.append(steps,button('Add step',() => { c.spec.steps.push(blankStep()); markDirty(c); render(); },'secondary',c.spec.steps.length >= LIMITS.steps),h('div',{class:'form-bottom'},h('button',{type:'submit',class:'button primary'},'Save case'),button('Save & start a run',() => task(async() => { await save(c); beginRun(c); })),h('small',{},'Required: title, action and expected result.')));
  main.append(form,evidencePanel(c));
}
function review(main:HTMLElement,c:Capsule) {
  let draft = runDrafts.get(c.id);
  if (!draft) {
    const actions = h('div',{class:'actions'},external('Open project demo',c.spec.demoUrl),button('Start a fresh run',() => task(async() => beginRun(c)),'primary'));
    c.runs.slice(-1).forEach(run => actions.append(button('Retest the latest run',() => task(async() => beginRun(c,run.id)))));
    main.append(h('section',{class:'panel'},h('h2',{},'Run the steps, then record what happened.'),h('p',{},'Repro Relay does not inspect or control the linked website. Open it yourself and record each observation here.'),actions));
    if (c.runs.length) main.append(notice('A retest uses the current case criteria. If you changed a step or precondition, the comparison will say “Criteria changed”.'));
    return;
  }
  const run = draft;
  main.append(notice(`In-progress run · ${run.spec.version || 'Version not recorded'} · ${run.spec.environment || 'Environment not recorded'}. This draft is in memory until you complete it.`, 'warning'));
  if (run.baselineId) main.append(field('What changed in the fix?',run.fixNote,value => { run.fixNote=value; },{area:true,hint:'Describe the actual fix, not only “works now”.'}));
  main.append(h('div',{class:'actions'},external('Open project demo',run.spec.demoUrl)));
  const progress = h('p',{class:'progress-text',role:'status'}); const updateProgress = () => { progress.textContent = `${run.observations.filter(row => row.outcome !== 'not-tested').length} / ${run.spec.steps.length} steps have a recorded result. Blocked steps still need checking.`; }; updateProgress(); main.append(progress);
  run.spec.steps.forEach((step,index) => {
    const observation = run.observations.find(row => row.stepId === step.id)!;
    const outcomes = h('div',{class:'outcome-controls',role:'group','aria-label':`Result for step ${index+1}`});
    const resultButtons = (Object.keys(outcomeLabel) as Outcome[]).map(outcome => button(outcomeLabel[outcome],() => { observation.outcome=outcome; updateProgress(); resultButtons.forEach((node,i) => node.setAttribute('aria-pressed',String((Object.keys(outcomeLabel) as Outcome[])[i] === outcome))); },outcome));
    resultButtons.forEach((node,index) => { node.setAttribute('aria-pressed',String((Object.keys(outcomeLabel) as Outcome[])[index] === observation.outcome)); outcomes.append(node); });
    main.append(h('section',{class:'review-step'},h('span',{class:'step-number'},String(index+1).padStart(2,'0')),h('div',{class:'step-content'},h('h2',{},step.action),h('div',{class:'expected'},h('strong',{},'Expected'),h('p',{},step.expected)),outcomes,field('What did you actually observe?',observation.actual,value => { observation.actual=value; },{area:true}),c.evidence.length ? h('fieldset',{class:'attach-list'},h('legend',{},'Attach processed evidence'),...c.evidence.map(image => {
      const input = h('input',{type:'checkbox',checked:observation.evidenceIds.includes(image.id),onchange:event => { const checked = (event.target as HTMLInputElement).checked; observation.evidenceIds = checked ? [...observation.evidenceIds,image.id] : observation.evidenceIds.filter(value => value !== image.id); }});
      return h('label',{},input,image.caption || 'Processed screenshot');
    })) : h('small',{},'Need a screenshot? Add processed evidence below. This run stays in memory.'))));
  });
  main.append(h('div',{class:'finish-bar'},h('p',{},'Completing freezes this run. Untested or blocked steps remain visible; they will not count as verified fixes.'),h('div',{class:'actions'},button('Complete & save run',() => task(async() => {
    const completed = finishRun(c,run);
    // Keep the completed result available even if the atomic storage transaction fails.
    drafts.set(c.id,completed); dirty.add(c.id); runDrafts.delete(c.id);
    try { await save(completed); say('Run completed and saved. Start another run to record a retest.'); }
    finally { go(`/case/${c.id}/compare`); }
  }),'primary'),button('Discard in-progress run',() => { if (confirm('Discard this unsaved run? Your completed runs stay intact.')) { runDrafts.delete(c.id); render(); } },'danger-quiet'))));
  main.append(evidencePanel(c));
}
function comparePage(main:HTMLElement,c:Capsule) {
  main.append(h('section',{class:'handoff-bar'},h('div',{},h('h2',{},'Take the trail with you.'),h('p',{},'JSON is an editable backup. HTML is a read-only report with its processed images inside.')),exports(c)));
  if (dirty.has(c.id)) main.append(h('div',{class:'actions'},button('Retry local save',() => task(async() => { await save(c); say('Unsaved work is now saved locally.'); render(); }),'primary')));
  if (!c.runs.length) { main.append(h('section',{class:'empty-state'},h('h2',{},'No completed runs yet.'),h('p',{},'Record a failure first. After a fix, retest it and compare the same steps.'),button('Record a run',() => go(`/case/${c.id}/run`),'primary'))); return; }
  const last = c.runs.at(-1)!;
  main.append(h('div',{class:'section-title'},h('h2',{},'Before → after'),button('Retest latest run',() => task(async() => beginRun(c,last.id)))));
  if (c.runs.length < 2) main.append(notice('You have the first observation. Add a retest after a fix to compare it.'));
  else {
    let beforeId = last.baselineId || c.runs.at(-2)!.id, afterId = last.id;
    const entries = c.runs.map((run,index) => ({ value:run.id,label:`Run ${index+1} · ${run.spec.version || 'Unlabelled version'} · ${time(run.completedAt)}` }));
    const comparison = h('div',{class:'comparison-list'});
    const draw = () => {
      const before = c.runs.find(run => run.id === beforeId)!, after = c.runs.find(run => run.id === afterId)!;
      comparison.replaceChildren();
      if (beforeId === afterId) { comparison.append(notice('Choose two different completed runs.','warning')); return; }
      if (c.runs.indexOf(before) > c.runs.indexOf(after)) { comparison.append(notice('The “before” run must be earlier than the “after” run.','warning')); return; }
      comparison.append(h('p',{class:'muted'},`${before.spec.version || 'Unlabelled version'} → ${after.spec.version || 'Unlabelled version'} · manual observations, not independent certification`));
      if (before.spec.environment !== after.spec.environment) comparison.append(notice(`Environment changed: ${before.spec.environment || 'not recorded'} → ${after.spec.environment || 'not recorded'}`,'warning'));
      if (before.spec.preconditions !== after.spec.preconditions) comparison.append(notice(`Starting conditions changed. Before: ${before.spec.preconditions || 'none recorded'}\nAfter: ${after.spec.preconditions || 'none recorded'}`,'warning'));
      for (const row of compareRuns(before,after)) {
        const oldStep = before.spec.steps.find(step => step.id === row.stepId), newStep = after.spec.steps.find(step => step.id === row.stepId);
        comparison.append(h('article',{class:`comparison-card ${row.change}`},h('div',{class:'card-top'},h('h3',{},row.action),badge(changeLabel[row.change],row.change)),h('div',{class:'before-after'},h('div',{},h('p',{class:'eyebrow'},'BEFORE'),badge(row.before ? outcomeLabel[row.before] : 'Missing step',row.before || 'neutral'),h('p',{},row.beforeActual || 'No observation recorded'),row.change === 'criteria-changed' ? h('p',{class:'criteria'},'Expected: ',oldStep?.expected || 'Missing step') : null),h('div',{},h('p',{class:'eyebrow'},'AFTER'),badge(row.after ? outcomeLabel[row.after] : 'Missing step',row.after || 'neutral'),h('p',{},row.afterActual || 'No observation recorded'),row.change === 'criteria-changed' ? h('p',{class:'criteria'},'Expected: ',newStep?.expected || 'Missing step') : null))));
      }
    };
    main.append(h('div',{class:'form-grid compare-selects'},selectField('Before run',beforeId,entries,value => { beforeId=value; draw(); }),selectField('After run',afterId,entries,value => { afterId=value; draw(); })),comparison); draw();
  }
  main.append(h('h2',{},'Completed run history'));
  [...c.runs].reverse().forEach(run => main.append(h('details',{class:'run-history'},h('summary',{},`Run ${c.runs.indexOf(run)+1} · ${run.spec.version || 'Version not recorded'} · ${time(run.completedAt)}`),h('p',{},'Environment: ',run.spec.environment || 'Not recorded'),h('div',{class:'actions'},external('Demo at capture',run.spec.demoUrl),external('Source at capture',run.spec.sourceUrl)),h('p',{},'Before you begin: ',run.spec.preconditions || 'Not recorded'),run.fixNote ? h('p',{},'Fix note: ',run.fixNote) : null,...run.spec.steps.map(step => {
    const result = run.observations.find(row => row.stepId === step.id)!;
    return h('div',{class:'history-step'},h('h3',{},step.action),h('p',{},'Expected: ',step.expected),badge(outcomeLabel[result.outcome],result.outcome),h('p',{},result.actual || 'No observation recorded'),...result.evidenceIds.map(imageId => { const image = c.evidence.find(item => item.id === imageId)!; return evidenceFigure(image); }));
  }),button('Retest this run',() => task(async() => beginRun(c,run.id))))));
  main.append(evidencePanel(c),h('details',{class:'danger-zone'},h('summary',{},'Remove this local case'),h('p',{},'Export a backup before deletion. This affects only this browser.'),button('Delete case from this browser',() => task(async() => {
    if (!confirm(`Delete “${c.spec.title}” and its runs from this browser? This cannot be undone here. Export first.`)) return;
    await store.remove(c.id); saved.delete(c.id); drafts.delete(c.id); dirty.delete(c.id); runDrafts.delete(c.id); say('Local case deleted. Any downloaded backups are unaffected.'); go('/');
  }),'danger')));
}
function evidenceFigure(image:Evidence) {
  return h('figure',{class:'evidence-figure'},h('img',{src:image.png,alt:image.caption || 'Processed screenshot',width:image.width,height:image.height,loading:'lazy'}),h('figcaption',{},image.caption || 'Processed screenshot',h('details',{},h('summary',{},`${image.width} × ${image.height} · SHA-256`),h('code',{},image.sha256))));
}
function evidencePanel(c:Capsule): HTMLElement {
  const panel = h('section',{class:'panel evidence-panel'},h('div',{class:'section-title'},h('h2',{},'Private evidence'),badge(`${c.evidence.length} / ${LIMITS.images}`)),h('p',{},'PNG / JPEG · up to 5 MB and 8 megapixels. Processed PNGs have a 1600px maximum edge. Only processed images are saved or exported.'),h('p',{class:'muted'},'Cover private details with opaque rectangles. Redaction cannot be undone after processing. Your original file stays on your own device.'));
  const editor = h('div',{class:'image-editor'});
  const picker = h('input',{type:'file',accept:'image/png,image/jpeg','aria-label':'Choose a screenshot to process',disabled:c.evidence.length >= LIMITS.images});
  picker.addEventListener('change',() => task(async() => {
    const file = picker.files?.[0]; if (!file) return;
    try { const original = await prepareImage(file); openImageEditor(editor,original,c); }
    finally { picker.value = ''; }
  }));
  panel.append(picker,editor,h('div',{class:'evidence-grid'},...c.evidence.map(image => h('div',{},evidenceFigure(image),button('Remove unused image',() => {
    if (c.runs.some(run => run.observations.some(row => row.evidenceIds.includes(image.id))) || runDrafts.get(c.id)?.observations.some(row => row.evidenceIds.includes(image.id))) { say('This image belongs to a run. Keep it to preserve that run’s evidence.','error'); return; }
    c.evidence = c.evidence.filter(item => item.id !== image.id); markDirty(c); render();
  },'danger-quiet')))));
  return panel;
}
function openImageEditor(host:HTMLElement,original:HTMLCanvasElement,c:Capsule) {
  imageCleanup?.();
  let rectangles:Rect[] = [], caption = '', start:{x:number;y:number}|null = null;
  const preview = h('canvas',{'aria-label':'Screenshot preview. Drag to cover private details, or use the coordinate fields below.',role:'img',class:'image-preview'}); preview.width=original.width; preview.height=original.height;
  const context = preview.getContext('2d')!;
  const count = h('p',{class:'muted',role:'status'}); const redraw = () => { context.clearRect(0,0,preview.width,preview.height); context.drawImage(original,0,0); context.fillStyle='#111816'; rectangles.forEach(r => context.fillRect(r.x,r.y,r.width,r.height)); count.textContent = `${rectangles.length} opaque rectangle${rectangles.length === 1 ? '' : 's'} · preview ${preview.width} × ${preview.height}`; }; redraw();
  const point = (event:PointerEvent) => { const box = preview.getBoundingClientRect(); return {x:(event.clientX-box.left)/box.width*preview.width,y:(event.clientY-box.top)/box.height*preview.height}; };
  preview.addEventListener('pointerdown',event => { if (event.button !== 0) return; start=point(event); preview.setPointerCapture(event.pointerId); });
  preview.addEventListener('pointerup',event => { if (!start) return; const end=point(event); const rectangle={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)}; start=null; try { rectangles.push(clampRect(rectangle,preview.width,preview.height)); redraw(); } catch(error) { say(errorText(error),'error'); } });
  preview.addEventListener('pointercancel',() => { start=null; });
  const coords = {x:0,y:0,width:100,height:60};
  const close = () => { original.width=0; original.height=0; preview.width=0; preview.height=0; rectangles=[]; host.replaceChildren(); imageCleanup=null; };
  imageCleanup=close;
  host.replaceChildren(notice('Unsaved preview. Drag across private details, or add rectangles using the keyboard. Inspect the preview before committing.','warning'),preview,count,h('div',{class:'coordinate-grid'},...(['x','y','width','height'] as const).map(key => field(key === 'x' ? 'Left (px)' : key === 'y' ? 'Top (px)' : key === 'width' ? 'Width (px)' : 'Height (px)',String(coords[key]),value => { coords[key]=Number(value); },{type:'number',max:8}))),h('div',{class:'actions'},button('Add opaque rectangle',() => { try { rectangles.push(clampRect(coords,preview.width,preview.height)); redraw(); } catch(error) { say(errorText(error),'error'); } }),button('Undo last rectangle',() => { rectangles.pop(); redraw(); },'quiet')),field('Image caption',caption,value => { caption=value; },{max:240,hint:'Describe what this processed screenshot shows.'}),h('div',{class:'actions'},button('Commit processed image',() => task(async() => { if (c.evidence.length >= LIMITS.images) throw new Error('This case already has six images.'); const image=await processEvidence(original,rectangles,caption); c.evidence.push(image); markDirty(c); close(); say('Processed PNG added. Save the case to keep it locally.'); render(); }),'primary'),button('Cancel image',close,'quiet')));
}
function demo(main:HTMLElement) {
  main.append(pageHeading('FICTIONAL CLUB BOARD · INTERACTIVE LAB','Catch it. Fix it. Check again.','These bugs really run in your browser. Your observations stay in this temporary lab until you explicitly save a copy.',[button('Reset entire lab',() => { if (lab.capsule.runs.length && !confirm('Reset this temporary demo and its recorded runs?')) return; lab.capsule=labCase(); lab.version='broken'; lab.rows=seedRows(); lab.query=''; lab.draft=null; lab.currentStep=0; lab.feedback=''; render(); },'quiet')]));
  const switcher = h('div',{class:'version-switch',role:'group','aria-label':'Demo implementation'},...(['broken','fixed'] as BoardVersion[]).map(version => h('button',{type:'button','aria-pressed':lab.version === version,class:`button ${lab.version === version ? 'primary' : 'secondary'}`,onclick:() => { lab.version=version; lab.rows=seedRows(); lab.query=''; lab.feedback=''; render(); }},version === 'broken' ? 'Broken v1' : 'Fixed v2')));
  main.append(switcher);
  const board = h('section',{class:'club-board','aria-label':'Fictional signup board'},h('div',{class:'board-heading'},h('div',{},h('p',{class:'eyebrow'},'AFTER SCHOOL · FICTIONAL DATA'),h('h2',{},'Little Orbit Club')),badge(lab.version === 'broken' ? 'Broken v1' : 'Fixed v2',lab.version === 'broken' ? 'fail' : 'pass')));
  const rowsHost = h('div',{class:'board-rows'}), boardCount=h('p',{class:'muted',role:'status'});
  const drawBoard = () => {
    const visible = filterRows(lab.rows,lab.query,lab.version);
    rowsHost.replaceChildren(...visible.map((row,index) => h('div',{class:'board-row'},h('div',{},h('strong',{},row.name),h('small',{},row.role)),h('span',{},row.checked ? 'Checked in' : 'Not checked'),button(row.checked ? `Undo ${row.name}` : `Check ${row.name}`,() => { lab.rows=checkRow(lab.rows,visible,index,lab.version); drawBoard(); },'quiet'))));
    if (!visible.length) rowsHost.append(notice('No matching registrations.'));
    boardCount.textContent=`${visible.length} visible · ${lab.rows.length} total registrations · ${lab.rows.filter(row => row.checked).map(row => row.name).join(', ') || 'Nobody'} checked`;
  };
  board.append(h('form',{class:'signup-form',onsubmit:event => { event.preventDefault(); lab.rows=register(lab.rows,lab.name,lab.version); drawBoard(); }},field('Registration name',lab.name,value => { lab.name=value; },{max:60}),h('button',{type:'submit',class:'button primary'},'Register')),field('Search registrations',lab.query,value => { lab.query=value; drawBoard(); },{max:80}),boardCount,rowsHost,button('Reset board for next step',() => { lab.rows=seedRows(); lab.query=''; render(); },'quiet')); drawBoard();
  const guide = h('section',{class:'lab-guide'},h('p',{class:'eyebrow'},'FOLLOW THE TRAIL'),h('h2',{},lab.version === 'broken' ? 'First, find the failure.' : 'Now check the same steps.'));
  if (!lab.draft) {
    guide.append(h('p',{},lab.capsule.runs.length ? 'A completed run is below. Start a retest in the fixed version to check the same criteria.' : 'Start a run, try each step on the board, then record what you saw.'),button(lab.capsule.runs.length ? 'Start retest of latest run' : 'Start demo run',() => { lab.capsule.spec.version=lab.version === 'broken' ? 'broken-v1' : 'fixed-v2'; lab.draft=startRun(lab.capsule,lab.capsule.runs.at(-1)?.id || null); if (lab.version === 'fixed') lab.draft.fixNote='Prevent repeat registrations, trim search queries and use stable registration IDs when checking filtered rows.'; lab.currentStep=0; render(); },'primary'));
    if (!lab.capsule.runs.length) guide.append(h('ol',{class:'preview-steps'},...lab.capsule.spec.steps.map(step => h('li',{},h('strong',{},step.action),h('p',{},step.expected)))));
  } else {
    const run = lab.draft, step=run.spec.steps[lab.currentStep]!, observation=run.observations.find(row => row.stepId === step.id)!;
    guide.append(badge(`Step ${lab.currentStep+1} / 3 · run started on ${run.spec.version}`),h('h3',{},step.action),h('div',{class:'expected'},h('strong',{},'Expected'),h('p',{},step.expected)),h('p',{class:'muted'},'Reset the board before trying this step. Record your own result below.'),selectField('Your observed result',observation.outcome,(Object.keys(outcomeLabel) as Outcome[]).map(value => ({value,label:outcomeLabel[value]})),value => { observation.outcome=value as Outcome; }),field('What happened?',observation.actual,value => { observation.actual=value; },{area:true}),h('div',{class:'actions'},button('Previous step',() => { lab.currentStep--; render(); },'quiet',lab.currentStep === 0),lab.currentStep < 2 ? button('Next step →',() => { lab.currentStep++; lab.rows=seedRows(); lab.query=''; render(); },'primary') : button('Complete demo run',() => { lab.capsule=finishRun(lab.capsule,run); lab.draft=null; lab.feedback='Demo run completed. Untested steps stay unverified.'; render(); },'primary')));
  }
  main.append(h('div',{class:'lab-layout'},board,guide));
  if (lab.feedback) main.append(notice(lab.feedback));
  if (lab.capsule.runs.length) {
    const latest=lab.capsule.runs.at(-1)!;
    main.append(h('section',{class:'panel'},h('div',{class:'section-title'},h('h2',{},'Your demo observations'),badge(`${lab.capsule.runs.length} completed run${lab.capsule.runs.length === 1 ? '' : 's'}`)),h('div',{class:'demo-results'},...latest.observations.map(row => h('div',{},badge(outcomeLabel[row.outcome],row.outcome),h('span',{},latest.spec.steps.find(step => step.id === row.stepId)!.action)))),latest.baselineId ? h('div',{class:'mini-comparison'},...compareRuns(lab.capsule.runs.find(run => run.id === latest.baselineId)!,latest).map(row => h('p',{},badge(changeLabel[row.change],row.change),' ',row.action))) : null,h('div',{class:'actions'},exports(lab.capsule),button('Save demo as a separate local case',() => task(async() => { const c=importedCopy(lab.capsule); await save(c); drafts.set(c.id,clone(c)); say('Your demo observations were saved as a separate local case.'); go(`/case/${c.id}/compare`); }),'primary'))));
  }
  main.append(h('details',{class:'lab-explanation'},h('summary',{},'What the fixed implementation changes'),h('ul',{},h('li',{},'Repeated submissions check for an existing trimmed, case-insensitive name in this fictional board.'),h('li',{},'The search normalizes whitespace before matching.'),h('li',{},'A filtered row is checked by its stable ID, rather than its position in the full list.'))));
}
function about(main:HTMLElement) {
  main.append(pageHeading('HOW IT WORKS','A small handoff, with a clear history.','Use it for review feedback, bug triage or checking whether a fix really changed the original failure.'));
  main.append(h('div',{class:'about-grid'},...[
    ['01','Caught','Write one action and one expected result at a time. Add the starting state and build version so somebody else can reproduce it.'],
    ['02','Reproduced','Try the steps yourself. Record what happened, including failures, blocked checks and screenshots with private details covered.'],
    ['03','Fixed','Explain the actual change. Start a new retest linked to an earlier run. The earlier run keeps its original steps and results.'],
    ['04','Checked again','Compare matching step IDs. If the expected result or setup changed, say so. Export the trail for somebody else to inspect.'],
  ].map(([number,title,description]) => h('article',{class:'panel'},h('span',{class:'step-number'},number),h('h2',{},title),h('p',{},description)))));
  main.append(h('section',{class:'panel'},h('h2',{},'Where the data lives'),h('p',{},'Cases are stored in IndexedDB in this browser profile and site. There is no server, login, telemetry or automatic synchronization. Draft edits and in-progress runs are only in memory until explicitly saved. Clearing browser data, private browsing or moving to another browser can lose local work. Export JSON backups.'),h('p',{},'Offline app use is available after a production visit finishes caching. Downloaded HTML reports work offline immediately and contain no scripts. Links to a project require the internet if you choose to open them.'),h('h2',{},'What the trail proves'),h('p',{},'Completed run snapshots cannot be edited through the app. JSON backups remain editable files: they are not signed audit records. A pass records a person’s observation, not an independent approval. SHA-256 helps detect altered image bytes, but does not prove authenticity or authorship.'),h('h2',{},'Limits that keep a browser tool manageable'),h('p',{},'20 saved cases, 12 steps per case, 20 completed runs and 6 processed screenshots per case. Source images: PNG/JPEG, 5 MB, 8 megapixels. Processed images: PNG, 1600px maximum edge, 2 MB. JSON imports: 20 MB. Stored case data: 40 MB.'),h('h2',{},'Built openly'),h('p',{},'Repro Relay was implemented with substantial Codex assistance. Its demo data is fictional, and its bugs, tests and browser checks are documented in the public repository. No claim is made about independent human authorship or competition rewards.'),external('Source & setup notes','https://github.com/aaravkatiyar55-gif/repro-relay')));
}

document.querySelector('.skip-link')?.addEventListener('click',event => { event.preventDefault(); document.querySelector<HTMLElement>('#main')?.focus(); });
window.addEventListener('hashchange',() => { render(); document.querySelector<HTMLElement>('h1')?.focus({preventScroll:true}); window.scrollTo(0,0); });
window.addEventListener('beforeunload',event => { if (dirty.size || runDrafts.size || lab.draft) { event.preventDefault(); event.returnValue=''; } });
render();
store.list().then(result => { result.cases.forEach(c => saved.set(c.id,c)); if (result.warnings.length) storageProblem=result.warnings.join(' '); }).catch(error => { storageProblem=errorText(error); }).finally(() => { loaded=true; render(); });
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => { offlineReady=true; const label=document.querySelector('.local-label'); if (label) label.textContent='Offline copy ready'; }).catch(() => { /* Local cases still work; no offline-ready claim is shown. */ });
}
