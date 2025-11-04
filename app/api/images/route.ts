import { NextRequest, NextResponse } from "next/server";
import { getDownloadUrl } from "@/lib/storage";

// Force dynamic rendering for image serving
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileKey = searchParams.get('fileKey');
    const imageUrl = searchParams.get('imageUrl'); // Support direct imageUrl parameter
    
    // If imageUrl is provided and it's a full URL (Supabase), redirect to it
    if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
      try {
        const imageResponse = await fetch(imageUrl);
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
          return new NextResponse(imageBuffer, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600, must-revalidate',
            },
          });
        }
      } catch (fetchError) {
        console.error("Failed to fetch external image URL:", imageUrl, fetchError);
      }
    }
    
    if (!fileKey) {
      return NextResponse.json({ error: "fileKey or imageUrl is required" }, { status: 400 });
    }

    // In dev mode, try to serve from local uploads first
    if (process.env.NODE_ENV === "development" && !process.env.DEV_NO_STORAGE) {
      try {
        const { promises: fs } = await import("fs");
        const { join } = await import("path");
        const publicDir = join(process.cwd(), "public", "uploads");
        const filePath = join(publicDir, fileKey);
        
        // Check if file exists locally
        try {
          await fs.access(filePath);
          const fileBuffer = await fs.readFile(filePath);
          
          // Determine content type from extension
          const ext = fileKey.split('.').pop()?.toLowerCase();
          const contentTypeMap: Record<string, string> = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
          };
          const contentType = contentTypeMap[ext || ''] || 'image/jpeg';
          
          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600, must-revalidate',
            },
          });
        } catch {
          // File doesn't exist locally, fall through to S3
        }
      } catch {
        // Error reading local file, fall through to S3
      }
    }

    // In dev mode with DEV_NO_STORAGE, return a placeholder image
    if (process.env.DEV_NO_STORAGE === "true") {
      const svgPlaceholder = `<svg width="400" height="250" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
        <path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
      </svg>`;
      return new NextResponse(svgPlaceholder, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Try to fetch from S3 (only if S3 is configured)
    if (process.env.FILE_BUCKET && process.env.FILE_ACCESS_KEY_ID && process.env.FILE_SECRET_ACCESS_KEY) {
      try {
        console.log(`[Images API] Attempting to fetch from S3, fileKey: ${fileKey}`);
        const imageUrl = await getDownloadUrl(fileKey, 3600);
        console.log(`[Images API] Generated S3 presigned URL for fileKey: ${fileKey}`);
        
        // Fetch the image from S3
        const imageResponse = await fetch(imageUrl);
        
        if (!imageResponse.ok) {
          console.error(`[Images API] S3 fetch failed: ${imageResponse.status} ${imageResponse.statusText} for fileKey: ${fileKey}`);
          throw new Error(`S3 fetch failed: ${imageResponse.status} ${imageResponse.statusText}`);
        }

        // Get the image data
        const imageBuffer = await imageResponse.arrayBuffer();
        console.log(`[Images API] Successfully fetched image from S3, fileKey: ${fileKey}, size: ${imageBuffer.byteLength} bytes`);
        
        // Determine content type
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        
        // Return the image with proper headers
        return new NextResponse(imageBuffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600, must-revalidate',
          },
        });
      } catch (s3Error: any) {
        console.error(`[Images API] S3 fetch error for fileKey: ${fileKey}`, s3Error?.message || s3Error);
        // Fall through to placeholder
      }
    } else {
      console.warn(`[Images API] S3 not configured, cannot fetch image for fileKey: ${fileKey}. FILE_BUCKET=${!!process.env.FILE_BUCKET}, FILE_ACCESS_KEY_ID=${!!process.env.FILE_ACCESS_KEY_ID}, FILE_SECRET_ACCESS_KEY=${!!process.env.FILE_SECRET_ACCESS_KEY}`);
    }

    // Return placeholder if S3 fetch fails or S3 not configured
    const svgPlaceholder = `<svg width="400" height="250" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
      <path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
    </svg>`;
    return new NextResponse(svgPlaceholder, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (e: any) {
    console.error("Image serving error:", e);
    // Return placeholder on error
    const svgPlaceholder = `<svg width="400" height="250" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
      <path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
    </svg>`;
    return new NextResponse(svgPlaceholder, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache',
      },
    });
  }
}
