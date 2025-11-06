import { PutObjectCommand } from "@aws-sdk/client-s3";
import { lookup as mimeLookup } from "mime-types";
import { randomUUID } from "crypto";
import { r2 } from "./r2";

type Ext = "png" | "webp" | "jpg" | "jpeg" | "svg";

export async function uploadToR2(opts: {
  buffer: Buffer;
  originalName: string;
  forcedExt?: Ext;
  keyPrefix?: string;
}) {
  const { buffer, originalName, forcedExt } = opts;
  const keyPrefix = (opts.keyPrefix ?? "linkvault/images").replace(/\/+$/, "");

  let base = originalName.replace(/\.[^/.]+$/, "");
  base = base.replace(/\.(png|jpe?g|webp|svg)$/i, "");
  base = base || "file";
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
  let ext = (forcedExt ?? (originalName.split(".").pop() || "")).toLowerCase() as Ext;

  if (!["png", "webp", "jpg", "jpeg", "svg"].includes(ext)) ext = "png";
  if (ext === "jpeg") ext = "jpg";

  const key = `${keyPrefix}/${randomUUID()}-${safeBase}.${ext}`;
  const ContentType = (mimeLookup(ext) || "application/octet-stream") as string;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const publicBase = process.env.R2_PUBLIC_BASE?.replace(/\/+$/, "");
  const publicUrl = publicBase ? `${publicBase}/${key}` : null;

  return { key, contentType: ContentType, publicUrl };
}

