import { rmSync } from "node:fs";
import { E2E_DB_FILE, E2E_STORAGE_DIR } from "./env";

/** Remove everything the run generated. The next run recreates it in prepare.ts. */
export default function globalTeardown() {
  rmSync(E2E_STORAGE_DIR, { recursive: true, force: true });
  for (const suffix of ["", "-journal"]) {
    rmSync(`${E2E_DB_FILE}${suffix}`, { force: true });
  }
}
