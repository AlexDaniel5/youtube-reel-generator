import { NextRequest } from "next/server";
import { z } from "zod";
import { createProject } from "@/server/services/project-service";
import { ok, fail } from "@/server/http";
import { errors } from "@/lib/errors";

const bodySchema = z.object({ url: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) throw errors.validation("A YouTube URL is required.");

    const result = await createProject(parsed.data.url);
    return ok(result, 201);
  } catch (e) {
    return fail(e);
  }
}
