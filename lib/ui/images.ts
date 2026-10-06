"use client";

import type { PreparedImage } from "@/lib/services/screenshots";

const THUMBNAIL_MAX = 480;
const ACCEPTED = /^image\/(png|jpeg|webp|gif)$/;

/**
 * Read an image file in the browser: validate it, measure it and make a
 * small JPEG thumbnail so lists never load full-resolution images.
 */
export async function prepareImage(file: File | Blob, fileName = "pasted-screenshot.png"): Promise<PreparedImage> {
  if (!ACCEPTED.test(file.type)) {
    throw new Error("Only PNG, JPEG, WebP or GIF images can be added.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, THUMBNAIL_MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot create image previews.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create a preview."))), "image/jpeg", 0.82),
    );
    return {
      fileName: file instanceof File ? file.name : fileName,
      mimeType: file.type,
      width: bitmap.width,
      height: bitmap.height,
      blob: file,
      thumbnail,
    };
  } finally {
    bitmap.close();
  }
}
