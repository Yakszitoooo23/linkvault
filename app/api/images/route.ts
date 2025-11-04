import { NextRequest, NextResponse } from "next/server";
import { getDownloadUrl } from "@/lib/storage";

// Force dynamic rendering for image serving
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileKey = searchParams.get('fileKey');
    
    if (!fileKey) {
      return NextResponse.json({ error: "fileKey is required" }, { status: 400 });
    }

    // In dev mode, return a placeholder image
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

    // In production, proxy the image through our API
    try {
      const imageUrl = await getDownloadUrl(fileKey, 3600);
      
      // Fetch the image from S3
      const imageResponse = await fetch(imageUrl);
      
      if (!imageResponse.ok) {
        throw new Error('Failed to fetch image from S3');
      }

      // Get the image data
      const imageBuffer = await imageResponse.arrayBuffer();
      
      // Determine content type
      const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
      
      // Return the image with proper headers
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600, must-revalidate',
        },
      });
    } catch (s3Error) {
      console.error("S3 fetch error:", s3Error);
      // Return placeholder if S3 fetch fails
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
    }
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
