import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const endpoint =
  process.env.FILE_ENDPOINT ??
  (process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined);

if (!endpoint) {
  throw new Error("Missing R2 endpoint. Set R2_ACCOUNT_ID or FILE_ENDPOINT.");
}

const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? process.env.FILE_ACCESS_KEY_ID;
const secretAccessKey =
  process.env.R2_SECRET_ACCESS_KEY ?? process.env.FILE_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET ?? process.env.FILE_BUCKET;

if (!accessKeyId || !secretAccessKey) {
  throw new Error("Missing R2 credentials. Set R2_* or FILE_* variables.");
}
if (!bucket) {
  throw new Error("Missing R2 bucket. Set R2_BUCKET or FILE_BUCKET.");
}

const s3 = new S3Client({
  region: "auto",
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const Bucket = bucket;

(async () => {
  const prefix = "linkvault/images/";
  let token: string | undefined;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );

    for (const obj of list.Contents ?? []) {
      const Key = obj.Key!;
      const fixed = Key.replace(/\.webp\.webp$/i, ".webp").replace(
        /\.jpe?g\.webp$/i,
        ".webp",
      );

      if (fixed !== Key) {
        await s3.send(
          new CopyObjectCommand({
            Bucket,
            CopySource: `${Bucket}/${Key}`,
            Key: fixed,
            MetadataDirective: "COPY",
          }),
        );
        await s3.send(new DeleteObjectCommand({ Bucket, Key }));
        console.log(`Renamed ${Key} -> ${fixed}`);
      }
    }

    token = list.NextContinuationToken;
  } while (token);
})().catch((err) => {
  console.error("Failed to fix keys", err);
  process.exitCode = 1;
});

