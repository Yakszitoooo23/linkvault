export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "@/lib/r2";

async function streamToBytes(stream: any): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fileKey = searchParams.get("fileKey");

  if (!fileKey) {
    return NextResponse.json({ error: "fileKey required" }, { status: 400 });
  }

  let bucket: string;
  try {
    bucket = getR2Bucket();
  } catch (error) {
    console.error("[Images API] R2 bucket configuration error:", error);
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }

  const client = getR2Client();

  try {
    const obj: any = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: fileKey,
      }),
    );

    if (!obj.Body) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const bytes = await streamToBytes(obj.Body);
    const contentType = obj.ContentType || "application/octet-stream";

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: any) {
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[Images API] R2 fetch error:", error);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
