# Local verification results

Date: 2026-10-06.

## Nutrition release gate

Build: `20261006-nutrition-local-1`.
The approved nutrition and local-storage integration are packaged together for
the existing Pages site. Final full regression: **437 passed, 0 failed, 1 skipped**
(438 total). The additional nutrition coverage is 22 model and 10 WebKit UI tests.
The separate 390px WebKit execution smoke passes: 622px compact Superset card,
zero page errors, working Main/Warmup timers and unchanged input ownership.
Tests use isolated anonymous fixtures; no real-user ROOT was read or written.
Storage activation remains user-triggered. No cloud service is connected.
The earlier results below describe the storage-only verification checkpoint.

Baseline: `f31101078462b3eb7bd02be4a8112498cb307dc4`.

## Automated results

- Storage engine tests: **21 passed, 0 failed**.
- Integrated application tests: **16 passed, 0 failed**.
- Full repository suite: **405 passed, 0 failed, 1 skipped** (406 total).
- Existing baseline: 368 passed, 0 failed, 1 skipped.
- Existing optional real-user Long-form fixture test remains skipped; no user
  file was required or opened for this work.

Command: `node --test --test-concurrency=2 --test-reporter=tap tests/*.test.mjs`.

## Verified using real WebKit IndexedDB

- v6 ROOT and total-backup inputs retain complete fields and IDs.
- Exact original input bytes survive copying and subsequent edits.
- Two Programs, logs, weights, dates, notes, drafts, templates, RM records and
  unknown optional fields reconstruct without changes.
- One draft update writes one changed document (plus manifest), not all Programs.
- Injected quota error after document writes aborts the whole transaction.
- Failure at the final manifest write during first copy leaves no partial copy.
- Concurrent saves from separate database connections reject stale revisions.
- Repeated identical migration is idempotent; different source is not overwritten.
- Close/reopen, standard backup export/reimport and existing backup-import
  compatibility pass.
- Missing manifest, missing document and tampered content fail explicitly.
- A synthetic source larger than 6 MiB persists and reads back exactly without
  any localStorage access. This is not a guarantee of unlimited iPhone quota.

## UI

Actual WebKit at 390 x 844: zero horizontal overflow, zero page script errors.
Anonymous sample selection, copy, inspection, refresh and both export buttons
were clicked. Buttons are at least 44px high. Full-page screenshot inspected.

The integrated app tests use anonymous v6 Program fixtures and actual WebKit:

- Startup and active-backend reload produce zero localStorage writes.
- Settings activation preserves exact original ROOT bytes and identifiers.
- Weight/reps/RIR edits survive refresh; custom Workout/Exercise IDs remain stable.
- Finish saves logs/weights and advances once, including duplicate-click protection.
- Quota failure rolls Finish back; post-commit render failure reports already saved.
- Two Programs retain independent drafts; failed switches do not change active state.
- Import creates a new Program without erasing old history; backup round-trip works.
- Autosave errors are visible, retry persists the draft, old-tab writes block saving.
- Preview/general timer do not persist data; main/warmup set timers still work.

Separate B1.1 WebKit execution smoke: 390px, compact Superset height **622px**,
zero script errors, no horizontal overflow. Warmup ticks 30/29/28; Main ticks
180/179/178; single-tap/single-interval and background calibration pass. Existing
template-modal obstruction remains known and was not modified.

## Boundary

Local integration changes app/storage/program-store/importer commit callers,
startup markup, storage feedback CSS and test readiness. Import parsing, timer
engine, schema and ID/history ownership semantics were not changed.
No real user ROOT accessed. No commit, push or deployment. Live GitHub Pages
remains unchanged; the new activation switch exists only in the local build.
No Supabase account/project connected. Cloud auth, RLS and synchronization are
documented requirements, not tested or activated functionality in this phase.

The local app supports async IndexedDB commits after explicit activation. Old
localStorage is retained, not enlarged by subsequent saves. No unlimited-storage
or cloud-backup claim is made. Real iPhone acceptance after an approved deployment
is still required; WebKit automation is not a physical-iPhone test.
