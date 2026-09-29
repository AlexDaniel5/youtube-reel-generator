import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { fail } from "@/server/http";
import { errors } from "@/lib/errors";
import { sanitizeFilename } from "@/utils/fs";

/**
 * Serve stored media (source videos and rendered clips). Access is restricted
 * to the `projects/` subtree and path traversal is rejected by the storage
 * provider. Supports HTTP Range so <video> can seek and preview.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params;
    const storagePath = segments.join("/");

    // Only expose the projects subtree.
    if (!storagePath.startsWith("projects/")) throw errors.notFound();

    const storage = getStorage();
    if (!(await storage.exists(storagePath))) throw errors.fileNotFound();

    const buffer = await storage.get(storagePath);
    const total = buffer.length;
    const contentType = storagePath.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";

    const download = req.nextUrl.searchParams.get("download");
    const dispositionHeaders: Record<string, string> = {};
    if (download !== null) {
      const name = sanitizeFilename(download || "clip", "clip");
      dispositionHeaders["Content-Disposition"] = `attachment; filename="${name}.mp4"`;
    }

    const range = req.headers.get("range");
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : total - 1;
        if (start >= total || start > end) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${total}` },
          });
        }
        const chunk = new Uint8Array(buffer.subarray(start, end + 1));
        return new NextResponse(chunk, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(chunk.length),
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
            ...dispositionHeaders,
          },
        });
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        ...dispositionHeaders,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
