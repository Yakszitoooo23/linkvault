export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "@/lib/r2";

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

  try {
    const obj: any = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET!,
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
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
