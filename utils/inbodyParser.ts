// Pure parsing/dedup/merge logic for InBody data — deliberately has no expo imports,
// so it can be run and validated under plain Node (see scripts/validate-inbody-parser.ts)
// without pulling in React Native's file system bindings. utils/inbodyStorage.ts wraps
// this with the actual on-device file read/write.

export interface InBodySnapshot {
  scan_date: string; // ISO 8601
  source_timestamp: string; // raw YYYYMMDDHHMMSS (or synthesized for JSON input), dedup key within a source
  source: 'csv' | 'json';
  weight_kg: number | null;
  skeletal_muscle_mass_kg: number | null;
  soft_lean_mass_kg: number | null;
  body_fat_mass_kg: number | null;
  bmi: number | null;
  percent_body_fat: number | null;
  basal_metabolic_rate: number | null;
  inbody_score: number | null;
  waist_hip_ratio: number | null;
  visceral_fat_level: number | null;
  notes: string | null; // JSON-sourced narrative context (body type + posture), null for CSV-sourced entries
}

// A single upload parsing into more rows than this is almost certainly a
// corrupted file or the wrong file entirely, not a real export.
const MAX_PLAUSIBLE_ROWS_PER_UPLOAD = 500;

const toNumberOrNull = (val: string | undefined | null): number | null => {
  if (val === undefined || val === null) return null;
  const trimmed = val.trim();
  if (trimmed === '' || trimmed === '-') return null;
  // Assumes '.' as the decimal separator (confirmed fine for real exports on this
  // device/locale). A comma-decimal value (e.g. "22,5") would silently parse to
  // "225" here rather than error — not defended against, since it's a non-issue
  // for a single-user app on one locale.
  const num = parseFloat(trimmed.replace(/[^\d.-]/g, ''));
  return Number.isNaN(num) ? null : num;
};

const rawTimestampToISO = (raw: string): string => {
  const year = raw.slice(0, 4);
  const month = raw.slice(4, 6);
  const day = raw.slice(6, 8);
  const hour = raw.slice(8, 10) || '00';
  const minute = raw.slice(10, 12) || '00';
  const second = raw.slice(12, 14) || '00';
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
};

// Column positions confirmed against a real H30-device export (test-fixtures/InBody-20260903.csv).
// Used only as a label to look up columns by header name at parse time — see parseInBodyCSV.
const CSV_COLUMN_NAMES = {
  date: 'Date',
  weight: 'Weight(kg)',
  smm: 'Skeletal Muscle Mass(kg)',
  softLeanMass: 'Soft Lean Mass(kg)',
  bodyFatMass: 'Body Fat Mass(kg)',
  bmi: 'BMI(kg/m²)',
  percentBodyFat: 'Percent Body Fat(%)',
  bmr: 'Basal Metabolic Rate(kcal)',
  inbodyScore: 'InBody Score',
  waistHipRatio: 'Waist Hip Ratio',
  visceralFatLevel: 'Visceral Fat Level(Level)',
};

// Fields without which a row can't be trusted at all — missing by name means the
// export format has changed enough that positions have likely shifted too, so we
// refuse to guess rather than silently misassign values.
const CRITICAL_CSV_FIELDS: Array<keyof typeof CSV_COLUMN_NAMES> = ['date', 'weight'];

export const parseInBodyCSV = (csvText: string): InBodySnapshot[] => {
  const cleaned = csvText.replace(/^\uFEFF/, ''); // strip BOM
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerCols = lines[0].split(',').map((h) => h.trim());
  const indexOf = (name: string) => headerCols.indexOf(name);

  const columnIndex: Partial<Record<keyof typeof CSV_COLUMN_NAMES, number>> = {};
  for (const key of Object.keys(CSV_COLUMN_NAMES) as Array<keyof typeof CSV_COLUMN_NAMES>) {
    const idx = indexOf(CSV_COLUMN_NAMES[key]);
    if (idx === -1) {
      if (CRITICAL_CSV_FIELDS.includes(key)) {
        throw new Error(
          `InBody CSV is missing required column "${CSV_COLUMN_NAMES[key]}" — export format may have changed, refusing to parse.`
        );
      }
      console.warn(`InBody CSV is missing column "${CSV_COLUMN_NAMES[key]}" — that field will be null for all rows.`);
    } else {
      columnIndex[key] = idx;
    }
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > MAX_PLAUSIBLE_ROWS_PER_UPLOAD) {
    throw new Error(
      `InBody CSV parsed into ${dataLines.length} rows, which is implausibly large for a single export — refusing to import.`
    );
  }

  const col = (cols: string[], key: keyof typeof CSV_COLUMN_NAMES) => {
    const idx = columnIndex[key];
    return idx === undefined ? undefined : cols[idx];
  };

  return dataLines
    .map((line) => {
      const cols = line.split(',');
      const rawTimestamp = col(cols, 'date')?.trim() ?? '';
      return {
        scan_date: rawTimestampToISO(rawTimestamp),
        source_timestamp: rawTimestamp,
        source: 'csv' as const,
        weight_kg: toNumberOrNull(col(cols, 'weight')),
        skeletal_muscle_mass_kg: toNumberOrNull(col(cols, 'smm')),
        soft_lean_mass_kg: toNumberOrNull(col(cols, 'softLeanMass')),
        body_fat_mass_kg: toNumberOrNull(col(cols, 'bodyFatMass')),
        bmi: toNumberOrNull(col(cols, 'bmi')),
        percent_body_fat: toNumberOrNull(col(cols, 'percentBodyFat')),
        basal_metabolic_rate: toNumberOrNull(col(cols, 'bmr')),
        inbody_score: toNumberOrNull(col(cols, 'inbodyScore')),
        waist_hip_ratio: toNumberOrNull(col(cols, 'waistHipRatio')),
        visceral_fat_level: toNumberOrNull(col(cols, 'visceralFatLevel')),
        notes: null,
      };
    })
    .filter((snap) => snap.source_timestamp.length === 14);
};

// Fallback: curated/hand-maintained JSON format, e.g.
// { stats: [{ "date taken": "2026-04-23", "weight": "66.4 kg", ... }] }
// This is NOT a second validated device export format — it's a hand-reconstructed
// companion file (see test-fixtures/InBody-curated-sample.json) that may include a
// trailing blank placeholder row; that's expected and filtered out below, not a bug.
export const parseInBodyJSON = (jsonText: string): InBodySnapshot[] => {
  const parsed = JSON.parse(jsonText);
  const stats = Array.isArray(parsed?.stats) ? parsed.stats : [];
  return stats
    .map((entry: any): InBodySnapshot => {
      const dateTaken: string = entry['date taken'] || '';
      const sourceTimestamp = dateTaken ? dateTaken.replace(/-/g, '') + '120000' : '';
      const bodyType: string = entry['body type'] || '';
      const posture: string = entry['posture'] || '';
      const notesParts = [
        bodyType ? `Body type: ${bodyType}.` : '',
        posture ? `Posture: ${posture}.` : '',
      ].filter(Boolean);
      return {
        scan_date: dateTaken ? `${dateTaken}T12:00:00Z` : '',
        source_timestamp: sourceTimestamp,
        source: 'json',
        weight_kg: toNumberOrNull(entry.weight),
        skeletal_muscle_mass_kg: toNumberOrNull(entry['skeletal muscle mass']),
        soft_lean_mass_kg: toNumberOrNull(entry['soft lean mass']),
        body_fat_mass_kg: toNumberOrNull(entry['body fat mass']),
        bmi: toNumberOrNull(entry.bmi),
        percent_body_fat: toNumberOrNull(entry['percent body fat']),
        basal_metabolic_rate: toNumberOrNull(entry['basal metabolic rate']),
        inbody_score: toNumberOrNull(entry['inbody score']),
        waist_hip_ratio: toNumberOrNull(entry['waist hip ratio']),
        visceral_fat_level: toNumberOrNull(entry['visceral fat level']),
        notes: notesParts.length > 0 ? notesParts.join(' ') : null,
      };
    })
    .filter((snap: InBodySnapshot) => snap.source_timestamp.length > 0);
};

// Collapse exact-timestamp duplicates within one source, then same-day duplicates
// within that same source — keeping the latest time-of-day. Default assumption: a
// same-day retake means the earlier reading looked wrong. Adjustable, not a hard fact.
const dedupeWithinSource = (snapshots: InBodySnapshot[]): InBodySnapshot[] => {
  const byTimestamp = new Map<string, InBodySnapshot>();
  for (const snap of snapshots) byTimestamp.set(snap.source_timestamp, snap);

  const byDate = new Map<string, InBodySnapshot>();
  for (const snap of byTimestamp.values()) {
    const dateKey = snap.source_timestamp.slice(0, 8);
    const existing = byDate.get(dateKey);
    if (!existing || snap.source_timestamp > existing.source_timestamp) {
      byDate.set(dateKey, snap);
    }
  }
  return Array.from(byDate.values());
};

// Full pipeline: dedupe CSV and JSON snapshots independently (they use different
// timestamp schemes — JSON synthesizes a noon timestamp with no real time-of-day),
// then merge by calendar date. CSV is device-sourced and authoritative for numeric
// fields; where both sources cover the same date, the JSON entry's narrative notes
// are carried forward rather than discarded.
export const dedupeSnapshots = (snapshots: InBodySnapshot[]): InBodySnapshot[] => {
  const csvSnapshots = dedupeWithinSource(snapshots.filter((s) => s.source === 'csv'));
  const jsonSnapshots = dedupeWithinSource(snapshots.filter((s) => s.source === 'json'));

  const dateKeyOf = (snap: InBodySnapshot) => snap.source_timestamp.slice(0, 8);
  const jsonByDate = new Map<string, InBodySnapshot>();
  for (const snap of jsonSnapshots) jsonByDate.set(dateKeyOf(snap), snap);

  const merged: InBodySnapshot[] = [];
  const coveredDates = new Set<string>();

  for (const csvSnap of csvSnapshots) {
    const dateKey = dateKeyOf(csvSnap);
    coveredDates.add(dateKey);
    const jsonMatch = jsonByDate.get(dateKey);
    merged.push(jsonMatch ? { ...csvSnap, notes: jsonMatch.notes } : csvSnap);
  }

  for (const jsonSnap of jsonSnapshots) {
    const dateKey = dateKeyOf(jsonSnap);
    if (!coveredDates.has(dateKey)) merged.push(jsonSnap);
  }

  return merged.sort((a, b) => a.scan_date.localeCompare(b.scan_date));
};
