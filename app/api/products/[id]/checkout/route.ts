import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAppApiKey } from "@/lib/whopAuth";
import { createCheckoutConfigurationForProduct, createCompanyPlan } from "@/lib/whop";

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

    // Determine origin for redirect URLs
    const origin = req.nextUrl.origin;
    const successUrl = `${origin}/products/${product.id}/success`;
    const cancelUrl = `${origin}/products/${product.id}`;

    let planId = product.planId;

    // If planId is missing, create a new plan
    if (!planId) {
      console.log("[checkout] Product missing planId, creating new plan", {
        productId: product.id,
        companyId,
      });

      // Try to use App API Key first (preferred for new flow)
      const appApiKey = getAppApiKey();
      
      if (appApiKey && company.whopProductId) {
        // Use createCompanyPlan with App API Key (requires whopProductId)
        try {
          planId = await createCompanyPlan({
            accessToken: appApiKey,
            whopProductId: company.whopProductId,
            priceCents: product.priceCents,
            currency: product.currency.toLowerCase(),
            releaseMethod: "buy_now",
            visibility: "hidden",
            metadata: {
              linkVaultProductId: product.id,
              companyId: company.whopCompanyId,
            },
          });

          // Save planId to product
          await prisma.product.update({
            where: { id: product.id },
            data: { planId },
          });

          console.log("[checkout] Created plan using App API Key", { planId });
        } catch (planError) {
          console.error("[checkout] Failed to create plan with App API Key", planError);
          // Fall through to try OAuth token or checkout config with inline plan
        }
      }

      // If plan creation failed or we don't have whopProductId, use checkout config with inline plan
      if (!planId) {
        console.log("[checkout] Creating checkout configuration with inline plan", {
          productId: product.id,
          companyId,
        });

        if (!product.user) {
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
          whopUserId: product.user.whopUserId,
          creatorUserId: product.user.id,
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
      }
    }

    // If we have a planId, create checkout configuration using it
    // This handles legacy products that have planId but no checkout config
    if (planId && !product.whopCheckoutConfigurationId) {
      console.log("[checkout] Creating checkout configuration for existing plan", {
        productId: product.id,
        planId,
      });

      const appApiKey = getAppApiKey();
      if (!appApiKey) {
        return NextResponse.json(
          { error: "App API key not configured" },
          { status: 500 }
        );
      }

      // Create checkout configuration with the plan
      const endpoint = "https://api.whop.com/checkout_configurations";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${appApiKey}`,
        },
        body: JSON.stringify({
          plan_id: planId,
          redirect_url: successUrl,
          metadata: {
            productId: product.id,
            companyId: company.whopCompanyId,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[checkout] Failed to create checkout configuration", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Failed to create checkout configuration: ${errorText}`);
      }

      const configData = await response.json() as {
        id?: string;
        purchase_url?: string;
      };

      const checkoutConfigId = configData.id;
      const purchaseUrl = configData.purchase_url;

      if (!purchaseUrl) {
        throw new Error("Checkout configuration response missing purchase_url");
      }

      // Save checkout configuration details
      await prisma.product.update({
        where: { id: product.id },
        data: {
          whopCheckoutConfigurationId: checkoutConfigId || null,
          whopPurchaseUrl: purchaseUrl,
        },
      });

      return NextResponse.json({ checkoutUrl: purchaseUrl }, { status: 200 });
    }

    // If we have whopPurchaseUrl, use it
    if (product.whopPurchaseUrl) {
      return NextResponse.json({ checkoutUrl: product.whopPurchaseUrl }, { status: 200 });
    }

    // Fallback: should not reach here, but handle gracefully
    return NextResponse.json(
      {
        error: "Unable to create checkout",
        details: "Product has planId but checkout configuration could not be created.",
      },
      { status: 500 }
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

