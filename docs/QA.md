# Verification record

Checks below refer to this implementation, not to an independently certified project review. Browser QA used the Codex in-app Chromium browser because original Chrome was not connected to the available tools. No native desktop input was used.

## Automated checks

Run `npm run verify` on Node 24. All 28 tests pass. The original 15 core tests cover:

1. Snapshot isolation and refusing a duplicate completion.
2. Reordered stable step IDs matching the original failure.
3. Changed expected results and preconditions remaining explicit.
4. Blocked/incomplete retests, added/removed steps and regressions.
5. Strict schema, duplicate IDs and unsafe URL rejection.
6. One result per step, valid evidence references and earlier baselines.
7. Malformed/oversized JSON, digest mismatch, dimensions and failed decoding.
8. Import copies retaining internal IDs without replacing their source.
9. IndexedDB persistence across connections and atomic case-limit failure.
10. A simulated storage-open failure with a recovery message.
11. Opaque pixel redaction, clipping and unchanged neighbouring pixels.
12. PNG/JPEG signature, truncation and pre-decode size limits.
13. Escaping script-like report text, excluding scripts/remote assets and keeping captured build links after current links change.
14. The three actual broken/fixed demo implementations.
15. Repeated evidence references across three completed runs embedding one image with nine working report links.

The 13 recovery and handoff tests cover:

1. Two independent store connections refusing a stale save and preserving both versions through a separate copy.
2. A new edit during an actual asynchronous save remaining unsaved while only the captured snapshot is stored.
3. Save timestamps advancing even when the previous timestamp is ahead of the current clock.
4. An IndexedDB v1 database upgrading with its existing case intact.
5. An unfinished review surviving a new connection and completion removing its checkpoint atomically.
6. Stale checkpoint, completion and deletion transactions leaving both saved records untouched.
7. Completed run history refusing silent replacement.
8. Referenced completed evidence preserving its caption and processed bytes; Markdown references attachments without embedding their data URLs.
9. A damaged checkpoint being skipped and retained while its case stays intact.
10. Draft backups importing as separate cases, preserving internal IDs, and rejecting invalid references, baselines and extra fields.
11. Case deletion also removing its checkpoint in one transaction.
12. Context reminders working for an empty case, treating failures as valid feedback and blocked checks as unfinished.
13. Issue Markdown using frozen build links, escaped script-like text, explicit untested results and earlier criteria.

The production build also checks local asset references, script CSP, service-worker syntax, existing precache assets and request scope. `npm ci --ignore-scripts` installs only locked development dependencies. No runtime packages are installed.

## Browser checks completed on 30 September 2026

| Check | Observed result |
| --- | --- |
| Broken duplicate | Two Alex rows, five registrations |
| Fixed duplicate | One Alex row, four registrations |
| Broken whitespace search | No matches for `  Mina  ` |
| Fixed whitespace search | Mina only |
| Broken filtered identity | Checking filtered Sam checked Mina |
| Fixed filtered identity | Only Sam checked after clearing search |
| Reload | Saved baseline, retest and original criteria remained available |
| Changed criteria | Amber “Criteria changed”; old expected result still visible |
| Incomplete retest | Blocked and not-tested checks remained “Needs checking” |
| Evidence input | Actual JPEG screenshot decoded and opened in editor |
| Keyboard redaction | Coordinate inputs and Enter added an opaque rectangle |
| Processed bytes | PNG SHA-256 matched; all 14,400 covered pixels had RGBA `(17,24,22,255)` |
| Malformed import | Error shown, existing case count unchanged |
| Digest mismatch | Error shown, both saved cases unchanged |
| Valid backup | Browser decoded processed PNG; import created a separate case |
| Script-like input | Literal title text, zero heading child elements / injected inline scripts |
| Keyboard flow | Enter created/saved case, Space selected result, Enter completed run |
| Skip link | Enter focused `main` without changing the case route |
| Mobile comparison | 360px viewport, no horizontal overflow or out-of-bounds controls |
| Home-page overflow fix | Locally: 1280px viewport / 1265px page and 360px viewport / 345px page; hidden input is 1px |
| Captured build links | Labelled synthetic fixture: run history and report retained v1 links while the current case used v2; all fixture outcomes were Not tested |
| Compact evidence report | Actual 3-run QA report: 1 image / 1 reference, 410,375 bytes instead of 812,923 bytes. Preview anchor reached the decoded 1265 × 712 image |
| Offline app | Cached production shell reloaded with network emulation set offline |
| Offline report preview | Script-free report and embedded image displayed while offline |
| JSON / HTML downloads | Browser download events reported completion |

The automation download-path API timed out even though Chromium reported completed downloads. The report preview's exact generated HTML and the backup preview's complete JSON were therefore saved as QA artifacts through their visible DOM. A single large textarea read was truncated by the automation interface, and the app correctly rejected that truncated test file. Reading the visible text in bounded chunks recovered the complete backup; it then imported successfully.

## Limits on these checks

The browser tool blocks `file:` navigation. The saved report was not opened from disk through that tool; no workaround was used for the blocked navigation. Its sandboxed preview was tested offline, its complete HTML was validated, its embedded processed image was decoded and its lack of scripts/remote assets was checked. Native filesystem opening can be checked in an ordinary browser by double-clicking the downloaded HTML.

Storage-open and case-limit failures are automated tests. A real browser disk-quota exhaustion was not induced. No external websites were scanned or replayed. Mobile validation is a 360px Chromium viewport check, not a claim of testing every phone or assistive technology.

## Recovery round: local production browser checks

These checks used the built production app on `127.0.0.1:4173`, with fictional QA cases. Existing test cases were preserved.

| Check | Observed result |
| --- | --- |
| Save and reload checkpoint | The same Blocked result and exact note resumed; completed history still contained zero runs |
| Home resume control | Saved review checkpoint badge and Resume review opened that unfinished run |
| Draft preview round trip | Complete visible preview JSON imported through the file picker as a different case ID with the same step ID and unfinished result |
| Complete recovered review | The imported copy was marked Pass only after the recovery/import check; one completed run was saved and its checkpoint removed |
| Two-tab conflict | First tab's saved title stayed intact; older tab's save was refused and its input retained |
| Separate-copy recovery | The older tab's edit and completed history were saved under a new case ID; reloading the original retained the first title |
| Issue Markdown preview | Captured version, environment, links and the actual completed note appeared in the visible preview |
| Keyboard navigation | Enter on Next unchecked step focused the matching step heading |
| Offline checkpoint | Cached shell reloaded offline and recovered the checkpoint and exact note; networking was restored afterwards |
| Mobile recovery view | Actual viewport, page width and main width were each 360px, with no horizontal overflow; viewport override was cleared afterwards |
| Comparison filters | Changed/blocked/untested QA run: zero Passed on retest cards. Matching broken-v1 → fixed-v2: three |
| Console | No warning/error entries observed in this local recovery session |

The new draft download wait/path helper timed out. The visible preview round trip verifies portable content and import, not a downloaded filesystem path. The save-during-typing check is an automated store/session test; it was not timed against browser input. Individual PNG download content is covered by byte validation, but its filesystem path was not verified in this browser session.

The browser-wide viewport setting did not initially resize the in-app browser. Mobile verification used the documented tab CDP device-metrics capability instead. The recorded DOM widths and an actual 360 × 800 PNG capture confirm the applied size. The screenshot was inspected and kept without visual editing. Native desktop capture is not the source of these images.

Actual captures: [draft recovery](screenshots/draft-recovery.jpg), [issue handoff](screenshots/issue-handoff.jpg), [save conflict](screenshots/save-conflict.jpg), [360px recovery](screenshots/mobile-draft-recovery.png).

## Fresh public origin

The GitHub Pages deployment was opened with no Repro Relay cases already saved on that origin. Broken v1 reproduced duplicate Alex rows, zero results for the spaced Mina query and Mina checked instead of filtered Sam. Fixed v2 produced one Alex row, Mina as the single match and only Sam checked. The app shell reloaded while that tab's network was emulated offline; networking was restored afterwards. No warning/error console entries were observed in that session. The public home screenshot was also used as the Stardance banner.

The final overflow correction was also checked on the public origin at desktop and 360px. The final shared-image export was checked after its successful Pages deployment: a separate local import retained three completed QA runs, the preview contained one image / one evidence reference / zero scripts, and activating the evidence link reached the decoded redacted image. The latest public demo reloaded offline using the final bundle, and no warning/error console entries were observed. Networking was restored, and responsive emulation was cleared. Tracker and mission status are recorded in [SHIP_STATUS.md](SHIP_STATUS.md).

The final report preview uses `about:srcdoc#...` anchors; downloaded HTML uses local `#...` anchors. The generated content is otherwise the same. Frame-scoped locator clicks/keypresses timed out in the automation interface. The browser accessibility click successfully activated the visible link: the frame URL acquired the evidence fragment, and the decoded image reached the top of the frame. This was a tool interaction limitation, not a claimed unsuccessful pass.
