# Ship status

Updated 1 October 2026. This record separates the working product from tracker eligibility and Stardance approval.

## Product

- Local production build, strict TypeScript, 28 tests and offline build checks pass.
- The three deliberate failures and corresponding fixes were checked in the browser.
- Snapshot comparison, private evidence processing, valid/invalid imports, keyboard flow and offline preview checks are recorded in [QA.md](QA.md).
- Source, setup instructions, assistance disclosure, original banner and actual app screenshots are included.
- The recovery round adds saved draft checkpoints, portable draft backups, two-tab conflict protection, separate copies, save-during-edit revision tracking, issue Markdown, context reminders and comparison filters. Local browser checks and the additional 13 regression tests are recorded in [QA.md](QA.md). This round does not claim two hours of native VS Code work.
- [Public source](https://github.com/aaravkatiyar55-gif/repro-relay) and [live app](https://aaravkatiyar55-gif.github.io/repro-relay/) are available. The initial [Pages verification and deployment](https://github.com/aaravkatiyar55-gif/repro-relay/actions/runs/36704846474) succeeded.
- On the fresh public origin, all three broken failures reproduced and all three corresponding fixed behaviors passed. The deployed shell reloaded offline, networking was restored, and no warning/error console entries were observed in that session.
- The [updated Pages deployment](https://github.com/aaravkatiyar55-gif/repro-relay/actions/runs/36706283596) passed. Public layout checks confirmed a 1280px viewport / 1265px page and 360px viewport / 345px page. The hidden input is 1px. The updated bundle also reloaded offline; emulation was cleared and networking restored. Captured v1 links remain in the run history/report beside the current case's v2 links.
- The [final shared-image report deployment](https://github.com/aaravkatiyar55-gif/repro-relay/actions/runs/36708174035) passed. Its fresh public check imported the fictional QA case as a separate local copy, showed one embedded processed image, one evidence link and zero script tags, and successfully jumped to the decoded image. The latest public demo also reloaded offline. Network and viewport overrides were cleared; no warning/error console entries were observed.

## Tracker and submission

The intended label is `repro-relay`. Opening VS Code and setting `.wakatime-project` do not prove eligible time. Earlier on 30 September, the live Stardance Hackatime picker did not list `repro-relay`. In the latest check it showed **52m 16s** for that exact label. It was linked to this project; a fresh project tab confirmed the devlog control became available, and its form offers **0h 52m** to log. Other project labels were not linked or reassigned. No synthetic heartbeats, filler edits or hours from another project are used. This is the platform's tracker reading, not proof of two hours of manual VS Code work or certified payout time.

[Stardance project 66998](https://stardance.hackclub.com/projects/66998) has the accurate description, working demo/source links, substantial AI declaration and an actual app screenshot as its banner. The first [devlog, 63353](https://stardance.hackclub.com/projects/66998/devlogs/63353), is now published with **52m 16s logged** and **four actual screenshots**. The success notice and feed show **1 devlog**. The header's **1 total hours** is rounded; it does not establish a full hour or the requested two hours. The exact published text and attachment list are preserved in [DEVLOG_DRAFT.md](DEVLOG_DRAFT.md).

After publication, **Ship your project! remains aria-disabled**. The visible button has no explanatory title or linked description, so no specific cause is inferred. The control was not forced or bypassed. **No Ship submission has been made.**

The live [Frictionless mission](https://stardance.hackclub.com/missions/frictionless) requires a usable project, a clear problem explanation, **minimum 3 hours spent** and **3 major QoL improvements**. Repro Relay covers clear reproduction, connected retest evidence and portable handoff. The account's mission page currently points to Hand-in Kit in review; Repro Relay is a separate software record and is not claimed as enrolled or mission-approved. The existing mission project was preserved.

Substantial Codex assistance remains disclosed. A false human-authorship acknowledgement must not be submitted. The working product and devlog are available; **Stardance shipping is not completed**. Two hours of genuine tracked work and a 500 Stardust reward have not been established. Stardance acceptance is not guaranteed.

## Recovery release: public verification

Source `9ca7b4005eafdf553ce04623480f2adc287a7296` passed [checks and Pages deployment](https://github.com/aaravkatiyar55-gif/repro-relay/actions/runs/36718385732). The public page loaded `index-fld9JdE2.js`. A separately imported unfinished review retained its Blocked result and exact note after offline reload. All three Broken v1 bugs reproduced and their Fixed v2 checks passed. Actual viewport/page/main widths were 360px; no horizontal overflow was observed. Network and viewport overrides were reset. The fresh screenshots and practical test limits are in [QA.md](QA.md).
