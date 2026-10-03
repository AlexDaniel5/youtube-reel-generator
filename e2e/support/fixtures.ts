import { test as base, request as playwrightRequest } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { HomePage } from "../pages/HomePage";
import { analyzeVideo, type ProjectDto } from "./api";
import { E2E_BASE_URL, E2E_DATABASE_URL } from "./env";
import { VIDEO_IDS, youtubeUrl } from "./urls";

interface TestFixtures {
  home: HomePage;
}

interface WorkerFixtures {
  /** Direct read access to the e2e database, for asserting on side effects. */
  db: PrismaClient;
  /** One analyzed project shared by API tests that only need existing media. */
  analyzedProject: ProjectDto;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  home: async ({ page }, use) => {
    await use(new HomePage(page));
  },

  db: [
    async ({}, use) => {
      const db = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
      await use(db);
      await db.$disconnect();
    },
    { scope: "worker" },
  ],

  analyzedProject: [
    async ({}, use) => {
      const request = await playwrightRequest.newContext({ baseURL: E2E_BASE_URL });
      const project = await analyzeVideo(request, youtubeUrl(VIDEO_IDS.apiMedia));
      await use(project);
      await request.dispose();
    },
    { scope: "worker", timeout: 120_000 },
  ],
});

export { expect } from "@playwright/test";
