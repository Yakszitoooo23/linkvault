import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { safe } from "@/lib/sanitize";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getR2Bucket, getR2PublicBase } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileName = formData.get("fileName") as string | null;
    const contentType = formData.get("contentType") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Check for Supabase environment variables (optional)
    const hasSupabaseConfig = 
      process.env.SUPABASE_URL && 
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (hasSupabaseConfig) {
      // Only import Supabase at runtime if config is present
      return await uploadToSupabase(file, fileName || "image", contentType);
    }

    // Check for R2/S3 configuration (preferred if Supabase not available)
    const hasR2Config = 
      process.env.FILE_ENDPOINT && 
      process.env.FILE_ACCESS_KEY_ID && 
      process.env.FILE_SECRET_ACCESS_KEY;

    if (hasR2Config) {
      try {
        return await uploadToR2(file, fileName || "image", contentType);
      } catch (r2Error: any) {
        console.error("[Upload Image] R2 upload failed:", r2Error);
        // Return detailed error
        return NextResponse.json(
          { 
            error: `R2 upload failed: ${r2Error?.message || 'Unknown error'}. Please check your R2 configuration.` 
          },
          { status: 500 }
        );
      }
    }

    // Only allow local storage in development
    if (process.env.NODE_ENV === "development") {
      return await uploadToLocal(file, fileName || "image");
    }

    // Production without storage config is an error
    console.error("[Upload Image] No storage configured. R2:", {
      FILE_BUCKET: !!process.env.FILE_BUCKET,
      FILE_ENDPOINT: !!process.env.FILE_ENDPOINT,
      FILE_ACCESS_KEY_ID: !!process.env.FILE_ACCESS_KEY_ID,
      FILE_SECRET_ACCESS_KEY: !!process.env.FILE_SECRET_ACCESS_KEY,
      R2_PUBLIC_BASE: !!process.env.R2_PUBLIC_BASE,
    });
    
    return NextResponse.json(
      { 
        error: "Image upload not configured. Please set R2 environment variables (FILE_BUCKET, FILE_ENDPOINT, FILE_ACCESS_KEY_ID, FILE_SECRET_ACCESS_KEY, R2_PUBLIC_BASE) or Supabase variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)." 
      },
      { status: 500 }
    );
  } catch (e: any) {
    console.error("Image upload error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to upload image" },
      { status: 500 }
    );
  }
}

async function uploadToSupabase(
  file: File,
  fileName: string,
  contentType: string | null
): Promise<NextResponse> {
  try {
    // Dynamic import to avoid breaking build if package not installed
    // Use variable to prevent webpack from statically analyzing this import
    const supabasePkg = "@supabase/supabase-js";
    // @ts-ignore - Supabase is optional dependency
    const supabaseModule = await import(supabasePkg).catch(() => {
      throw new Error("@supabase/supabase-js not installed. Run: pnpm install @supabase/supabase-js");
    });
    
    const createClient = supabaseModule.createClient;
    
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const bucketName = process.env.SUPABASE_COVERS || process.env.SUPABASE_BUCKET || "covers";
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // Generate safe filename
    const ext = fileName.split(".").pop() || "jpg";
    const safeFileName = safe(fileName);
    const uniqueId = crypto.randomUUID();
    const filePath = `covers/${uniqueId}-${safeFileName}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: contentType || file.type,
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    // Get public URL or create signed URL
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    let imageUrl = publicUrlData.publicUrl;

    // If bucket is private, create a signed URL
    if (!publicUrlData.publicUrl || !imageUrl.startsWith("http")) {
      const { data: signedUrlData } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, 7 * 24 * 60 * 60); // 7 days

      if (signedUrlData?.signedUrl) {
        imageUrl = signedUrlData.signedUrl;
      }
    }

    return NextResponse.json({
      url: imageUrl,
      fileKey: filePath,
    });
  } catch (e: any) {
    console.error("Supabase upload error:", e);
    throw e;
  }
}

async function uploadToR2(
  file: File,
  fileName: string,
  contentType: string | null
): Promise<NextResponse> {
  try {
    const s3 = getR2Client();
    const bucket = getR2Bucket();
    const publicBase = getR2PublicBase();

    // Generate safe filename
    const ext = fileName.split(".").pop() || "jpg";
    const safeFileName = safe(fileName);
    const uniqueId = crypto.randomUUID();
    const key = `images/${uniqueId}-${safeFileName}.${ext}`;

    console.log(`[Upload Image] Uploading to R2 bucket: ${bucket}, key: ${key}`);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || file.type || `image/${ext}`,
    });

    try {
      await s3.send(command);
      console.log(`[Upload Image] Successfully uploaded to R2 bucket: ${bucket}, key: ${key}`);
    } catch (uploadError: any) {
      console.error(`[Upload Image] Upload failed. Bucket: ${bucket}, Key: ${key}, Error:`, uploadError);
      throw uploadError;
    }

    // Return public URL using R2_PUBLIC_BASE
    const publicUrl = `${publicBase}/${key}`;
    
    return NextResponse.json({
      url: publicUrl,
      fileKey: key,
    });
  } catch (e: any) {
    console.error("R2 upload error:", e);
    throw e;
  }
}

async function uploadToLocal(
  file: File,
  fileName: string
): Promise<NextResponse> {
  // In production, local file writes are not allowed
  // This function should only be used in development mode
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Local file storage is not allowed in production. Please configure S3 or Supabase for image storage."
    );
  }

  try {
    const safeFileName = safe(fileName);
    const uniqueId = crypto.randomUUID();
    const ext = fileName.split(".").pop() || "jpg";
    const filename = `${uniqueId}-${safeFileName}.${ext}`;

    // Create uploads directory if it doesn't exist (development only)
    const publicDir = join(process.cwd(), "public", "uploads");
    try {
      await fs.access(publicDir);
    } catch {
      await fs.mkdir(publicDir, { recursive: true });
    }

    // Save file (development only)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filePath = join(publicDir, filename);
    await fs.writeFile(filePath, buffer);

    const url = `/uploads/${filename}`;

    return NextResponse.json({
      url,
      fileKey: filename,
    });
  } catch (e: any) {
    console.error("Local upload error:", e);
    throw e;
  }
}

