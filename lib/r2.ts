import { S3Client } from "@aws-sdk/client-s3";

export function getR2Client() {
  if (!process.env.FILE_ENDPOINT) {
    throw new Error("FILE_ENDPOINT environment variable is required for Cloudflare R2");
  }
  if (!process.env.FILE_ACCESS_KEY_ID) {
    throw new Error("FILE_ACCESS_KEY_ID environment variable is required");
  }
  if (!process.env.FILE_SECRET_ACCESS_KEY) {
    throw new Error("FILE_SECRET_ACCESS_KEY environment variable is required");
  }

  return new S3Client({
    region: process.env.FILE_REGION || "auto",
    endpoint: process.env.FILE_ENDPOINT,
    credentials: {
      accessKeyId: process.env.FILE_ACCESS_KEY_ID,
      secretAccessKey: process.env.FILE_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // ✅ Required for Cloudflare R2
  });
}

export function getR2Bucket() {
  if (!process.env.FILE_BUCKET) {
    throw new Error("FILE_BUCKET environment variable is required");
  }
  return process.env.FILE_BUCKET;
}

export function getR2PublicBase() {
  if (!process.env.R2_PUBLIC_BASE) {
    throw new Error("R2_PUBLIC_BASE environment variable is required");
  }
  return process.env.R2_PUBLIC_BASE;
}

