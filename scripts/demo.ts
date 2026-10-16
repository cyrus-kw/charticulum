// Run with: npm run demo
import {
  applyExternalEquivalents,
  buildChart,
  checkChart,
  formatChart,
} from "../src/engine/index.js";
import {
  sampleCalendar,
  sampleCatalog,
  sampleDraftChart,
  sampleRequirements,
} from "../src/fixtures/sampleCurriculum.js";

// 1. Let the engine build a chart for a student with AP Calculus and
//    community-college English credit.
const built = buildChart(sampleCatalog, sampleRequirements, {
  name: "Example State University: B.S. Computer Science (generated)",
  completedExternal: [
    { institution: "AP", externalId: "CALC-AB" },
    { institution: "Valley Community College", externalId: "ENGL-1A" },
  ],
  calendar: sampleCalendar,
});
for (const issue of built.issues) console.log(`Builder: [${issue.code}] ${issue.message}`);
console.log(
  formatChart(sampleCatalog, built.chart, checkChart(sampleCatalog, built.chart, sampleRequirements)),
);

// 2. Check a student's hand-made draft and show what needs fixing.
const draft = applyExternalEquivalents(sampleCatalog, sampleDraftChart);
console.log("\n");
console.log(formatChart(sampleCatalog, draft, checkChart(sampleCatalog, draft, sampleRequirements)));
