import { NextRequest, NextResponse } from "next/server";
import { getUploadUrl } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const { fileKey } = await req.json();
    if (!fileKey) return NextResponse.json({ error: "fileKey required" }, { status: 400 });
    
    // DEV mode: bypass S3 storage
    if (process.env.DEV_NO_STORAGE === "true") {
      return NextResponse.json({ 
        url: "dev://upload", 
        fileKey: `dev-${Date.now()}.txt` 
      });
    }
    
    const url = await getUploadUrl(fileKey);
    return NextResponse.json({ url, fileKey });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "upload error" }, { status: 500 });
  }
}