# First working-set weight reference

Release: `20261007-working-set-reference-1`. No data migration.

- Only the first displayed set is eligible, and it must be an ordinary working
  set of a canonical exercise. Warmups, compound stages, technique/top/backoff
  sets and skill-retention exercises are not prefilled.
- Look across the active profile's Programs, choosing the latest eligible logged
  session, then its last valid ordinary working set. Preserve the recorded unit
  and weight, not the maximum weight, an RM recommendation or a drop-set segment.
- Match normalized width, case, spacing and brackets, ignoring only the exact
  `【本块增量】` / `{本块增量}` annotation. Unknown variants remain separate.
  Existing history display may fall back across the explicit purpose labels
  high tension/hypertrophy/day-volume; automatic prefilling does not use that
  broader fallback. No canonical names, IDs or templates are merged or deleted.
- Older untyped logs require a unique matching workout identity, title, source
  key when present, exercise name, unchanged prescription text and set number.
  Generic template text is insufficient. Unproven records remain visible in
  history but are not automatic references. Ambiguous assisted loads are excluded.
- A prefill is DOM-only reference data, labelled with date and source set. It
  neither creates an execution date nor becomes a draft/log weight on an ordinary
  save or export. The estimate is labelled provisional, not today's measured RM.
- Editing weight/unit/reps/RIR or completing the set accepts the displayed weight
  as current execution input. Existing actual inputs and drafts win. Explicitly
  clearing a value stays blank. Renaming clears any pending old-name reference.
- Newly captured main-set log entries retain optional exerciseId, setId, setType,
  section and trainingRole evidence. Old logs are not rewritten. Schema remains 6;
  ROOT and the storage backend are unchanged.

Regression: `tests/working-set-reference.test.mjs` covers selection and read-only
identity matching; `tests/working-set-reference-ui.test.mjs` uses isolated mobile
WebKit for prefilling, confirmation, saves, reload, completion, backup, rename,
and independent superset members. No real user data is part of either fixture.
