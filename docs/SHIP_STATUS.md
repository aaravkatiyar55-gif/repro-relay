# Ship status

Updated 30 September 2026. This record separates the working product from tracker eligibility and Stardance approval.

## Product

- Local production build, strict TypeScript, 14 core tests and offline build checks pass.
- The three deliberate failures and corresponding fixes were checked in the browser.
- Snapshot comparison, private evidence processing, valid/invalid imports, keyboard flow and offline preview checks are recorded in [QA.md](QA.md).
- Source, setup instructions, assistance disclosure, original banner and actual app screenshots are included.
- [Public source](https://github.com/aaravkatiyar55-gif/repro-relay) and [live app](https://aaravkatiyar55-gif.github.io/repro-relay/) are available. The initial [Pages verification and deployment](https://github.com/aaravkatiyar55-gif/repro-relay/actions/runs/36704846474) succeeded.
- On the fresh public origin, all three broken failures reproduced and all three corresponding fixed behaviors passed. The deployed shell reloaded offline, networking was restored, and no warning/error console entries were observed in that session.
- A final home-page overflow fix and captured-link display are locally verified; final deployment verification is recorded below after the updated build goes live.

## Tracker and submission

The intended label is `repro-relay`. Opening VS Code and setting `.wakatime-project` do not prove eligible time. On 30 September, the live Stardance Hackatime picker did not list `repro-relay`. Other project labels were not linked or reassigned. No eligible Repro Relay hours are verified. No synthetic heartbeats, filler edits or hours from another project are used.

[Stardance project 66998](https://stardance.hackclub.com/projects/66998) has the accurate description, working demo/source links, substantial AI declaration and an actual app screenshot as its banner. It shows **0 devlogs / 0 total hours** and disabled devlog/ship controls. Its onboarding explicitly requires a linked tracker project and at least 15 minutes before the first devlog. The official [tracker guide](https://stardance.hackclub.com/resources/hackatime) says zero-time projects are hidden, and time must be captured through devlogs. A factual [devlog draft](DEVLOG_DRAFT.md) and screenshots are ready; nothing was posted by bypassing that gate.

The live [Frictionless mission](https://stardance.hackclub.com/missions/frictionless) requires a usable project, a clear problem explanation, **minimum 3 hours spent** and **3 major QoL improvements**. Repro Relay covers clear reproduction, connected retest evidence and portable handoff. The account's mission page currently points to Hand-in Kit in review; Repro Relay is a separate software record and is not claimed as enrolled or mission-approved. The existing mission project was preserved.

Substantial Codex assistance remains disclosed. A false human-authorship acknowledgement must not be submitted. The working product is available; **Stardance shipping remains blocked by unverified eligible tracker time**, rather than being reported as completed. Stardance acceptance and a 500 Stardust target are not guaranteed.
