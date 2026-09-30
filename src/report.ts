import type { Capsule, Run } from './model.ts';
import { outcomeLabel, safeUrl } from './model.ts';
import { validateCapsule } from './validation.ts';
import { compareRuns, changeLabel } from './compare.ts';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));
const e = escapeHtml;
function link(label: string, value: string): string { const url = safeUrl(value); return url ? `<a href="${e(url)}" rel="noopener noreferrer">${e(label)}</a>` : ''; }
function runHtml(run: Run, capsule: Capsule, index: number, preview: boolean): string {
  const baseline = capsule.runs.find(item => item.id === run.baselineId);
  const comparison = baseline ? `<h3>Compared with run ${capsule.runs.indexOf(baseline)+1}</h3><ul>${compareRuns(baseline,run).map(row => `<li><strong>${e(changeLabel[row.change])}</strong> — ${e(row.action)}<br>Before: ${e(row.before ? outcomeLabel[row.before] : 'Missing')} · After: ${e(row.after ? outcomeLabel[row.after] : 'Missing')}</li>`).join('')}</ul>` : '';
  const snapshotLinks = [link('Demo at capture',run.spec.demoUrl),link('Source at capture',run.spec.sourceUrl)].filter(Boolean).join(' · ');
  return `<section><h2>Run ${index + 1} · ${e(run.spec.version || 'Version not recorded')}</h2><p>${e(run.completedAt)} · ${e(run.spec.environment || 'Environment not recorded')}</p>${snapshotLinks ? `<p>${snapshotLinks}</p>` : ''}<p><strong>Preconditions:</strong> ${e(run.spec.preconditions || 'None recorded')}</p>${run.fixNote ? `<p><strong>Fix note:</strong> ${e(run.fixNote)}</p>` : ''}<ol>${run.spec.steps.map(step => {
    const result = run.observations.find(row => row.stepId === step.id)!;
    return `<li><h3>${e(step.action)}</h3><p><strong>Expected:</strong> ${e(step.expected)}</p><p><strong>${e(outcomeLabel[result.outcome])}:</strong> ${e(result.actual || 'No observation recorded')}</p>${result.evidenceIds.map(imageId => {
      const image = capsule.evidence.find(item => item.id === imageId)!;
      return `<p><a href="${preview ? 'about:srcdoc' : ''}#evidence-${e(image.id)}">View evidence: ${e(image.caption || 'Processed screenshot')}</a></p>`;
    }).join('')}</li>`;
  }).join('')}</ol>${comparison}</section>`;
}
function evidenceIndex(capsule: Capsule): string {
  if (!capsule.evidence.length) return '';
  return `<section><h2>Evidence index</h2><p>Only processed PNGs are included. Original uploads are not stored by Repro Relay. Each image is embedded once; observation links above point to it here.</p>${capsule.evidence.map(image => `<figure id="evidence-${e(image.id)}"><img src="${e(image.png)}" alt="${e(image.caption || 'Processed screenshot')}" width="${image.width}" height="${image.height}"><figcaption>${e(image.caption || 'Processed screenshot')}<details><summary>SHA-256 of processed bytes</summary><code>${image.sha256}</code></details></figcaption></figure>`).join('')}</section>`;
}
export function buildReport(capsule: Capsule, preview = false): string {
  validateCapsule(capsule);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(capsule.spec.title)} · Repro Relay</title><style>body{max-width:880px;margin:auto;padding:32px 20px;background:#faf9f4;color:#1a2f27;font:16px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}h1,h2,h3{line-height:1.25}header,section{border-bottom:1px solid #c9d2c6;padding-bottom:24px;margin-bottom:28px}h1{font-size:36px}h2{font-size:24px}h3{font-size:18px}li{margin:14px 0}p{white-space:pre-wrap}img{display:block;max-width:100%;height:auto;border:1px solid #a1b2a7;border-radius:8px}figure{margin:18px 0}figcaption,footer{font-size:14px}a{color:#07533b}code{word-break:break-all}summary{cursor:pointer}aside{padding:14px;background:#eee9d7;border-radius:8px}@media print{body{background:white;padding:0}section{break-inside:avoid}details{display:block}a{color:black}}</style></head><body><header><p>REPRO RELAY · PORTABLE HANDOFF</p><h1>${e(capsule.spec.title)}</h1><p>${e(capsule.spec.summary)}</p><p>${link('Project demo',capsule.spec.demoUrl)} ${link('Source code',capsule.spec.sourceUrl)}</p><aside>This is a read-only copy of recorded manual observations. A green result is not an independent verification. Completed snapshots preserve the criteria used at that time. SHA-256 detects changed image bytes; it does not prove who captured them. This file has no scripts or network dependencies. External project links open only if you choose them.</aside></header><section><h2>Current reproduction steps</h2><p><strong>Version:</strong> ${e(capsule.spec.version || 'Not recorded')}<br><strong>Environment:</strong> ${e(capsule.spec.environment || 'Not recorded')}</p><p><strong>Preconditions:</strong> ${e(capsule.spec.preconditions || 'None recorded')}</p><ol>${capsule.spec.steps.map(step => `<li><h3>${e(step.action)}</h3><p>Expected: ${e(step.expected)}</p></li>`).join('')}</ol></section>${capsule.runs.map((run,index) => runHtml(run,capsule,index,preview)).join('')}${evidenceIndex(capsule)}<footer>Repro Relay schema v1 · Case ${e(capsule.id)} · Updated ${e(capsule.updatedAt)}<br>Made for a failure, a fix and the check that follows.</footer></body></html>`;
}
export function fileStem(title: string): string { return title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64) || 'repro-case'; }
export function download(contents: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
