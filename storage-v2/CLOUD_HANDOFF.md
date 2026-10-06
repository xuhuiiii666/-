# Cloud connection preparation

The user has no Supabase account yet. No cloud project, database, authentication,
keys, uploads or remote synchronization have been created or simulated.

## Target

- Existing GitHub Pages URL serves application code.
- User-owned Supabase PostgreSQL stores account-owned records.
- IndexedDB stores local working data and offline pending changes.
- Independent versioned JSON backup remains available.

## Information needed at connection time

Create a Supabase project under the user's account and choose a region appropriate
to their actual network. Enable an agreed sign-in method, initially email login.
Provide the project URL and publishable/anon key. These are public connection
parameters, not administrator credentials. Never put a database password,
service-role key, secret key or long-lived user token into the repository.

Email redirect allowlist must include the existing Pages origin/path and a
specific local test URL. Authentication configuration is verified in the real
project before enabling uploads. Project creation, paid resources and user-data
upload are separate explicit actions.

## Planned database boundary (not deployed SQL)

| Record | Identity | Contents |
| --- | --- | --- |
| Account workspace | authenticated user + workspace ID | revision, current manifest, verification hash |
| Training document | workspace + codec document key | unchanged JSON content, revision |
| Pending operation (local only) | workspace + operation UUID | base revision, changed documents, retries |

Every cloud row must be owned by the signed-in user. Enable row-level security.
Both SELECT and writes must enforce `auth.uid()` ownership; anonymous users must
not read records. User A must not read or write User B's workspace even with a
guessed document key. Do not treat the frontend's filters as access control.

Cloud commit must be one transaction with optimistic revision checking, not a
sequence of unrelated `.upsert()` calls:

1. Read/authenticate owner and lock workspace revision.
2. Check operation UUID for idempotent retry.
3. Reject stale base revision as a conflict; never silently replace newer logs.
4. Apply document changes and manifest together.
5. Advance revision and acknowledge the same operation UUID.

Initial upload requires user selection of the local account/workspace. Existing
cloud content must be downloaded and compared, not automatically replaced.

## Required sync behavior

Local data commit and outbox operation must be atomic in IndexedDB. Until a server
acknowledgement arrives, the UI says pending sync, not cloud backed up. Network
failure preserves local data and retries the SAME operation ID. Successful retry
cannot duplicate a workout log. Conflicting devices preserve both versions and
ask the user to resolve; no automatic Program/log merge.

Signing out clears the active authenticated UI and stops upload. It must not
delete the user's only unsynced copy. Account switching must not expose or upload
one user's local data into another account. Tokens are handled by the official
Supabase auth client, not included in exported training backup JSON.

These sync/auth behaviors are requirements for the next phase, not features of
the current local integration. Cloud quotas and availability must be checked in
the chosen project; storage is not unlimited.

## Acceptance before real-data upload

- Two separate test accounts prove SELECT/INSERT/UPDATE/DELETE isolation.
- Offline edit, reload, reconnect: no lost or duplicate logs.
- Server commits but acknowledgement is lost: retry is idempotent.
- Two devices editing from one revision: conflict is explicit.
- Invalid/expired token or logout: no cross-account upload.
- Cloud quota/network error: locally saved records remain readable/exportable.
- Fresh device restores plans, logs, weights, dates, notes, drafts and IDs exactly.

## Following phase: nutrition

Keep nutrition outside training `workoutLogs`. A dated nutrition cycle references
meal templates; actual daily logs are created/confirmed by calendar date, not by
workout sequence. Do not generate months of duplicate daily actual records.

Untouched defaults are planned/pending, not confirmed intake. Support measured,
estimated and unrecorded values; unrecorded is not zero. Travel can use portions
and notes. Preserve food/nutrition/template snapshots in completed day records so
later template edits do not rewrite earlier weeks. Future template versions have
an explicit effective date. Join training by actualDate for review.

No meal quantities, calorie goals or training plans are prescribed by this storage
implementation. Nutrition UI and data contracts follow after storage activation
is verified.

References:

- https://dexie.org/docs/Dexie/Dexie.transaction()
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
