import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCheckoutConfigurationForProduct } from "@/lib/whop";

type RouteParams = {
  id: string;
};

/**
 * Creates a Whop checkout configuration/session for a product
 * Returns a checkout URL that redirects to Whop's payment flow
 * 
 * This is the single source of truth for starting checkout.
 * If product.planId is missing, creates a new Whop plan and saves it.
 * Then creates a checkout configuration and returns the checkout URL.
 */
export async function POST(req: NextRequest, { params }: { params: RouteParams }) {
  try {
    const productId = params.id;

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Fetch product with company relation
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        company: {
          select: {
            id: true,
            whopCompanyId: true,
            whopProductId: true,
            whopAccessToken: true,
            whopRefreshToken: true,
            tokenExpiresAt: true,
          },
        },
        user: {
          select: {
            id: true,
            whopUserId: true,
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (!product.isActive) {
      return NextResponse.json({ error: "Product is not available" }, { status: 400 });
    }

    // If product already has whopPurchaseUrl, use it
    if (product.whopPurchaseUrl) {
      return NextResponse.json({ checkoutUrl: product.whopPurchaseUrl }, { status: 200 });
    }

    // Need company to create checkout
    if (!product.company) {
      return NextResponse.json(
        { error: "Product is not associated with a company" },
        { status: 400 }
      );
    }

    const company = product.company;
    const companyId = company.whopCompanyId;

    console.log("[checkout] Starting checkout for product", {
      productId: product.id,
      companyId: companyId || "MISSING",
      hasCompanyId: !!companyId,
      hasWhopPurchaseUrl: !!product.whopPurchaseUrl,
      hasPlanId: !!product.planId,
      priceCents: product.priceCents,
      currency: product.currency,
    });

    // If product already has whopPurchaseUrl, use it
    if (product.whopPurchaseUrl) {
      console.log("[checkout] Using existing whopPurchaseUrl", {
        productId: product.id,
        purchaseUrl: product.whopPurchaseUrl.substring(0, 50) + "...",
      });
      return NextResponse.json({ checkoutUrl: product.whopPurchaseUrl }, { status: 200 });
    }

    // Always use checkout configuration with inline plan (simplified flow)
    console.log("[checkout] Creating checkout configuration with inline plan", {
      productId: product.id,
      companyId,
      priceCents: product.priceCents,
      currency: product.currency,
    });

    if (!product.user) {
      console.error("[checkout] Product creator information is missing", {
        productId: product.id,
      });
      return NextResponse.json(
        { error: "Product creator information is missing" },
        { status: 500 }
      );
    }

    const checkoutConfig = await createCheckoutConfigurationForProduct({
      companyId,
      priceCents: product.priceCents,
      currency: product.currency,
      productId: product.id,
      productTitle: product.title,
      whopUserId: product.user.whopUserId,
      creatorUserId: product.user.id,
    });

    console.log("[checkout] Checkout configuration created successfully", {
      productId: product.id,
      checkoutConfigId: checkoutConfig.checkoutConfigId,
      planId: checkoutConfig.planId,
      hasPurchaseUrl: !!checkoutConfig.purchaseUrl,
    });

    // Save checkout configuration details to product
    await prisma.product.update({
      where: { id: product.id },
      data: {
        planId: checkoutConfig.planId,
        whopCheckoutConfigurationId: checkoutConfig.checkoutConfigId,
        whopPurchaseUrl: checkoutConfig.purchaseUrl,
      },
    });

    return NextResponse.json(
      { checkoutUrl: checkoutConfig.purchaseUrl },
      { status: 200 }
    );
  } catch (error) {
    console.error("[checkout] Error:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Unexpected error creating checkout" },
      { status: 500 }
    );
  }
}

