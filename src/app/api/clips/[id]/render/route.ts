import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { startRender } from "@/lib/jobs/manager";
import { ok, fail } from "@/server/http";
import { errors } from "@/lib/errors";

/** Re-trigger rendering for an existing clip (e.g. after a failure). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const clip = await prisma.generatedClip.findUnique({ where: { id } });
    if (!clip) throw errors.notFound("Clip not found.");
    await prisma.generatedClip.update({
      where: { id },
      data: { status: "queued", error: null },
    });
    startRender(id);
    return ok({ id, status: "queued" });
  } catch (e) {
    return fail(e);
  }
}
