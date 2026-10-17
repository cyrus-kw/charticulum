// Rules for the top-to-bottom order of courses within a term.
//
// Courses taken together (concurrent requisites, e.g. a lecture and its
// lab) in the same term form a block: they move as one, and nothing can be
// dropped between them.
import type { Catalog } from "../engine/index";

// Does either course list the other as a concurrent requisite?
function takenTogether(catalog: Catalog, a: string, b: string): boolean {
  return (
    (catalog.get(a)?.requisites.concurrent.includes(b) ?? false) ||
    (catalog.get(b)?.requisites.concurrent.includes(a) ?? false)
  );
}

// The block `id` belongs to within a term's courses, in the term's order.
// A course with no concurrent partner there is a block of one.
export function concurrentBlock(catalog: Catalog, termIds: string[], id: string): string[] {
  const block = new Set([id]);
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const other of termIds) {
      if (!block.has(other) && takenTogether(catalog, current, other)) {
        block.add(other);
        stack.push(other);
      }
    }
  }
  return termIds.filter((other) => block.has(other));
}

// Split a term's courses into blocks, keeping their order.
export function blocksOf(catalog: Catalog, termIds: string[]): string[][] {
  const blocks: string[][] = [];
  const seen = new Set<string>();
  for (const id of termIds) {
    if (seen.has(id)) continue;
    const block = concurrentBlock(catalog, termIds, id);
    block.forEach((member) => seen.add(member));
    blocks.push(block);
  }
  return blocks;
}

// Where a dropped block should go in a term, as an index into the term's
// courses with the moving ones taken out. It goes before the first block
// whose middle is below the drop point, so it never splits a block.
export function dropIndex(
  catalog: Catalog,
  termIds: string[],
  moving: string[],
  dropMiddleY: number,
  middleY: (id: string) => number | undefined,
): number {
  const rest = termIds.filter((id) => !moving.includes(id));
  let index = 0;
  for (const block of blocksOf(catalog, rest)) {
    const ys = block.map(middleY).filter((y): y is number => y !== undefined);
    const blockMiddle = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : -Infinity;
    if (blockMiddle > dropMiddleY) return index;
    index += block.length;
  }
  return index;
}

// Keep each block's courses next to each other (in the order given), at
// the position of the block's first course. Used after reordering a term
// for fewer crossings, which may have pulled a block apart.
export function keepBlocksTogether(catalog: Catalog, termIds: string[]): string[] {
  const result: string[] = [];
  for (const id of termIds) {
    if (result.includes(id)) continue;
    result.push(...concurrentBlock(catalog, termIds, id).filter((member) => !result.includes(member)));
  }
  return result;
}
