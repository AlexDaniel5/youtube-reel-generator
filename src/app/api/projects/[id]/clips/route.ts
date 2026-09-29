import { NextRequest } from "next/server";
import { z } from "zod";
import { generateClipsFromSuggestions } from "@/server/services/clip-service";
import { ok, fail } from "@/server/http";
import { errors } from "@/lib/errors";
import { CAPTION_STYLES } from "@/types";

const bodySchema = z.object({
  suggestionIds: z.array(z.string().min(1)).min(1),
  captionStyle: z.enum(CAPTION_STYLES).default("classic"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) throw errors.validation("Select at least one clip to generate.");

    const clips = await generateClipsFromSuggestions(
      id,
      parsed.data.suggestionIds,
      parsed.data.captionStyle,
    );
    return ok({ clips }, 201);
  } catch (e) {
    return fail(e);
  }
}
