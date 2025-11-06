import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client, isR2Configured } from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileKey = formData.get("fileKey") as string | null;
    
    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    
    if (!fileKey) {
      return NextResponse.json({ error: "fileKey is required" }, { status: 400 });
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        {
          error:
            "Cloudflare R2 is not configured. Please set R2_* variables or legacy FILE_* equivalents.",
        },
        { status: 500 },
      );
    }
    
    try {
      const client = getR2Client();
      const bucket = getR2Bucket();

      console.log(`[Upload API] Uploading to R2 bucket: ${bucket}, key: ${fileKey}`);

      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Upload directly to R2
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      });
      
      await client.send(command);
      console.log(`[Upload API] Successfully uploaded to R2 bucket: ${bucket}, key: ${fileKey}`);
      
      return NextResponse.json({ fileKey });
    } catch (uploadError: any) {
      console.error(`[Upload API] Upload failed. Key: ${fileKey}, Error:`, uploadError);
      throw uploadError;
    }
  } catch (e: any) {
    console.error("[Upload API] Error:", e);
    return NextResponse.json({ error: e?.message || "upload error" }, { status: 500 });
  }
}