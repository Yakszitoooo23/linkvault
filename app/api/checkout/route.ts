import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Creates a Whop checkout session for a product
 * Returns a checkout URL that redirects to Whop's payment flow
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
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (!product.isActive) {
      return NextResponse.json({ error: "Product is not available" }, { status: 400 });
    }

    if (!product.whopPlanId) {
      return NextResponse.json(
        { error: "Product does not have a Whop Plan ID configured. Please add a Whop Plan ID to this product." },
        { status: 400 }
      );
    }

    if (!env.WHOP_API_KEY) {
      return NextResponse.json(
        { error: "Whop API key not configured" },
        { status: 500 }
      );
    }

    // Determine origin from request URL
    const origin = req.nextUrl.origin;

    // Create checkout session using Whop API
    const checkoutResponse = await fetch(
      "https://api.whop.com/v2/checkout_sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHOP_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan_id: product.whopPlanId,
          redirect_urls: {
            success_url: `${origin}/product/${product.id}?status=success`,
            cancel_url: `${origin}/product/${product.id}?status=cancelled`,
          },
          metadata: {
            productId: product.id,
          },
        }),
      }
    );

    if (!checkoutResponse.ok) {
      const errorText = await checkoutResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error("Whop checkout creation failed:", {
        status: checkoutResponse.status,
        statusText: checkoutResponse.statusText,
        body: errorData,
      });
      return NextResponse.json(
        { error: errorData.message || "Failed to create Whop checkout session" },
        { status: 500 }
      );
    }

    const checkoutData = await checkoutResponse.json();
    const checkoutUrl = checkoutData.url || checkoutData.checkout_url;

    if (!checkoutUrl) {
      console.error("No checkout URL in response:", checkoutData);
      return NextResponse.json(
        { error: "No checkout URL returned from Whop API" },
        { status: 500 }
      );
    }

    return NextResponse.json({ checkoutUrl }, { status: 200 });
  } catch (e: any) {
    console.error("Checkout error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to create checkout" },
      { status: 500 }
    );
  }
}
