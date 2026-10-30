import { downloadFile } from "@/lib/server/storage";

export const runtime = "nodejs";

// Streams issue/proof photos from the (private) Supabase Storage bucket so we
// never expose it publicly.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const objectPath = path.join("/");

  // Only allow our known prefixes.
  if (!objectPath.startsWith("issues/") && !objectPath.startsWith("resolutions/")) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const file = await downloadFile(objectPath);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("media fetch failed", err);
    return new Response("Error", { status: 500 });
  }
}
