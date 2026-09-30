# Caught → reproduced → fixed → checked again

The starting problem was a short piece of feedback: “it doesn't work.” That is not enough to know which build somebody tried, what they clicked or what should have happened. The missing part after a fix is often another observation of the same steps. Repro Relay is built around keeping those two observations together.

This is a new implementation of a familiar problem. Bug-reporting products already exist. The specific workflow here is a local case, a frozen failure run, a linked fix note and a retest that keeps changes to its criteria visible. It is not a claim to the first bug-reporting invention.

## Decisions made during this build

- **Stable step IDs rather than array positions.** A reordered case still matches the original steps. A removed step does not vanish from the comparison.
- **Copy the specification into every completed run.** Editing the expected result later must not edit yesterday's failed test. Changed actions, expected results or starting conditions get a “Criteria changed” label. Run history and HTML reports also use the captured build links, so changing today's demo URL does not replace the earlier one.
- **Keep outcomes honest.** Pass, fail, blocked and not tested are separate. A blocked or skipped retest cannot resolve an earlier failure. These are manual observations, not independent certification.
- **Burn redaction into pixels.** A covering rectangle in an HTML overlay could reveal the underlying image. Here the processed PNG contains opaque replacement pixels. The original source remains only in the unsaved editor until it is committed or cancelled.
- **Import as a separate case.** A JSON backup must pass schema, image dimension, SHA-256 and browser decoding checks before one atomic save. It never overwrites an existing case by default.
- **Make the handoff useful away from the app.** JSON keeps editable data; a standalone HTML report embeds processed images and has no scripts. A sandboxed preview lets somebody inspect the report before downloading.
- **Stay small.** No account, server, API key, analytics, remote font or runtime dependency. TypeScript, IndexedDB and Canvas are enough for this version.

## Bugs caught while making the tool

1. Native Node TypeScript tests rejected a constructor parameter property. The store now uses explicit fields, and `erasableSyntaxOnly` catches this during type checking.
2. The first interface compile found a mismatched parenthesis in the run action section. That section was split into smaller statements before browser testing.
3. The skip link initially used a class that did not match the CSS. Its hash also collided with application routing. The corrected link focuses the main workspace without changing the case route; it was checked with Enter.
4. A mobile success toast squeezed “Dismiss” into a narrow column. The button now keeps its width.
5. Starting another retest could replace an unfinished run. The app now returns to that existing draft and explains that it needs to be completed or discarded first.
6. Fresh production inspection caught horizontal overflow on the home page: a general input rule overrode the hidden import input's width. A more specific rule now keeps that input inside its control, and it is excluded from the tab order. Desktop and 360px home pages are checked after the fix.
7. A report could embed the same screenshot repeatedly when several runs referenced it. The report now embeds each processed image once in its evidence index and links observations to that image. A regression check uses nine references across three runs and expects one embedded image.
8. Fragment links in the sandboxed `srcdoc` preview initially resolved against the outer app. The preview now uses `about:srcdoc#...` links, as described in [MDN's iframe documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#embedding_source_code_in_an_iframe). Downloaded reports retain ordinary local fragment links. The report still has no scripts.

## The fictional demonstration

The Little Orbit Club board runs three deliberate bugs. Broken v1 allows duplicate Alex registrations, misses a query with surrounding spaces and checks Mina when Sam is the only visible filtered row. Fixed v2 checks repeated names, trims search input and uses stable row IDs.

Both implementations actually run. Demo results start as “Not tested”; the app does not automatically label its own fixes as passing. In the browser QA session on 30 September 2026, all three failures were reproduced and the matching fixed checks passed. A later clearly labelled QA-only run changed one criterion and left checks blocked/untested to test the comparison guard. It was not presented as a new board release or another verified fix.

## Assistance and provenance

The product concept and scope were discussed with Aarav. Codex implemented most of the application, tests, build setup and documentation, and operated the browser checks. This is substantial AI assistance. Commit messages and the README disclose that assistance. Screenshots are actual app captures; the demo uses fictional names and data. No other project was copied to manufacture a new submission.

Wall-clock duration, an open editor and accepted Hackatime time are different things. `.wakatime-project` sets the intended label to `repro-relay`; it does not generate time. No synthetic heartbeats, filler edits, idle waiting or transferred hours are used. Stardance eligibility and rewards need their own verified evidence.
