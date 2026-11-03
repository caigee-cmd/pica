/** Attachment helpers — upload via artifacts.create, then threads.send({ artifactIds }). */

/** Matches Rakazo ATTACHMENT_MAX_COUNT default. */
export const MAX_ATTACHMENTS = 4;
/** Matches Rakazo ATTACHMENT_MAX_BYTES (10 MiB). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = MAX_FILE_BYTES;
export const IMAGE_MAX_EDGE = 1600;

export type PendingAttachment = {
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: "image" | "file";
  /** Object URL for image thumbnails (revoke on remove). */
  previewUrl?: string;
  /** Base64 payload (no data: prefix) for artifacts.create. */
  contentBase64: string;
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

function readAsBase64(blob: Blob): Promise<string> {
  return readAsDataUrl(blob).then((dataUrl) => {
    const i = dataUrl.indexOf(",");
    if (i < 0) throw new Error("invalid data URL");
    return dataUrl.slice(i + 1);
  });
}

function stripDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("invalid data URL");
  return { mime: match[1] || "application/octet-stream", base64: match[2] };
}

/** Resize so longest edge ≤ maxEdge; re-encode under maxBytes when possible. */
export async function imageToDataUrl(
  file: File,
  opts: { maxEdge?: number; maxBytes?: number } = {},
): Promise<{ dataUrl: string; byteLength: number; mime: string }> {
  const maxEdge = opts.maxEdge ?? IMAGE_MAX_EDGE;
  const maxBytes = opts.maxBytes ?? MAX_IMAGE_BYTES;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);

    const preferPng =
      /png|gif|webp/i.test(file.type) || /\.(png|gif|webp)$/i.test(file.name);
    const mime = preferPng && file.type === "image/png" ? "image/png" : "image/jpeg";
    const qualities = mime === "image/jpeg" ? [0.85, 0.72, 0.6, 0.48] : [1];

    let best: Blob | null = null;
    for (const q of qualities) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), mime, q),
      );
      if (!blob) continue;
      best = blob;
      if (blob.size <= maxBytes) break;
    }

    if (!best) {
      if (file.size <= maxBytes) {
        const dataUrl = await readAsDataUrl(file);
        return { dataUrl, byteLength: file.size, mime: file.type || "image/png" };
      }
      throw new Error("Image too large after compress");
    }

    if (best.size > maxBytes) {
      throw new Error(`Image exceeds ${formatBytes(maxBytes)} after resize`);
    }

    const dataUrl = await readAsDataUrl(best);
    return { dataUrl, byteLength: best.size, mime: best.type || mime };
  } finally {
    bitmap.close();
  }
}

export type AddAttachmentResult =
  | { ok: true; item: PendingAttachment }
  | { ok: false; reason: string };

const ALLOWED_EXT =
  /\.(png|jpe?g|gif|webp|bmp|txt|md|csv|json|pdf|docx?|xlsx?|pptx?|log|zip|mp3|wav|ogg|m4a|mp4)$/i;

export async function prepareAttachment(file: File): Promise<AddAttachmentResult> {
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: `${file.name} is over ${formatBytes(MAX_FILE_BYTES)} — skipped`,
    };
  }

  if (isImageFile(file)) {
    try {
      const { dataUrl, byteLength, mime } = await imageToDataUrl(file);
      const { base64 } = stripDataUrl(dataUrl);
      const previewUrl = URL.createObjectURL(file);
      return {
        ok: true,
        item: {
          id,
          name: file.name || "image",
          size: byteLength,
          mime,
          kind: "image",
          previewUrl,
          contentBase64: base64,
        },
      };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "Could not read image",
      };
    }
  }

  const allowed =
    !file.type ||
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/pdf" ||
    file.type === "application/zip" ||
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/") ||
    file.type.includes("document") ||
    file.type.includes("sheet") ||
    file.type.includes("presentation") ||
    ALLOWED_EXT.test(file.name);
  if (!allowed) {
    return {
      ok: false,
      reason: `${file.name}: this file type isn't supported — skipped`,
    };
  }

  try {
    const contentBase64 = await readAsBase64(file);
    return {
      ok: true,
      item: {
        id,
        name: file.name || "file",
        size: file.size,
        mime: file.type || "application/octet-stream",
        kind: "file",
        contentBase64,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Could not read file",
    };
  }
}

/** Draft text only — attachments go through artifacts.create, not markdown embeds. */
export function buildMessageText(draft: string, _attachments: PendingAttachment[] = []): string {
  return draft.trimEnd();
}

export function revokeAttachment(att: PendingAttachment) {
  if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
}
