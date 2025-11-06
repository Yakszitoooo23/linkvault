import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2 } from "@/lib/r2";

export async function GET() {
  try {
    const bucket = process.env.R2_BUCKET!;
    await r2.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 0 }));
    return NextResponse.json({ ok: true, bucket });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

