import { describe, expect, it } from "vitest";
import type { ChartIssue } from "../src/engine/index";
import { chartIssues, issueInTerm, planIssues, selectionIssues } from "../src/planner/issues";
import { chartOf } from "./helpers";

describe("where problems show", () => {
  // Term 0 is Pre-Credit; A is in term 1, B in term 2.
  const chart = chartOf([[], ["A"], ["B"]]);
  const requisite: ChartIssue = { code: "PREVIOUS_REQUISITE_NOT_MET", message: "", objectId: "B", requisiteId: "A" };
  const overLimit: ChartIssue = { code: "TERM_OVER_CREDIT_LIMIT", message: "", termIndex: 1 };
  const missing: ChartIssue = { code: "MISSING_REQUIRED_OBJECT", message: "", objectId: "C" };
  const shortfall: ChartIssue = { code: "TOTAL_CREDITS_SHORTFALL", message: "" };

  it("puts a problem with a placed course or a term in that term", () => {
    expect(issueInTerm(requisite, chart.terms[2])).toBe(true);
    expect(issueInTerm(requisite, chart.terms[1])).toBe(false);
    expect(issueInTerm(overLimit, chart.terms[1])).toBe(true);
  });

  it("leaves the rest to the plan as a whole", () => {
    expect(planIssues(chart, [requisite, overLimit, missing, shortfall])).toEqual([missing, shortfall]);
  });
});

describe("the selection's problems", () => {
  const chart = chartOf([[], ["A"], ["B"]]);
  const onB: ChartIssue = { code: "NOT_OFFERED", message: "", objectId: "B", termIndex: 2 };
  const overLimit: ChartIssue = { code: "TERM_OVER_CREDIT_LIMIT", message: "", termIndex: 2 };
  const issues = [onB, overLimit];

  it("gives a course its own, a term its own and its courses'", () => {
    expect(selectionIssues(chart, issues, "B", null)).toEqual([onB]);
    expect(selectionIssues(chart, issues, null, 2)).toEqual([onB, overLimit]);
    expect(selectionIssues(chart, issues, null, 1)).toEqual([]);
    expect(selectionIssues(chart, issues, null, null)).toEqual([]);
  });
});

describe("the chart's problems", () => {
  const chart = chartOf([[], ["A"], ["B"]]);
  const onA: ChartIssue = { code: "NOT_OFFERED", message: "", objectId: "A", termIndex: 1 };
  const onB: ChartIssue = { code: "NOT_OFFERED", message: "", objectId: "B", termIndex: 2 };
  const shortfall: ChartIssue = { code: "TOTAL_CREDITS_SHORTFALL", message: "" };
  const issues = [onA, onB, shortfall];

  it("lists every one on the chart, the selection's first", () => {
    expect(chartIssues(chart, issues, null, null)).toEqual([onA, onB]);
    expect(chartIssues(chart, issues, "B", null)).toEqual([onB, onA]);
    expect(chartIssues(chart, issues, null, 2)).toEqual([onB, onA]);
  });
});
