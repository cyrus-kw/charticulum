import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // With TEST_DATABASE_URL set, the *.db.test.ts files run against one
    // real database. The local one (npm run db:local) takes one connection
    // at a time, so test files then run one after another instead of
    // side by side. Without it, those files are skipped and nothing waits.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
