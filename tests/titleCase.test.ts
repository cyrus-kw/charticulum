import { describe, expect, it } from "vitest";
import { titleCase } from "../src/components/ui";

describe("titleCase", () => {
  it("capitalizes each word of a tag", () => {
    expect(titleCase("every term")).toBe("Every Term");
    expect(titleCase("4 credits")).toBe("4 Credits");
    expect(titleCase("odd years")).toBe("Odd Years");
    expect(titleCase("self-paced")).toBe("Self-Paced");
  });

  it("leaves capitals and codes alone", () => {
    expect(titleCase("CS 102")).toBe("CS 102");
    expect(titleCase("General Education")).toBe("General Education");
    expect(titleCase("SOPH-REV")).toBe("SOPH-REV");
  });
});
