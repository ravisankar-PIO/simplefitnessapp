// Standalone validation for utils/inbodyStorage.ts's parsing/dedup/merge logic,
// run against real fixture data. Not a full test suite (this repo has none) — kept
// as a committed script so it's here to re-run if the InBody export format ever
// changes (new device, firmware update, etc).
//
// Run with: npx ts-node scripts/validate-inbody-parser.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  parseInBodyCSV,
  parseInBodyJSON,
  dedupeSnapshots,
  computeMergeStats,
  InBodySnapshot,
} from '../utils/inbodyParser';

let failures = 0;

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
};

const fixturesDir = path.join(__dirname, '..', 'test-fixtures');
const csvText = fs.readFileSync(path.join(fixturesDir, 'InBody-20260903.csv'), 'utf-8');
const jsonText = fs.readFileSync(path.join(fixturesDir, 'InBody-curated-sample.json'), 'utf-8');

// --- Real fixtures, merged ---
const csvSnapshots = parseInBodyCSV(csvText);
const jsonSnapshots = parseInBodyJSON(jsonText);
const merged = dedupeSnapshots([...csvSnapshots, ...jsonSnapshots]);

assert(csvSnapshots.length === 13, `CSV parses to 13 raw rows (got ${csvSnapshots.length})`);
// 8 real "stats" entries + 1 trailing blank placeholder row filtered out.
assert(jsonSnapshots.length === 8, `JSON parses to 8 raw entries, blank row filtered (got ${jsonSnapshots.length})`);
assert(merged.length === 11, `Merged result has 11 unique dates (got ${merged.length})`);

// Sorted ascending
const isSorted = merged.every((s, i) => i === 0 || s.scan_date >= merged[i - 1].scan_date);
assert(isSorted, 'merged snapshots are sorted ascending by scan_date');

// No unexpected nulls where the CSV had real values, no zero-body-fat
const hasNoZeroBodyFat = merged.every((s) => s.body_fat_mass_kg !== 0);
assert(hasNoZeroBodyFat, 'no snapshot has body_fat_mass_kg === 0 (a real 0 would be nonsensical)');
const csvSourcedHaveWeight = merged
  .filter((s) => s.source === 'csv')
  .every((s) => s.weight_kg !== null);
assert(csvSourcedHaveWeight, 'every CSV-sourced snapshot has a non-null weight_kg');

// Notes only ever come from a JSON-matched date
const notesOnlyOnMergedDates = merged.every((s) => s.notes === null || s.source === 'csv' || s.source === 'json');
assert(notesOnlyOnMergedDates, 'notes field is well-formed on every snapshot');

// --- Fragile case 1: Aug 8 same-day collapse (12:05:22 kept over 12:04:32) ---
const aug8 = merged.find((s) => s.source_timestamp.startsWith('20260808'));
assert(!!aug8, 'Aug 8 2026 snapshot present after same-day collapse');
assert(aug8?.source_timestamp === '20260808120522', `Aug 8 keeps latest time-of-day 12:05:22 (got ${aug8?.source_timestamp})`);
assert(aug8?.weight_kg === 68.6, `Aug 8 kept snapshot has weight_kg 68.6 (got ${aug8?.weight_kg})`);

// --- Fragile case 2: Apr 4 same-day collapse (10:01:08 kept over 10:00:15) ---
const apr4 = merged.find((s) => s.source_timestamp.startsWith('20260404'));
assert(!!apr4, 'Apr 4 2026 snapshot present after same-day collapse');
assert(apr4?.source_timestamp === '20260404100108', `Apr 4 keeps latest time-of-day 10:01:08 (got ${apr4?.source_timestamp})`);
assert(apr4?.waist_hip_ratio === 0.9, `Apr 4 kept snapshot has waist_hip_ratio 0.90 (got ${apr4?.waist_hip_ratio})`);

// --- Fragile case 3: Apr 23 CSV/JSON merge on a shared date ---
const apr23 = merged.find((s) => s.source_timestamp.startsWith('20260423'));
assert(!!apr23, 'Apr 23 2026 snapshot present (exists in both CSV and JSON)');
assert(apr23?.source === 'csv', 'Apr 23 merged snapshot keeps CSV as its source');
assert(apr23?.weight_kg === 66.4, `Apr 23 merged snapshot has CSV's weight_kg 66.4 (got ${apr23?.weight_kg})`);
assert(apr23?.source_timestamp === '20260423192613', `Apr 23 merged snapshot keeps CSV's real timestamp (got ${apr23?.source_timestamp})`);
assert(
  apr23?.notes === 'Body type: Average, but drifting towards slim (away from sacropenic obesity). Posture: Chest development is good, shoulders are improving, belly fat is less.',
  `Apr 23 merged snapshot carries forward JSON's notes (got ${JSON.stringify(apr23?.notes)})`
);

// A date that only exists in CSV should have no notes.
const csvOnlyDate = merged.find((s) => s.source_timestamp.startsWith('20260629'));
assert(!!csvOnlyDate, 'Jun 29 2026 (CSV-only date) present');
assert(csvOnlyDate?.notes === null, 'CSV-only date has null notes');

// --- Edge case: empty file ---
assert(parseInBodyCSV('').length === 0, 'empty CSV text parses to zero snapshots');
assert(parseInBodyJSON('{"stats": []}').length === 0, 'empty JSON stats array parses to zero snapshots');

// --- Edge case: header-only file (no data rows) ---
const headerOnlyCSV = csvText.split(/\r?\n/)[0];
assert(parseInBodyCSV(headerOnlyCSV).length === 0, 'header-only CSV parses to zero snapshots');

// --- Edge case: missing critical column hard-fails ---
const csvMissingDate = csvText.replace('Date,', 'NotDate,');
let threw = false;
try {
  parseInBodyCSV(csvMissingDate);
} catch {
  threw = true;
}
assert(threw, 'CSV missing the Date column throws rather than silently mis-parsing');

// --- computeMergeStats: upload CSV into an empty store ---
// 13 raw rows, two same-day pairs (Aug 8, Apr 4) -> 11 "added" (one per distinct date)
// + 2 "same-day collapsed" (the second entry in each pair), 0 duplicates, 0 enriched.
const csvOnlyStats = computeMergeStats([], csvSnapshots);
assert(csvOnlyStats.addedCount === 11, `CSV-into-empty-store: addedCount is 11 (got ${csvOnlyStats.addedCount})`);
assert(csvOnlyStats.sameDayCollapsedCount === 2, `CSV-into-empty-store: sameDayCollapsedCount is 2 (got ${csvOnlyStats.sameDayCollapsedCount})`);
assert(csvOnlyStats.exactDuplicateCount === 0, `CSV-into-empty-store: exactDuplicateCount is 0 (got ${csvOnlyStats.exactDuplicateCount})`);
assert(csvOnlyStats.enrichedCount === 0, `CSV-into-empty-store: enrichedCount is 0 (got ${csvOnlyStats.enrichedCount})`);

// --- computeMergeStats: re-uploading the same CSV file again ---
// The stored pool only kept the WINNING timestamp from each same-day pair - the
// discarded one was never saved, so re-uploading it reports as a fresh same-day
// collision again (correctly), not as an exact duplicate of something never stored.
// 11 kept timestamps -> exact duplicates; the 2 previously-discarded timestamps ->
// same-day collapsed again.
const csvAlreadyStored = dedupeSnapshots(csvSnapshots);
const csvReuploadStats = computeMergeStats(csvAlreadyStored, csvSnapshots);
assert(
  csvReuploadStats.exactDuplicateCount === 11,
  `CSV re-upload: the 11 stored timestamps are exact duplicates (got ${csvReuploadStats.exactDuplicateCount})`
);
assert(
  csvReuploadStats.sameDayCollapsedCount === 2,
  `CSV re-upload: the 2 previously-discarded timestamps collide again as same-day (got ${csvReuploadStats.sameDayCollapsedCount})`
);
assert(
  csvReuploadStats.addedCount === 0 && csvReuploadStats.enrichedCount === 0,
  'CSV re-upload: nothing genuinely new, nothing enriched'
);

// --- computeMergeStats: uploading the JSON file after the CSV is already stored ---
// All 8 JSON dates are a subset of the 11 CSV dates already stored -> pure enrichment.
const jsonAfterCsvStats = computeMergeStats(csvAlreadyStored, jsonSnapshots);
assert(jsonAfterCsvStats.enrichedCount === 8, `JSON-after-CSV: enrichedCount is 8 (got ${jsonAfterCsvStats.enrichedCount})`);
assert(
  jsonAfterCsvStats.addedCount === 0 && jsonAfterCsvStats.sameDayCollapsedCount === 0 && jsonAfterCsvStats.exactDuplicateCount === 0,
  'JSON-after-CSV: no added/collapsed/duplicate entries, purely enrichment'
);

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
