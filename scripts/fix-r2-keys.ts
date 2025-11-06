import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const Bucket = process.env.R2_BUCKET!;

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

