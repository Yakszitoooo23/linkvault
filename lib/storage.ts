import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Bucket, getR2Client } from "./r2";

export async function getDownloadUrl(fileKey: string, ttlSec = 600) {
  const bucket = getR2Bucket();
  const client = getR2Client();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: fileKey });
  return getSignedUrl(client, cmd, { expiresIn: ttlSec });
}

export async function getUploadUrl(fileKey: string, ttlSec = 600) {
  const bucket = getR2Bucket();
  const client = getR2Client();
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: fileKey });
  return getSignedUrl(client, cmd, { expiresIn: ttlSec });
}
