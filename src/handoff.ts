import { safeUrl, outcomeLabel } from './model.ts';
import type { Capsule } from './model.ts';
import { compareRuns, changeLabel } from './compare.ts';
import { validateCapsule } from './validation.ts';

export interface HandoffCheck { label:string; complete:boolean; detail:string }
export function handoffChecks(capsule:Capsule):HandoffCheck[] {
  const latest=capsule.runs.at(-1), spec=latest?.spec ?? capsule.spec;
  const untested=latest?.observations.filter(row=>row.outcome==='not-tested').length ?? 0;
  const blocked=latest?.observations.filter(row=>row.outcome==='blocked').length ?? 0;
  const missingNotes=latest?.observations.filter(row=>row.outcome!=='not-tested' && !row.actual.trim()).length ?? 0;
  const referenced=new Set(capsule.runs.flatMap(run=>run.observations.flatMap(row=>row.evidenceIds)));
  const loose=capsule.evidence.filter(image=>!referenced.has(image.id)).length;
  return [
    {label:'Reproduction criteria',complete:!!spec.title.trim() && !!spec.steps.length && spec.steps.every(step=>!!step.action.trim() && !!step.expected.trim()),detail:'A title, ordered actions and clear expectations are needed for a useful handoff.'},
    {label:'Build and environment',complete:!!spec.version.trim() && !!spec.environment.trim(),detail:'Use a version or commit and the device/browser used for this run.'},
    {label:'Starting state',complete:!!spec.preconditions.trim(),detail:'Explain the starting data and how to reset it.'},
    {label:'Working handoff links',complete:!!safeUrl(spec.demoUrl) && !!safeUrl(spec.sourceUrl),detail:'Demo and source links use HTTP(S). Their availability must be checked separately.'},
    {label:'Recorded run',complete:!!latest,detail:latest ? `${latest.observations.length} step results in the latest completed snapshot.` : 'Complete a run before calling this an observed failure or retest.'},
    {label:'Remaining checks',complete:!!latest && !untested && !blocked,detail:latest ? `${untested} not tested; ${blocked} blocked. Failures are valid feedback, not missing work.` : 'No completed run yet.'},
    {label:'Observed details',complete:!!latest && !missingNotes,detail:latest ? `${missingNotes} recorded results need an actual-result note.` : 'Record what happened, including errors and blockers.'},
    {label:'Connected fix note',complete:!!latest && (!latest.baselineId || !!latest.fixNote.trim()),detail:latest?.baselineId ? 'Describe what changed between the linked failure and this retest.' : 'A fix note is needed when a retest has a baseline.'},
    {label:'Evidence attached',complete:!loose,detail:`${loose} processed image(s) are not attached to a completed run. Screenshots are optional.`},
  ];
}
// Escape both Markdown syntax and raw HTML. Captured text must remain text in an issue.
export const markdownText=(value:string):string=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_{}\[\]()#+.!|~\-]/g,'\\$&').replace(/\r\n?/g,'\n');
const block=(value:string)=>markdownText(value || 'Not recorded').split('\n').map(line=>'> '+line).join('\n');
const link=(label:string,value:string)=>{
  const url=safeUrl(value);
  return url ? '['+label+']('+url.replace(/[()<>\\]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase())+')' : label+': not recorded';
};
export const evidenceFilename=(imageId:string)=>'processed-'+imageId+'.png';
export function buildIssueMarkdown(capsule:Capsule):string {
  validateCapsule(capsule);
  const latest=capsule.runs.at(-1), spec=latest?.spec ?? capsule.spec;
  const lines=['# '+markdownText(spec.title),'',block(spec.summary),'',
    '> This handoff contains manual observations, not independent certification. Repro Relay does not replay or inspect the linked project.',
    '',link('Demo at capture',spec.demoUrl)+' · '+link('Source at capture',spec.sourceUrl),'',
    '## Build and starting state','', '**Version:** '+markdownText(spec.version || 'Not recorded'),'', '**Environment**','',block(spec.environment),'','**Before you begin**','',block(spec.preconditions),'',
    '## Steps and observed results',''];
  spec.steps.forEach((step,index)=>{
    const result=latest?.observations.find(row=>row.stepId===step.id);
    lines.push('### Step '+(index+1),'','**Action**','',block(step.action),'','**Expected**','',block(step.expected),'','**Result:** '+(result ? outcomeLabel[result.outcome] : 'Not recorded'),'','**Actually observed**','',block(result?.actual || ''),'');
    result?.evidenceIds.forEach(imageId=>{const image=capsule.evidence.find(item=>item.id===imageId)!;lines.push('Attachment: `'+evidenceFilename(image.id)+'` — '+markdownText(image.caption || 'Processed screenshot'),'');});
  });
  if(latest?.baselineId){
    const before=capsule.runs.find(run=>run.id===latest.baselineId)!;
    lines.push('## Original failure and retest','','Baseline version: '+markdownText(before.spec.version || 'Not recorded'),'', 'Baseline environment: '+markdownText(before.spec.environment || 'Not recorded'),'',link('Baseline demo',before.spec.demoUrl)+' · '+link('Baseline source',before.spec.sourceUrl),'', '**Fix note**','',block(latest.fixNote),'');
    for(const row of compareRuns(before,latest)){
      const oldStep=before.spec.steps.find(step=>step.id===row.stepId);
      lines.push('### '+markdownText(row.action),'',changeLabel[row.change],'','**Before result:** '+(row.before ? outcomeLabel[row.before] : 'Missing step'),'',block(row.beforeActual),'','**After result:** '+(row.after ? outcomeLabel[row.after] : 'Missing step'),'',block(row.afterActual),'');
      if(row.change==='criteria-changed') lines.push('**Earlier action**','',block(oldStep?.action || ''),'','**Earlier expected result**','',block(oldStep?.expected || ''),'');
    }
    if(before.spec.preconditions!==latest.spec.preconditions) lines.push('**Earlier starting state**','',block(before.spec.preconditions),'');
  }
  lines.push('## Handoff checks','');
  handoffChecks(capsule).forEach(check=>lines.push('- ['+(check.complete ? 'x' : ' ')+'] '+check.label+' — '+markdownText(check.detail)));
  if(capsule.evidence.length){
    lines.push('','## Processed attachments','','Download these PNGs from the case and attach them to your issue yourself. They are not uploaded automatically; original images are excluded.','');
    for(const image of capsule.evidence) lines.push('- `'+evidenceFilename(image.id)+'` — '+markdownText(image.caption || 'Processed screenshot')+' — '+image.width+' × '+image.height+' — SHA-256 `'+image.sha256+'`');
  }
  lines.push('','---','Repro Relay · '+(latest ? 'Run completed '+latest.completedAt : 'No completed run')+' · case `'+capsule.id+'`','SHA-256 detects changed processed image bytes; it does not prove who captured them.','');
  return lines.join('\n');
}
