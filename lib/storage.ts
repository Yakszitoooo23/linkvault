import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

const s3 = new S3Client({
  region: env.FILE_REGION,
  credentials: {
    accessKeyId: env.FILE_ACCESS_KEY_ID,
    secretAccessKey: env.FILE_SECRET_ACCESS_KEY,
  },
});

export async function getDownloadUrl(fileKey: string, ttlSec = 600) {
  const cmd = new GetObjectCommand({ Bucket: env.FILE_BUCKET, Key: fileKey });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSec });
}

export async function getUploadUrl(fileKey: string, ttlSec = 600) {
  const cmd = new PutObjectCommand({ Bucket: env.FILE_BUCKET, Key: fileKey });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSec });
}
