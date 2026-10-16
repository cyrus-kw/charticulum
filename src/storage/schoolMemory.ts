// Remember the last school file this browser imported, so it's still there
// after a reload (and plans saved for it can be reopened). This is a
// per-browser convenience: if storage is unavailable, the app just starts
// with the sample school.
import { parseSchoolData, type SchoolData } from "../engine/index";
import { defaultStorage } from "./stores";

const KEY = "charticulum.school.v1";

export function rememberSchool(data: SchoolData, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the import still works for this visit.
  }
}

export function recallSchool(storage: Storage | null = defaultStorage()): SchoolData | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    // Checked again, in case the format changed since it was saved.
    const result = parseSchoolData(JSON.parse(raw));
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

export function forgetSchool(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
