import { describe, expect, it } from "vitest";

// This file has no real logic to test yet — it just proves that
// TypeScript, Vitest, and the test runner are wired up correctly.
// Once src/engine files exist, real tests will import from them
// the same way this file imports from "vitest".
describe("project setup", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
