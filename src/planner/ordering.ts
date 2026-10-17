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

// While a block is dragged within its own term, how far (as a fraction of
// a row) past the halfway point it must go before the space moves on.
// Without it, the other cards shuffle at the slightest wobble.
export const REORDER_STICKINESS = 0.3;

// While a block is dragged within its own term: where it would go, and the
// term's new order. Its top edge, measured in rows from the top of the
// term, picks the nearest slot that doesn't split another block. Once a
// spot is chosen (`current`), it stays until the block is clearly nearer
// another spot (see REORDER_STICKINESS).
export function reorderPreview(
  catalog: Catalog,
  termIds: string[],
  block: string[],
  dragTopY: number,
  layout: { top: number; rowHeight: number },
  current?: number | null,
): { index: number; order: string[]; originalIndex: number } {
  const rest = termIds.filter((id) => !block.includes(id));
  // Where the block may go: before any block of the rest, or at the end.
  const allowed = [0];
  for (const unit of blocksOf(catalog, rest)) allowed.push(allowed[allowed.length - 1] + unit.length);
  const wanted = (dragTopY - layout.top) / layout.rowHeight;
  const nearest = allowed.reduce((best, i) => (Math.abs(i - wanted) < Math.abs(best - wanted) ? i : best));
  const keep =
    current !== undefined && current !== null && allowed.includes(current) && Math.abs(current - wanted) < 0.5 + REORDER_STICKINESS;
  const index = keep ? current : nearest;
  const order = [...rest.slice(0, index), ...block, ...rest.slice(index)];
  return { index, order, originalIndex: termIds.indexOf(block[0]) };
}

// Where each course sits when a term is packed from the top in `order`.
export function packedTops(order: string[], top: number, rowHeight: number): Map<string, number> {
  return new Map(order.map((id, k) => [id, top + k * rowHeight]));
}
