import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/uploadToR2";
import { isR2Configured } from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileName = formData.get("fileName") as string | null;
    const contentType = formData.get("contentType") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        {
          error:
            "Cloudflare R2 is not configured. Please set R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET or legacy FILE_* variables.",
        },
        { status: 500 },
      );
    }

    const originalName = fileName || file.name || "image";
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const inferredExt = inferExt(contentType || file.type);
    const { key, contentType: storedContentType, publicUrl } = await uploadToR2({
      buffer,
      originalName,
      forcedExt: inferredExt ?? undefined,
    });

    return NextResponse.json({
      url: publicUrl ?? `/api/images?fileKey=${encodeURIComponent(key)}`,
      fileKey: key,
      contentType: storedContentType,
    });
  } catch (e: any) {
    console.error("[Upload Image] Error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to upload image" },
      { status: 500 },
    );
  }
}

function inferExt(contentType?: string | null): "png" | "webp" | "jpg" | "jpeg" | "svg" | null {
  if (!contentType) return null;
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("jpeg")) return "jpeg";
  if (contentType.includes("jpg")) return "jpg";
  return null;
}

