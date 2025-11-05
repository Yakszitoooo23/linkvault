import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getR2Client, getR2Bucket } from "@/lib/r2";

export async function GET() {
  try {
    const s3 = getR2Client();
    const bucket = getR2Bucket();
    await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 0 }));
    return NextResponse.json({ ok: true, bucket });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

