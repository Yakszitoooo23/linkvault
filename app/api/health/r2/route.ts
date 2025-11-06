import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "@/lib/r2";

export async function GET() {
  try {
    const bucket = getR2Bucket();
    const client = getR2Client();
    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 0 }));
    return NextResponse.json({ ok: true, bucket });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

