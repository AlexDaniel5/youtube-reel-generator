import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/server/http";
import { errors } from "@/lib/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) throw errors.notFound("Job not found.");
    return ok({
      id: job.id,
      projectId: job.projectId,
      type: job.type,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      error: job.error,
    });
  } catch (e) {
    return fail(e);
  }
}
