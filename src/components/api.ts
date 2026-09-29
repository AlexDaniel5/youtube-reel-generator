import type { CaptionStyle } from "@/types";
import type { ClipDto, JobDto, ProjectDetailDto } from "./types";

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new Error(`Request failed (${res.status}).`);
  }
  if (!res.ok || !body.ok || body.data === undefined) {
    throw new Error(body.error?.message ?? `Request failed (${res.status}).`);
  }
  return body.data;
}

export const api = {
  createProject: (url: string) =>
    call<{ projectId: string; jobId: string }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  getProject: (id: string) => call<ProjectDetailDto>(`/api/projects/${id}`),

  getJob: (id: string) => call<JobDto>(`/api/jobs/${id}`),

  generateClips: (projectId: string, suggestionIds: string[], captionStyle: CaptionStyle) =>
    call<{ clips: ClipDto[] }>(`/api/projects/${projectId}/clips`, {
      method: "POST",
      body: JSON.stringify({ suggestionIds, captionStyle }),
    }),

  patchClip: (
    id: string,
    edit: { title?: string; start?: number; end?: number; captionStyle?: CaptionStyle },
  ) =>
    call<ClipDto>(`/api/clips/${id}`, {
      method: "PATCH",
      body: JSON.stringify(edit),
    }),

  rerenderClip: (id: string) =>
    call<{ id: string; status: string }>(`/api/clips/${id}/render`, { method: "POST" }),
};

export function mediaUrl(storagePath: string, download?: string): string {
  const base = `/api/media/${storagePath}`;
  return download ? `${base}?download=${encodeURIComponent(download)}` : base;
}
