# First-build devlog draft — not posted

This is a factual draft prepared with Codex assistance. No duration should be added unless the correct linked tracker record supports it. The matching `repro-relay` label is now linked and the form offers 0h 52m; this file is not proof of a published devlog. Tracker duration does not establish manual human authorship.

---

Repro Relay now has a working first version. The starting problem was feedback like “it doesn't work” without a version, a sequence of clicks or a result to compare against. The tool keeps that first failure beside the fix note and the next check.

A case has ordered steps and stable IDs. Every completed run keeps its own specification and observations. Reordering the current case still matches the same steps. Editing an expected result produces “Criteria changed”; blocked and skipped checks stay unverified. A newer green label cannot replace yesterday's recorded failure.

The small demo is a fictional club signup board. Broken v1 really allows two Alex registrations, misses `  Mina  ` with surrounding spaces, and checks Mina when the filtered row is Sam. Fixed v2 rejects repeated names, trims searches and uses row IDs. All three failures and matching fixes were tried in the browser, including the public deployment. Results start as Not tested; somebody still has to try the board and record what happened.

Screenshots can be processed before they become evidence. Drag opaque rectangles or enter their coordinates with the keyboard. Only the resulting PNG is saved. The redaction check decoded an actual processed screenshot and confirmed that all 14,400 covered pixels were opaque. SHA-256 checks image bytes on import, but it is not proof of authorship or a truthful scene.

The handoff is an editable JSON backup or a script-free HTML report with processed images inside it. Valid imports create separate cases. Invalid JSON and a tampered image digest left existing cases intact. The report preview and cached app were tried offline. The browser automation tool blocks opening local `file:` URLs, so the downloaded report was not opened from disk through that tool; the exact complete HTML, embedded image and offline preview were checked instead.

The first UI pass fixed a skip-link routing problem, a squeezed mobile toast, replacement of an unfinished retest and a hidden file input that caused horizontal overflow. Run history and reports keep the original build links too. Shared evidence is embedded once in the HTML report, with links from each relevant observation.

The next round tackled interrupted reviews. An unfinished run can now be saved as a checkpoint, resumed after reload or carried in a draft backup. The browser check recovered a Blocked result and its exact note without creating a completed run. Importing the preview JSON created another case with the same step ID. That imported review was completed only after the recovery check had actually been performed.

Saving from two tabs was another weak spot. The older tab now receives a conflict message and keeps its edits instead of replacing the newer saved record. Save separate copy keeps both versions. An automated asynchronous-save check also confirmed that typing after a save starts stays marked unsaved; the app cannot report those newer edits as stored.

There is now a Markdown preview for an issue, with captured build details, actual observations, the baseline and the fix note. Processed PNGs can be downloaded individually for attachments. The app does not post the issue. Context reminders point out missing setup or untested steps, and comparison filters help a reviewer find the remaining checks. Changed criteria and blocked results still cannot count as verified fixes.

All 28 tests, strict TypeScript and offline production build checks pass locally. Two-tab recovery, checkpoint import, keyboard navigation, offline reload and the 360px recovery view were also checked in the browser. The new build's public verification is recorded separately in the ship-status file. The README explains the workflow, real decisions and practical testing limits. The browser tool's draft download-path helper timed out, so the preview-copy/import fallback was tested instead; no downloaded path is claimed.

Aarav chose the direction and scope. Codex implemented most of the application, tests, build setup and documentation, and operated the recorded browser checks. This is substantially AI-assisted work. No human-only authorship, eligible duration, reviewer approval or Stardust reward is claimed.

[Try Repro Relay](https://aaravkatiyar55-gif.github.io/repro-relay/#/demo) · [Source and walkthrough](https://github.com/aaravkatiyar55-gif/repro-relay)

## Actual screenshots available for the eventual post

- [Public inspection desk](screenshots/public-home.jpg)
- [Broken board](screenshots/broken-board.jpg)
- [Fixed demo](screenshots/fixed-demo.jpg)
- [Matching failure and retest](screenshots/retest-comparison.jpg)
- [Changed criteria and incomplete retest](screenshots/criteria-comparison.jpg)
- [Redaction editor](screenshots/redaction-preview.jpg)
- [Offline report preview](screenshots/offline-report.jpg)
- [Compact report with linked processed evidence](screenshots/compact-report.jpg)
- [Final public report preview](screenshots/public-report.jpg)
- [Final public interactive demo](screenshots/public-demo.jpg)
- [360px comparison](screenshots/mobile-comparison.jpg)
- [360px home page](screenshots/mobile-home.jpg)
- [Unfinished review recovered after reload](screenshots/draft-recovery.jpg)
- [Issue Markdown handoff](screenshots/issue-handoff.jpg)
- [Two-tab conflict preserving the older tab's edit](screenshots/save-conflict.jpg)
- [360px draft recovery](screenshots/mobile-draft-recovery.png)

The comparison with changed criteria is a clearly labelled QA fixture, not another released board version. All data shown is fictional.
