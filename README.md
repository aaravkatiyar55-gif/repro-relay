# Repro Relay

A bug handoff that keeps the failure, fix and retest together. The first implementation is in progress.

The aim is small: give someone enough context to try a bug, record what happened, and check the same steps again after a fix. Results are manual observations, not independent verification.

## Development

Node.js 24 or newer:

```sh
npm ci --ignore-scripts
npm run dev
npm run verify
```

Source is being written with substantial Codex assistance, including implementation, tests and documentation. This is not a human-only authorship claim. Tracker time, Stardance eligibility, approval and rewards are separate and are not guaranteed.
