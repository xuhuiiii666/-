# Storage v2: local integration and migration verification

Release: `20261006-nutrition-local-1`, integrated with nutrition for the existing
GitHub Pages site. Activation remains explicit; deployment does not copy, migrate,
delete or replace user data. Cloud synchronization is not enabled.

Production baseline: `f31101078462b3eb7bd02be4a8112498cb307dc4`.
Application schema remains **6**. The existing `training-tracker-state` key is
unchanged. Until the user explicitly activates the new backend, the application
continues to save through its original localStorage path. The separate laboratory
still neither reads nor writes localStorage.

## Run

Run `node storage-v2/serve.mjs` and open
`http://127.0.0.1:4191/storage-v2/lab.html`. Set `STORAGE_LAB_PORT` if that port
is occupied. The server listens on loopback only and serves only this laboratory.
For the integrated app, run `STORAGE_LAB_PORT=4192 node storage-v2/serve.mjs --app`
and open `http://127.0.0.1:4192/`.
Use the anonymous fixture, or explicitly select an exported v6 ROOT/total backup.
No uploaded file leaves the browser. No real-user file is committed to this repo.

The laboratory offers:

1. Read-only source validation and count/fingerprint report.
2. Explicit copying into `training-tracker-storage-v2-lab` (IndexedDB).
3. Whole-content reconstruction comparison before committing the copy.
4. Refresh/reopen verification, standard total-backup export, byte-exact original export.

The laboratory has no application activation, automatic migration, localStorage
cleanup, reset button, cloud upload, or automatic fallback on an unreadable copy.
A different source cannot overwrite an existing verification copy. Identical
retries are idempotent. Choose a different database name through the development
API for separate automated fixtures; the UI never deletes a previous copy.

## Storage and commit contract

Dexie 4.4.6 is pinned, locally bundled, Apache-2.0. The codec splits root/profile/
program fields and individual workouts/logs into documents. Nested exercise/set
entities retain their original data, order and identities. Internal document keys
are storage paths, not replacement Workout/Exercise/Set identities.

An independent layout version describes this partitioning. It does not upgrade
the application's schema. Unknown JSON fields are preserved. No normalization,
date reconciliation, historical ownership change or ID generation occurs.

`stageSource(raw)`:

- Validates v6 and active references without executing app initialization.
- Keeps original source bytes once, including whitespace and backup envelope.
- Writes records, verifies reconstruction, stores original and manifest in one
  IndexedDB transaction. The promise resolves only after transaction commit.
- Any failure aborts all writes; the old localStorage source is never touched.

`read()` returns `{root, revision, fingerprint}` after SHA-256 verification.

`commit(root, expectedRevision)`:

- Requires the caller's previously read revision.
- Verifies the stored copy; a missing/corrupt record is an error, not an empty plan.
- Updates only changed documents and manifest in one transaction.
- Rejects stale concurrent writers with `REVISION_CONFLICT`.
- Returns after durable transaction completion. Callers MUST await it before
  switching Program, completing a workout, showing saved, or creating a backup.
- A no-op does not increment revision.

`exportBackup()` emits the existing `{app, version:6, exportedAt, state}` format.
The original snapshot remains unchanged after later commits.

The initial original snapshot is deliberate rollback evidence. It is not a
second live database. This phase does not reclaim any existing localStorage space.

## Application activation

`index.html` loads `bootstrap.mjs`, which resolves the active storage backend
before loading `app.js`. Existing users are not migrated on startup. In Settings,
the user explicitly chooses **备份并切换到本机数据库**:

1. Request a byte-exact download of the old ROOT (browser delivery still needs
   user verification). Keep the original localStorage value untouched.
2. Copy the source into `training-tracker-data`, compare reconstructed content,
   and atomically store the activation marker and original snapshot.
3. Verify that the original source did not change while copying.
4. Use IndexedDB for subsequent saves and future page loads.

Inputs use a serialized autosave queue with visible pending/error feedback.
Import, Program switch, Finish, and backup success wait for transaction commit.
Finish failures before commit roll runtime back; failures after commit do not
claim that training was lost. Conflicting tabs or a changed legacy ROOT block
saving, preserving both copies for export rather than using last-writer-wins.

Startup never silently falls back after an activated database fails integrity
checks. Recovery actions allow export of the committed database, unsaved runtime,
and original localStorage ROOT. Temporary save failures can be retried. Closing
with pending writes attempts a browser warning, but this cannot guarantee recovery
after OS termination; wait for the saved status before leaving the page.

The old ROOT is a frozen pre-switch snapshot, not a current backup. Do not deploy
an old localStorage-only app or switch back blindly after adding new records.
First export the current database and reconcile it explicitly. No cleanup or
automatic rollback is included. A01/A02/A03/A04/A05/A06 and T01/T02 tests remain.

Browser storage is origin-specific: the localhost preview does not access the
iPhone's GitHub Pages data. Real-iPhone activation/abrupt-close acceptance remains
to be performed by the user after separately approving a production release.

IndexedDB still belongs to the browser and can be removed by browser/site-data
cleanup. It is not cloud backup or cross-device sync. See `CLOUD_HANDOFF.md` for
the prepared cloud integration boundary and account setup.
