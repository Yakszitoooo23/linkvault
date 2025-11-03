import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Product creation request body:", JSON.stringify(body, null, 2));
    
    const { ownerId, title, description, priceCents, fileKey, imageKey, imageUrl, currency, whopPlanId } = body;

    // Default ownerId to "demo-owner" if not provided, then look up the user
    const whopUserId = ownerId || "demo-owner";
    
    // Find or create the user
    const user = await prisma.user.upsert({
      where: { whopUserId },
      create: { whopUserId, role: "seller" },
      update: {}
    });
    
    const finalOwnerId = user.id;

    if (!title || !priceCents || !fileKey) {
      console.error("Missing required fields", { title, priceCents, fileKey });
      return NextResponse.json({ 
        error: "Missing required fields: title, priceCents, and fileKey are required" 
      }, { status: 400 });
    }

    // Validate imageUrl if provided (allow both absolute and relative URLs)
    if (imageUrl && typeof imageUrl === 'string') {
      // Accept URLs that start with http/https (absolute) or / (relative)
      const isValidUrl = imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('/');
      if (!isValidUrl) {
        console.error("Invalid imageUrl format:", imageUrl);
        return NextResponse.json({ 
          error: "Invalid imageUrl format. Must be a valid URL or path starting with /" 
        }, { status: 400 });
      }
    }

    const product = await prisma.product.create({
      data: {
        ownerId: finalOwnerId,
        title,
        description,
        priceCents,
        fileKey,
        imageKey,
        imageUrl,
        currency: currency || "USD",
        whopPlanId: whopPlanId || null,
      },
    });
    
    console.log("Product created successfully:", product.id);

    return NextResponse.json(product);
  } catch (e: any) {
    console.error("Product creation error:", e);
    
    // Handle specific Prisma errors
    if (e.code === 'P2002') {
      return NextResponse.json({ 
        error: "A product with this information already exists" 
      }, { status: 400 });
    }
    
    if (e.code === 'P2003') {
      return NextResponse.json({ 
        error: "Invalid ownerId: The specified owner does not exist" 
      }, { status: 400 });
    }
    
    if (e.code === 'P1001') {
      return NextResponse.json({ 
        error: "Database connection failed. Please check if the database is running and accessible." 
      }, { status: 500 });
    }
    
    if (e.code === 'P2025') {
      return NextResponse.json({ 
        error: "Database table not found. Please run database migrations first." 
      }, { status: 500 });
    }
    
    // Generic error handling
    return NextResponse.json({ 
      error: e?.message || "An unexpected error occurred while creating the product" 
    }, { status: 500 });
  }
}
