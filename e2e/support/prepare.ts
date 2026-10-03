/**
 * Runs before the e2e server starts (from `webServer.command`): wipes the test
 * storage directory and recreates the test database from the Prisma schema, so
 * every run starts from the same empty state and never touches dev.db.
 *
 * The reset deletes the dedicated SQLite file rather than using
 * `prisma db push --force-reset`, so it can only ever affect prisma/e2e.db —
 * whatever DATABASE_URL happens to be in the surrounding shell.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { E2E_DB_FILE, E2E_STORAGE_DIR, REPO_ROOT, e2eEnv } from "./env";

rmSync(E2E_STORAGE_DIR, { recursive: true, force: true });
for (const suffix of ["", "-journal"]) {
  rmSync(`${E2E_DB_FILE}${suffix}`, { force: true });
}

execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  cwd: REPO_ROOT,
  env: { ...process.env, ...e2eEnv },
  stdio: "inherit",
});
