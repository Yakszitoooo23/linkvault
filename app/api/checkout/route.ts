import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Returns the Whop purchase URL for a product (if available)
 * 
 * DEPRECATED: New products should use whopPurchaseUrl directly from the Product model.
 * This route is kept for backward compatibility with legacy products.
 */
export async function POST(req: NextRequest) {
  try {
    const { productId } = await req.json();

    if (!productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 });
    }

    // Fetch the product to validate it exists and is active
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        isActive: true,
        whopPurchaseUrl: true,
        whopPlanId: true, // Legacy field
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (!product.isActive) {
      return NextResponse.json({ error: "Product is not available" }, { status: 400 });
    }

    // Prefer whopPurchaseUrl (new flow)
    if (product.whopPurchaseUrl) {
      return NextResponse.json({ checkoutUrl: product.whopPurchaseUrl }, { status: 200 });
    }

    // Fallback: Legacy products without whopPurchaseUrl
    return NextResponse.json(
      {
        error: "Product does not have a checkout URL configured",
        details: "This product was created before checkout configuration was implemented. Please recreate the product or contact support.",
      },
      { status: 400 }
    );
  } catch (e: any) {
    console.error("Checkout error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to get checkout URL" },
      { status: 500 }
    );
  }
}
