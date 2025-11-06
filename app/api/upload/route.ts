import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "@/lib/r2";

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

    if (
      !process.env.R2_ACCOUNT_ID ||
      !process.env.R2_ACCESS_KEY_ID ||
      !process.env.R2_SECRET_ACCESS_KEY ||
      !process.env.R2_BUCKET
    ) {
      return NextResponse.json(
        {
          error:
            "Cloudflare R2 is not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.",
        },
        { status: 500 },
      );
    }
    
    try {
      console.log(`[Upload API] Uploading to R2 bucket: ${process.env.R2_BUCKET}, key: ${fileKey}`);

      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Upload directly to R2
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: fileKey,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      });
      
      await r2.send(command);
      console.log(`[Upload API] Successfully uploaded to R2 bucket: ${process.env.R2_BUCKET}, key: ${fileKey}`);
      
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