import type { RequiredItem } from "./types";

// Helpers for required objects and choices (RequiredItem in types.ts).
// Each takes `isDone`, which says whether the plan already has an object
// (or something that counts as it), so they work for a chart's
// placements and for Build for me's plan alike.

// The options of a required item, each a list of objects that are all
// needed: "CS101" is [["CS101"]], and { oneOf: ["MATH230", ["MATH231",
// "MATH232"]] } is [["MATH230"], ["MATH231", "MATH232"]].
export function requiredOptions(item: RequiredItem): string[][] {
  return typeof item === "string" ? [[item]] : item.oneOf.map((option) => (typeof option === "string" ? [option] : option));
}

// Every object named in the items, each once.
export function requiredIds(items: RequiredItem[]): string[] {
  return [...new Set(items.flatMap((item) => requiredOptions(item).flat()))];
}

// The option the plan is going for: the first one it has all of;
// otherwise the one it has the most of (MATH 231 placed means 231 & 232);
// otherwise the first.
export function closestOption(item: RequiredItem, isDone: (id: string) => boolean): string[] {
  const options = requiredOptions(item);
  let best = options[0];
  let bestDone = 0;
  for (const option of options) {
    const done = option.filter(isDone).length;
    if (done === option.length) return option;
    if (done > bestDone) {
      best = option;
      bestDone = done;
    }
  }
  return best;
}

// Met when the plan has every object of at least one option.
export function isRequiredMet(item: RequiredItem, isDone: (id: string) => boolean): boolean {
  return requiredOptions(item).some((option) => option.every(isDone));
}

// The objects that could still meet an unmet item: for an unmet choice,
// every option's objects the plan doesn't have yet.
export function stillNeededIds(items: RequiredItem[], isDone: (id: string) => boolean): string[] {
  const unmet = items.filter((item) => !isRequiredMet(item, isDone));
  return requiredIds(unmet).filter((id) => !isDone(id));
}

// How a choice is written: "MATH230, MATH230H, or MATH231 & MATH232".
// `name` writes each id (the app passes courseCode, for "MATH 230").
export function describeRequired(item: RequiredItem, name: (id: string) => string = (id) => id): string {
  const options = requiredOptions(item).map((option) => option.map(name).join(" & "));
  if (options.length === 1) return options[0];
  if (options.length === 2) return `${options[0]} or ${options[1]}`;
  return `${options.slice(0, -1).join(", ")}, or ${options.at(-1)}`;
}

// A text key that's the same for two equal items, so a requirement listed
// by two programs is only kept once.
export function requiredKey(item: RequiredItem): string {
  return typeof item === "string" ? item : JSON.stringify(item.oneOf);
}
