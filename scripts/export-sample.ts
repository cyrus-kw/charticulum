// Write the sample school to public/samples/ so it can be downloaded from
// the app as a starting point for a real school's data.
// Run with: npm run sample:json
import { mkdirSync, writeFileSync } from "node:fs";
import { parseSchoolData } from "../src/engine/index.js";
import { sampleSchoolData } from "../src/fixtures/sampleSchool.js";

const result = parseSchoolData(sampleSchoolData);
if (!result.ok) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}

mkdirSync("public/samples", { recursive: true });
const path = "public/samples/example-state-university.json";
writeFileSync(path, JSON.stringify(result.data, null, 2) + "\n");
console.log(`Wrote ${path}`);
