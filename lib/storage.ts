import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

// Only create S3 client if S3 is configured
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    if (!env.FILE_BUCKET || !env.FILE_REGION || !env.FILE_ACCESS_KEY_ID || !env.FILE_SECRET_ACCESS_KEY) {
      throw new Error("S3 storage not configured. Missing required environment variables.");
    }
    
    const clientConfig: any = {
  region: env.FILE_REGION,
  credentials: {
    accessKeyId: env.FILE_ACCESS_KEY_ID,
    secretAccessKey: env.FILE_SECRET_ACCESS_KEY,
  },
    };
    
    // Cloudflare R2 requires custom endpoint
    const endpoint = process.env.FILE_ENDPOINT;
    if (endpoint) {
      clientConfig.endpoint = endpoint;
      clientConfig.forcePathStyle = true; // Required for R2
    }
    
    s3Client = new S3Client(clientConfig);
  }
  return s3Client;
}

export async function getDownloadUrl(fileKey: string, ttlSec = 600) {
  const s3 = getS3Client();
  const cmd = new GetObjectCommand({ Bucket: env.FILE_BUCKET!, Key: fileKey });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSec });
}

export async function getUploadUrl(fileKey: string, ttlSec = 600) {
  const s3 = getS3Client();
  const cmd = new PutObjectCommand({ Bucket: env.FILE_BUCKET!, Key: fileKey });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSec });
}
