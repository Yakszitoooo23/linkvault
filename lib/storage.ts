import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "./r2";

function assertBucket() {
  if (!process.env.R2_BUCKET) {
    throw new Error("R2_BUCKET environment variable is required");
  }
  return process.env.R2_BUCKET;
}

export async function getDownloadUrl(fileKey: string, ttlSec = 600) {
  const bucket = assertBucket();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: fileKey });
  return getSignedUrl(r2, cmd, { expiresIn: ttlSec });
}

export async function getUploadUrl(fileKey: string, ttlSec = 600) {
  const bucket = assertBucket();
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: fileKey });
  return getSignedUrl(r2, cmd, { expiresIn: ttlSec });
}
