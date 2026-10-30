import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin, BUCKET } from "@/lib/server/supabase";

/** Uploads an image and returns its object path (kept private; served via /api/media). */
export async function uploadImage(
  buffer: Buffer,
  contentType: string,
  prefix: "issues" | "resolutions",
): Promise<string> {
  const ext = contentType.includes("png") ? "png" : "jpg";
  const objectPath = `${prefix}/${Date.now()}-${randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(objectPath, buffer, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return objectPath;
}

/** Downloads a stored object (used by the /api/media proxy so the bucket stays private). */
export async function downloadFile(
  objectPath: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(objectPath);
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  return { buffer, contentType: data.type || "image/jpeg" };
}

/** Decodes a data URL or bare base64 string into a Buffer + mime type. */
export function decodeImage(input: string, fallbackMime = "image/jpeg") {
  const match = input.match(/^data:(.+?);base64,(.*)$/s);
  if (match) {
    return { buffer: Buffer.from(match[2], "base64"), mimeType: match[1] };
  }
  return { buffer: Buffer.from(input, "base64"), mimeType: fallbackMime };
}
