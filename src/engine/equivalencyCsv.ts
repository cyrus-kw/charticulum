// Read a transfer / AP equivalency table from CSV, the format schools
// usually keep these in. Expected header (any order, any letter case):
//
//   institution,externalId,objectId
//   AP,CALC-AB,MATH101
//   "Valley Community College",HIST-10,HIST110
//
// For score cut-offs, put the score in the id, e.g. CALC-AB-4.

export interface EquivalencyRow {
  institution: string;
  externalId: string;
  objectId: string;
}

export type CsvResult = { ok: true; rows: EquivalencyRow[] } | { ok: false; errors: string[] };

const COLUMNS = ["institution", "externalId", "objectId"] as const;

// Split CSV text into rows of fields. Handles quoted fields, commas and
// line breaks inside quotes, and "" as an escaped quote.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Skip blank lines.
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function parseEquivalencyCsv(text: string): CsvResult {
  // Spreadsheet apps sometimes start the file with an invisible marker (BOM).
  const [header, ...body] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) return { ok: false, errors: ["The file is empty."] };

  const names = header.map((h) => h.trim().toLowerCase());
  const position = Object.fromEntries(COLUMNS.map((c) => [c, names.indexOf(c.toLowerCase())]));
  const missing = COLUMNS.filter((c) => position[c] === -1);
  if (missing.length > 0) {
    return { ok: false, errors: [`Missing column(s): ${missing.join(", ")}. The header must be: ${COLUMNS.join(",")}`] };
  }

  const errors: string[] = [];
  const rows: EquivalencyRow[] = [];
  body.forEach((fields, i) => {
    const line = i + 2; // +1 for the header, +1 because lines count from 1
    const [institution, externalId, objectId] = COLUMNS.map((c) => (fields[position[c]] ?? "").trim());
    if (!institution || !externalId || !objectId) {
      errors.push(`Line ${line}: every row needs an institution, externalId, and objectId.`);
      return;
    }
    rows.push({ institution, externalId, objectId });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}

// Add rows to an existing table, skipping exact duplicates.
export function mergeEquivalencyRows(existing: EquivalencyRow[], added: EquivalencyRow[]): EquivalencyRow[] {
  const key = (r: EquivalencyRow) => `${r.institution}|${r.externalId}|${r.objectId}`;
  const seen = new Set(existing.map(key));
  const merged = [...existing];
  for (const row of added) {
    if (seen.has(key(row))) continue;
    seen.add(key(row));
    merged.push(row);
  }
  return merged;
}
