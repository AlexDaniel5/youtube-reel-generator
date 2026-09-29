import { NextRequest } from "next/server";
import { z } from "zod";
import { getClip, editAndRerenderClip } from "@/server/services/clip-service";
import { ok, fail } from "@/server/http";
import { errors } from "@/lib/errors";
import { CAPTION_STYLES } from "@/types";

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  start: z.number().nonnegative().optional(),
  end: z.number().positive().optional(),
  captionStyle: z.enum(CAPTION_STYLES).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return ok(await getClip(id));
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) throw errors.validation("Invalid clip edit.");
    const clip = await editAndRerenderClip(id, parsed.data);
    return ok(clip);
  } catch (e) {
    return fail(e);
  }
}
