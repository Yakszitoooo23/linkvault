import { S3Client } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

function resolveEndpoint(): string | null {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT;
  if (process.env.FILE_ENDPOINT) return process.env.FILE_ENDPOINT;

  const accountId = process.env.R2_ACCOUNT_ID;
  if (accountId) {
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }

  return null;
}

function resolveAccessKey(): string | null {
  return process.env.R2_ACCESS_KEY_ID ?? process.env.FILE_ACCESS_KEY_ID ?? null;
}

function resolveSecret(): string | null {
  return process.env.R2_SECRET_ACCESS_KEY ?? process.env.FILE_SECRET_ACCESS_KEY ?? null;
}

function resolveBucket(): string | null {
  return process.env.R2_BUCKET ?? process.env.FILE_BUCKET ?? null;
}

export function isR2Configured(): boolean {
  return Boolean(resolveEndpoint() && resolveAccessKey() && resolveSecret() && resolveBucket());
}

export function getR2Client(): S3Client {
  if (!client) {
    const endpoint = resolveEndpoint();
    const accessKeyId = resolveAccessKey();
    const secretAccessKey = resolveSecret();

    if (!endpoint) {
      throw new Error(
        "Cloudflare R2 endpoint not configured. Set R2_ACCOUNT_ID (preferred) or FILE_ENDPOINT.",
      );
    }
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "Cloudflare R2 credentials not configured. Set R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY or legacy FILE_ACCESS_KEY_ID/FILE_SECRET_ACCESS_KEY.",
      );
    }

    client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return client;
}

export function getR2Bucket(): string {
  const bucket = resolveBucket();
  if (!bucket) {
    throw new Error(
      "Cloudflare R2 bucket not configured. Set R2_BUCKET (preferred) or legacy FILE_BUCKET.",
    );
  }
  return bucket;
}

export function getR2PublicBase(): string | null {
  return process.env.R2_PUBLIC_BASE ?? null;
}
