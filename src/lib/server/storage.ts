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
  // Falling back to an image type would make an <audio> element refuse to play.
  return { buffer, contentType: data.type || contentTypeFor(objectPath) };
}

/** Decodes a data URL or bare base64 string into a Buffer + mime type. */
export function decodeImage(input: string, fallbackMime = "image/jpeg") {
  const match = input.match(/^data:(.+?);base64,(.*)$/s);
  if (match) {
    return { buffer: Buffer.from(match[2], "base64"), mimeType: match[1] };
  }
  return { buffer: Buffer.from(input, "base64"), mimeType: fallbackMime };
}

/** Uploads a voice recording and returns its object path (served via /api/media). */
export async function uploadAudio(buffer: Buffer, contentType: string): Promise<string> {
  const ext = contentType.includes("webm")
    ? "webm"
    : contentType.includes("mp4") || contentType.includes("m4a")
      ? "m4a"
      : contentType.includes("ogg")
        ? "ogg"
        : contentType.includes("wav")
          ? "wav"
          : contentType.includes("mpeg") || contentType.includes("mp3")
            ? "mp3"
            : contentType.includes("aac")
              ? "aac"
              : "bin";
  const objectPath = `audio/${Date.now()}-${randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(objectPath, buffer, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`audio upload failed: ${error.message}`);
  return objectPath;
}

/** Content type guessed from the stored object's extension. */
function contentTypeFor(objectPath: string): string {
  const ext = objectPath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    webm: "audio/webm",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    aac: "audio/aac",
  };
  return map[ext] ?? "application/octet-stream";
}
