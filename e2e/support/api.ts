import { expect, type APIRequestContext } from "@playwright/test";

/** Thin typed helpers over the app's JSON API, used for test setup and checks. */

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface JobDto {
  id: string;
  projectId: string;
  type: string;
  status: string;
  stage: string | null;
  progress: number;
  error: string | null;
}

export interface ClipDto {
  id: string;
  title: string;
  start: number;
  end: number;
  captionStyle: string;
  status: string;
  error: string | null;
  hasVideo: boolean;
}

export interface ProjectDto {
  id: string;
  status: string;
  error: string | null;
  job: Omit<JobDto, "projectId" | "type"> | null;
  sourceVideo: { durationSec: number; storagePath: string } | null;
  suggestions: { id: string; start: number; end: number; title: string }[];
  clips: ClipDto[];
}

async function data<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  const body = (await res.json()) as Envelope<T>;
  expect(res.ok(), `${res.url()} → ${res.status()} ${JSON.stringify(body.error)}`).toBe(true);
  return body.data as T;
}

export async function createProject(request: APIRequestContext, url: string) {
  const res = await request.post("/api/projects", { data: { url } });
  expect(res.status()).toBe(201);
  return data<{ projectId: string; jobId: string }>(res);
}

export async function getJob(request: APIRequestContext, jobId: string) {
  return data<JobDto>(await request.get(`/api/jobs/${jobId}`));
}

export async function getProject(request: APIRequestContext, projectId: string) {
  return data<ProjectDto>(await request.get(`/api/projects/${projectId}`));
}

export async function getClip(request: APIRequestContext, clipId: string) {
  return data<ClipDto>(await request.get(`/api/clips/${clipId}`));
}

/** Poll the job endpoint until it reaches a terminal state. */
export async function waitForJob(
  request: APIRequestContext,
  jobId: string,
  status: "completed" | "failed" = "completed",
  timeout = 90_000,
) {
  await expect
    .poll(async () => (await getJob(request, jobId)).status, { timeout, intervals: [500] })
    .toBe(status);
  return getJob(request, jobId);
}

/** Create a project and wait for analysis to finish. */
export async function analyzeVideo(request: APIRequestContext, url: string) {
  const { projectId, jobId } = await createProject(request, url);
  await waitForJob(request, jobId);
  return getProject(request, projectId);
}

/** Generate a clip from a suggestion and wait for its render to finish. */
export async function renderClip(
  request: APIRequestContext,
  projectId: string,
  suggestionId: string,
  timeout = 90_000,
) {
  const res = await request.post(`/api/projects/${projectId}/clips`, {
    data: { suggestionIds: [suggestionId] },
  });
  expect(res.status()).toBe(201);
  const { clips } = await data<{ clips: ClipDto[] }>(res);
  const clip = clips[0]!;
  await expect
    .poll(async () => (await getClip(request, clip.id)).status, { timeout, intervals: [500] })
    .toBe("completed");
  return getClip(request, clip.id);
}

/** Storage key of a rendered clip (mirrors the job manager's layout). */
export const clipStoragePath = (projectId: string, clipId: string) =>
  `projects/${projectId}/clips/${clipId}.mp4`;
