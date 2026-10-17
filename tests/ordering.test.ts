import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/index";
import { blocksOf, concurrentBlock, dropIndex, keepBlocksTogether } from "../src/planner/ordering";
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
