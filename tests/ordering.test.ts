import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/index";
import {
  blocksOf,
  concurrentBlock,
  dropIndex,
  keepBlocksTogether,
  packedTops,
  reorderPreview,
  REORDER_STICKINESS,
} from "../src/planner/ordering";
import { obj } from "./helpers";

const catalog = createCatalog([
  obj("LEC"),
  obj("LAB", { concurrent: ["LEC"] }),
  obj("REC", { concurrent: ["LAB"] }), // a chain: REC with LAB with LEC
  obj("A"),
  obj("B"),
]);

describe("concurrentBlock", () => {
  it("groups courses taken together, in term order", () => {
    expect(concurrentBlock(catalog, ["A", "LAB", "B", "LEC"], "LEC")).toEqual(["LAB", "LEC"]);
    expect(concurrentBlock(catalog, ["LEC", "A", "LAB", "REC"], "REC")).toEqual(["LEC", "LAB", "REC"]);
  });

  it("is just the course when it has no partner in the term", () => {
    expect(concurrentBlock(catalog, ["A", "LAB", "B"], "LAB")).toEqual(["LAB"]);
    expect(concurrentBlock(catalog, ["A", "B"], "A")).toEqual(["A"]);
  });
});

describe("blocksOf", () => {
  it("splits a term into blocks", () => {
    expect(blocksOf(catalog, ["A", "LEC", "LAB", "B"])).toEqual([["A"], ["LEC", "LAB"], ["B"]]);
  });
});

describe("dropIndex", () => {
  // Middles: A 0, LEC 100, LAB 200, B 300.
  const middle = (id: string) => ({ A: 0, LEC: 100, LAB: 200, B: 300 })[id];
  const term = ["A", "LEC", "LAB", "B"];

  it("goes before the first block below the drop point", () => {
    expect(dropIndex(catalog, ["A", "B"], ["X"], -50, (id) => middle(id))).toBe(0);
    expect(dropIndex(catalog, ["A", "B"], ["X"], 150, (id) => middle(id))).toBe(1);
    expect(dropIndex(catalog, ["A", "B"], ["X"], 400, (id) => middle(id))).toBe(2);
  });

  it("never lands inside a concurrent block", () => {
    // Between LEC (100) and LAB (200): the block's middle is 150.
    expect(dropIndex(catalog, term, ["X"], 120, middle)).toBe(1); // before the block
    expect(dropIndex(catalog, term, ["X"], 180, middle)).toBe(3); // after it
  });

  it("ignores the courses being moved", () => {
    // Moving A down past the lecture block: index counts without A.
    expect(dropIndex(catalog, term, ["A"], 250, middle)).toBe(2);
  });
});

describe("keepBlocksTogether", () => {
  it("pulls a block back together at its first course", () => {
    expect(keepBlocksTogether(catalog, ["LEC", "A", "LAB", "B"])).toEqual(["LEC", "LAB", "A", "B"]);
    expect(keepBlocksTogether(catalog, ["A", "B"])).toEqual(["A", "B"]);
  });
});

describe("reorderPreview", () => {
  // Rows 100 apart from the top (y = 0).
  const layout = { top: 0, rowHeight: 100 };
  const term = ["A", "LEC", "LAB", "B"];
  const order = (block: string[], top: number, current?: number | null) =>
    reorderPreview(catalog, term, block, top, layout, current).order;

  it("puts the block at the slot nearest its top edge", () => {
    expect(order(["B"], 0)).toEqual(["B", "A", "LEC", "LAB"]);
    expect(order(["B"], 40)).toEqual(["B", "A", "LEC", "LAB"]);
    expect(order(["B"], 60)).toEqual(["A", "B", "LEC", "LAB"]);
    expect(order(["B"], 900)).toEqual(["A", "LEC", "LAB", "B"]);
  });

  it("never opens a space inside a lecture and its lab", () => {
    // Slot 2 would be between LEC and LAB: it goes before or after the pair.
    expect(order(["B"], 140)).toEqual(["A", "B", "LEC", "LAB"]);
    expect(order(["B"], 260)).toEqual(["A", "LEC", "LAB", "B"]);
  });

  it("moves a block as one", () => {
    expect(order(["LEC", "LAB"], 900)).toEqual(["A", "B", "LEC", "LAB"]);
  });

  it("treats a block released where it started as not moved", () => {
    // LEC+LAB start at slot 1 (top 100).
    const preview = reorderPreview(catalog, term, ["LEC", "LAB"], 100, layout);
    expect(preview.index).toBe(preview.originalIndex);
  });

  it("is sticky: the space only moves once the block is clearly nearer another spot", () => {
    // Currently at slot 0; halfway (50) isn't enough...
    expect(order(["B"], 55, 0)).toEqual(["B", "A", "LEC", "LAB"]);
    expect(order(["B"], 79, 0)).toEqual(["B", "A", "LEC", "LAB"]);
    // ...but past 0.5 + REORDER_STICKINESS rows it moves.
    expect(order(["B"], 100 * (0.5 + REORDER_STICKINESS) + 1, 0)).toEqual(["A", "B", "LEC", "LAB"]);
    // Wiggling around the halfway point doesn't flip back and forth.
    let current: number | null = null;
    const seen = new Set<number>();
    for (const top of [45, 55, 45, 55, 45, 55]) {
      current = reorderPreview(catalog, term, ["B"], top, layout, current).index;
      seen.add(current);
    }
    expect(seen.size).toBe(1);
  });
});

describe("packedTops", () => {
  it("stacks courses one row apart from the top", () => {
    expect([...packedTops(["A", "B", "C"], 72, 88)]).toEqual([["A", 72], ["B", 160], ["C", 248]]);
  });
});
