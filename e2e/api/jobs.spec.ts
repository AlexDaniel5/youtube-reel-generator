import { test, expect } from "../support/fixtures";
import { createProject, getJob } from "../support/api";
import { VIDEO_IDS, youtubeUrl } from "../support/urls";

const ANALYSIS_STATUSES = ["queued", "downloading", "transcribing", "analyzing", "completed"];

test.describe("job status API", () => {
  test.setTimeout(120_000);

  test("polling reports ordered progress through to completion", async ({ request }) => {
    const { projectId, jobId } = await createProject(request, youtubeUrl(VIDEO_IDS.apiJobs));

    const seen: { status: string; progress: number }[] = [];
    await expect
      .poll(
        async () => {
          const job = await getJob(request, jobId);
          expect(job).toMatchObject({ id: jobId, projectId, type: "analyze", error: null });
          seen.push({ status: job.status, progress: job.progress });
          return job.status;
        },
        { timeout: 90_000, intervals: [250] },
      )
      .toBe("completed");

    for (const { status } of seen) expect(ANALYSIS_STATUSES).toContain(status);

    // Stages only move forward and progress never goes backwards.
    const stageOrder = seen.map(({ status }) => ANALYSIS_STATUSES.indexOf(status));
    expect(stageOrder).toEqual([...stageOrder].sort((a, b) => a - b));
    const progress = seen.map((s) => s.progress);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(100);

    // We polled often enough to observe at least one in-flight stage.
    expect(seen.some((s) => s.status !== "completed")).toBe(true);
  });

  test("unknown job id is a 404", async ({ request }) => {
    const res = await request.get("/api/jobs/does-not-exist");
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Job not found." },
    });
  });
});
