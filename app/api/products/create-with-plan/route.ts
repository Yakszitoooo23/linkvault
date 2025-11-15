import { NextRequest, NextResponse } from "next/server";
import { verifyWhopUser, verifyAppPermissions } from "@/lib/whopAuth";
import { prisma } from "@/lib/db";
import { createCheckoutConfigurationForProduct } from "@/lib/whop";

type CreateProductWithPlanBody = {
  title: string;
  description?: string | null;
  priceCents: number;
  currency?: string;
  fileKey: string;
  imageKey?: string | null;
  imageUrl?: string | null;
  companyId: string; // Required: must come from URL/request
};

/**
 * Create a product in our database and create a Whop checkout configuration
 * Uses iframe auth (x-whop-user-token) + App API Key
 * Creates checkout configuration with inline plan (no Whop Products API needed)
 */
export async function POST(req: NextRequest) {
  try {
    // Verify app permissions
    const permissions = verifyAppPermissions();
    if (!permissions.hasApiKey) {
      return NextResponse.json(
        {
          error: "App configuration error",
          details: "WHOP_API_KEY is not configured. Please set it in Vercel environment variables.",
          missing: permissions.missing,
        },
        { status: 500 }
      );
    }

    // Verify user from iframe token (for userId only)
    const whopUser = await verifyWhopUser();
    if (!whopUser) {
      return NextResponse.json(
        {
          error: "Authentication required",
          details: "Invalid or missing Whop user token. Please ensure you're accessing this app from within Whop.",
        },
        { status: 401 }
      );
    }

    // Parse request body
    const body = (await req.json()) as Partial<CreateProductWithPlanBody>;
    
    // Log raw request body for debugging
    console.log("[create-with-plan] Raw request body:", {
      ...body,
      fileKey: body.fileKey ? `${body.fileKey.substring(0, 20)}...` : null,
      imageKey: body.imageKey ? `${body.imageKey.substring(0, 20)}...` : null,
      hasCompanyId: !!body.companyId,
      companyId: body.companyId,
      companyIdType: typeof body.companyId,
    });

    // Validate required fields
    if (!body.title || typeof body.priceCents !== "number" || !body.fileKey) {
      return NextResponse.json(
        { error: "Missing required fields: title, priceCents, fileKey" },
        { status: 400 }
      );
    }

    // CRITICAL: companyId must come from request body (URL-derived)
    if (!body.companyId || typeof body.companyId !== "string") {
      console.error("[create-with-plan] ❌ ERROR: companyId is missing from request body", {
        bodyKeys: Object.keys(body),
        body: {
          ...body,
          fileKey: body.fileKey ? `${body.fileKey.substring(0, 20)}...` : null,
          imageKey: body.imageKey ? `${body.imageKey.substring(0, 20)}...` : null,
        },
      });
      return NextResponse.json(
        {
          error: "Company ID required",
          details: "companyId must be provided in the request body. It should come from the URL (e.g., /dashboard/[companyId]).",
        },
        { status: 400 }
      );
    }

    const companyId = body.companyId;
    
    console.log("[create-with-plan] Parsed companyId:", companyId);
    
    console.log("[create-with-plan] Authenticated user", {
      userId: whopUser.userId,
      companyIdFromRequest: companyId,
    });

    // Get or create user in our database
    let user = await prisma.user.findUnique({
      where: { whopUserId: whopUser.userId },
      include: { company: true },
    });

    if (!user) {
      console.log("[create-with-plan] Creating user on first use", {
        whopUserId: whopUser.userId,
        companyId: companyId,
      });

      user = await prisma.user.create({
        data: {
          whopUserId: whopUser.userId,
          role: "seller",
          companyId: await getOrCreateCompany(companyId),
        },
        include: { company: true },
      });
    }

    // If user doesn't have companyId in DB, link them to the company from request
    if (!user.companyId) {
      const dbCompanyId = await getOrCreateCompany(companyId);
      user = await prisma.user.update({
        where: { id: user.id },
        data: { companyId: dbCompanyId },
        include: { company: true },
      });
    }

    // Create product in our database
    const product = await prisma.product.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        priceCents: body.priceCents,
        currency: (body.currency ?? "USD").toUpperCase(),
        fileKey: body.fileKey,
        imageKey: body.imageKey ?? null,
        imageUrl: body.imageUrl ?? null,
        userId: user.id,
        companyId: user.companyId,
      },
    });

    // Create Whop checkout configuration with inline plan
    try {
      console.log("[create-with-plan] Creating Whop checkout configuration for product", {
        productId: product.id,
        companyId: companyId,
        priceCents: product.priceCents,
        currency: product.currency,
      });

      const checkoutConfig = await createCheckoutConfigurationForProduct({
        companyId: companyId, // Whop company ID (biz_xxx)
        priceCents: product.priceCents,
        currency: product.currency,
        productId: product.id,
        whopUserId: user.whopUserId,
        creatorUserId: user.id,
      });

      // Update product with checkout configuration details
      const productWithCheckout = await prisma.product.update({
        where: { id: product.id },
        data: {
          planId: checkoutConfig.planId,
          whopCheckoutConfigurationId: checkoutConfig.checkoutConfigId,
          whopPurchaseUrl: checkoutConfig.purchaseUrl,
        },
        include: {
          user: {
            select: {
              id: true,
              whopUserId: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              whopCompanyId: true,
            },
          },
        },
      });

      console.log("[create-with-plan] Product created with checkout configuration", {
        productId: productWithCheckout.id,
        checkoutConfigId: checkoutConfig.checkoutConfigId,
        planId: checkoutConfig.planId,
        hasPurchaseUrl: !!checkoutConfig.purchaseUrl,
      });

      return NextResponse.json({ product: productWithCheckout }, { status: 201 });
    } catch (checkoutError) {
      // Log error but don't rollback product creation (MVP: allow products without checkout)
      console.error("[create-with-plan] Failed to create checkout configuration for product", {
        productId: product.id,
        error: checkoutError instanceof Error ? checkoutError.message : String(checkoutError),
        companyId: companyId,
      });

      // For MVP, we'll return the product even if checkout config creation failed
      // In production, you might want to rollback or mark the product as needing setup
      const productWithoutCheckout = await prisma.product.findUnique({
        where: { id: product.id },
        include: {
          user: {
            select: {
              id: true,
              whopUserId: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              whopCompanyId: true,
            },
          },
        },
      });

      return NextResponse.json(
        {
          product: productWithoutCheckout,
          warning: "Product created but checkout configuration failed. Please try again or contact support.",
          error: checkoutError instanceof Error ? checkoutError.message : "Unknown error",
        },
        { status: 201 }
      );
    }
  } catch (error) {
    console.error("create-with-plan error:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Unexpected error while creating product and checkout configuration" },
      { status: 500 }
    );
  }
}

/**
 * Get or create company record
 */
async function getOrCreateCompany(whopCompanyId: string): Promise<string> {
  const company = await prisma.company.upsert({
    where: { whopCompanyId },
    create: {
      whopCompanyId,
      name: `Company ${whopCompanyId}`, // Will be updated if we get name from API
      isActive: true,
    },
    update: {},
  });

  return company.id;
}

