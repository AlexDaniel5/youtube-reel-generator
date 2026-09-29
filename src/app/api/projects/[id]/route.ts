import { NextRequest } from "next/server";
import { getProjectDetail } from "@/server/services/project-service";
import { ok, fail } from "@/server/http";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const detail = await getProjectDetail(id);
    return ok(detail);
  } catch (e) {
    return fail(e);
  }
}
