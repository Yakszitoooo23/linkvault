import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

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
    
    // DEV mode: bypass S3 storage
    if (process.env.DEV_NO_STORAGE === "true") {
      return NextResponse.json({ 
        fileKey: `dev-${Date.now()}.txt` 
      });
    }
    
    // Check if S3 is configured
    if (!env.FILE_BUCKET || !env.FILE_REGION || !env.FILE_ACCESS_KEY_ID || !env.FILE_SECRET_ACCESS_KEY) {
      console.error("[Upload API] S3 not configured. Missing environment variables.");
      return NextResponse.json({ 
        error: "S3 storage not configured. Please set FILE_BUCKET, FILE_REGION, FILE_ACCESS_KEY_ID, and FILE_SECRET_ACCESS_KEY environment variables." 
      }, { status: 500 });
    }
    
    // Configure S3 client with endpoint support for Cloudflare R2
    const clientConfig: any = {
      region: env.FILE_REGION,
      credentials: {
        accessKeyId: env.FILE_ACCESS_KEY_ID,
        secretAccessKey: env.FILE_SECRET_ACCESS_KEY,
      },
    };
    
    const endpoint = process.env.FILE_ENDPOINT;
    if (endpoint) {
      clientConfig.endpoint = endpoint;
      clientConfig.forcePathStyle = true; // Required for R2
    }
    
    const s3Client = new S3Client(clientConfig);
    
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Upload directly to S3/R2
    const command = new PutObjectCommand({
      Bucket: env.FILE_BUCKET!,
      Key: fileKey,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    });
    
    await s3Client.send(command);
    
    return NextResponse.json({ fileKey });
  } catch (e: any) {
    console.error("[Upload API] Error:", e);
    return NextResponse.json({ error: e?.message || "upload error" }, { status: 500 });
  }
}