# Nutrition v1: local calendar records

Release: `20261006-nutrition-local-1`, prepared for the existing GitHub Pages site.
The `local` label describes device-local storage, not a localhost-only release.
No cloud account or sync exists. No actual user ROOT, Program or diet was imported
during release testing. Existing data is not automatically migrated on load.

## Scope

- Nutrition tab: day, dated cycle plans, rolling seven-day review.
- Regular and travel plans. Same-priority date overlaps are rejected; a travel
  plan overrides a regular plan inside its inclusive date range.
- Breakfast, lunch, dinner and optional snack. Each meal can be confirmed,
  estimated, explicitly not eaten, or left unrecorded.
- Per-day manual plan choice before recording; recorded days cannot be silently
  replaced by a different template. Individual meals remain editable.
- Food name, quantity, unit, notes, supplied kcal/protein/carbs/fat values. Oil,
  sauces and drinks are ordinary independent entries. No food database, automatic
  restaurant lookup, photo analysis or automatic alcohol-ABV conversion in v1.
- Body weight, optional waist, steps, Zone 2 minutes, sleep duration, day note.
- Same-date archived training is read-only, queried across the active profile's
  Programs. Nutrition does not mark workouts completed or set actualDate.
- Review export is a nutrition-only JSON for analysis. Restore uses the existing
  full training backup, which includes nutrition. No second partial-restore path.

No calories, food portions, weight-loss targets or training plans are prescribed.
The optional protein target is entered by the user. No automatic intake adjustment.

## Data and ownership

`root.profiles[profileId].nutrition` is optional:

```js
{
  version: 1,
  cycles: [],
  days: { /* YYYY-MM-DD: frozen plan and actual meal snapshots */ },
  metrics: { /* YYYY-MM-DD: weight, waist, steps, zone2, sleepHours, note */ }
}
```

Training Schema remains 6, ROOT key remains `training-tracker-state`, Planner
protocol remains frozen. Nutrition is shared across Programs of the same profile,
not placed in any Program or workoutLogs. Other profiles have independent data.
Browsing a date or review does not allocate or save a record. Nothing migrates or
writes on startup. Dates are local calendar dates, independent of workout order.

Foods have their own IDs, not Exercise/Set IDs. A food uses grams, millilitres,
servings or pieces. Nutritional basis is per 100 g/mL or per one serving/piece.
Changing units in an editor clears nutrient values to prevent an implicit,
incorrect conversion. No density or serving-size conversion is guessed.

## Confirmation and uncertainty

- A preview is planned data, not consumed data. Saving the first meal freezes
  that day's entire planned snapshot; remaining meals are still pending.
- Confirming the whole day fills only pending meals with planned food entries;
  it does not overwrite previously recorded deviations or assume empty meals
  were skipped. Explicitly mark an empty meal as not eaten when appropriate.
- Estimated text-only meals, missing quantities and unknown nutrient values
  produce unknown totals, never fictitious zeros. Explicit numeric 0 is valid.
- A partial day's sum is labelled recorded, not a complete daily total.
- Weekly intake averages include only fully confirmed/estimated days with all
  required nutrient values known. Measured weights and steps use their observed
  count as denominator; every metric exposes coverage. Estimated days are labelled.
- Template changes or deletion do not rewrite stored days. Versions increment on
  edits; snapshots retain names, portions, nutrient values and notes as recorded.

## Persistence and recovery

The view clones the current root after pending writes finish, changes only the
active profile's nutrition, then awaits `saveRootCandidate`. No training form
capture, date reconciliation, ID regeneration or workout completion is invoked.
Failed transactions leave committed data unchanged; the editor stays available
after recovery. Inputs require the labelled Save action; unsaved edits are marked
and browser departure requests a warning (not a guarantee after OS termination).

The storage codec partitions cycles, daily nutrition and metrics into separate
documents. Its existing descriptor format needs no layout/schema migration.
Existing IndexedDB activation remains explicit; old localStorage is retained.
Until activation, the same data works with the original localStorage backend and
its existing quota limits. The module does not automatically switch storage.

Full backup contains nutrition. Restoring an old training-only backup preserves
current nutrition for matching profiles. If the backup omits a profile containing
nutrition, restore stops instead of silently dropping it. A nutrition-aware backup
restores its own snapshot after the normal explicit confirmation. PRE_V6 restore
uses the same nutrition-preservation guard.

## Verification

`tests/nutrition-model.test.mjs`: 22 tests.
`tests/nutrition-ui.test.mjs`: 10 isolated WebKit app tests.
Full repository regression: 437 passed / 0 failed / 1 pre-existing optional skip.

Coverage: read-only navigation, lazy days, partial/missing/estimated data, plan
priority and overlaps, template snapshots, weekly denominators, dates, explicit
units, invalid data, old/full backups, byte-equivalent training payload, quota
rollback, reload, no legacy ROOT writes after activation, mobile controls >=44px
and >=15px font, 390px/1280px no horizontal overflow, zero page script errors.
Cross-Program nutrition independence and actual downloaded review JSON are tested.

Screenshots use isolated synthetic data and do not populate the user's app.
Physical iPhone acceptance and production deployment remain separate steps.
