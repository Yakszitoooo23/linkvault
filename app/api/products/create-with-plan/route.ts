import { NextRequest, NextResponse } from "next/server";
import { verifyWhopUser, getAppApiKey, verifyAppPermissions } from "@/lib/whopAuth";
import { prisma } from "@/lib/db";
import { WhopApiError, createCompanyPlan } from "@/lib/whop";

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
 * Create a product in our database and create a Whop plan
 * Uses iframe auth (x-whop-user-token) + App API Key
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
    
    // Log final companyId that will be used for Whop API
    console.log("[create-with-plan] Final companyId used for Whop product creation:", companyId);

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

    // Get company's whopProductId (create if needed)
    let whopProductId: string | null = null;
    
    if (user.company) {
      whopProductId = user.company.whopProductId || null;
    } else if (user.whopProductId) {
      whopProductId = user.whopProductId;
    }

    // If no product exists, try to create one using App API Key
    if (!whopProductId) {
      console.log("[create-with-plan] Creating Whop product using App API Key...");
      
      const appApiKey = getAppApiKey();
      if (!appApiKey) {
        return NextResponse.json(
          {
            error: "App configuration error",
            details: "WHOP_API_KEY is required to create products.",
          },
          { status: 500 }
        );
      }

      // Safe debug log: mask API key (first 6 chars + ***)
      const maskedApiKey = appApiKey.length >= 6 
        ? `${appApiKey.substring(0, 6)}***` 
        : "***";
      console.log("[create-with-plan] Using WHOP_API_KEY", {
        isDefined: true,
        length: appApiKey.length,
        masked: maskedApiKey,
        companyId: companyId,
        hasCompanyId: !!companyId,
      });

      // companyId is guaranteed to be present from request body validation above

      try {
        whopProductId = await createWhopProduct({
          apiKey: appApiKey,
          companyId: companyId, // Use companyId from request body
          name: "LinkVault Digital Products",
        });

        // Save product ID to company or user
        if (user.company) {
          await prisma.company.update({
            where: { id: user.company.id },
            data: { whopProductId },
          });
        } else {
          await prisma.user.update({
            where: { id: user.id },
            data: { whopProductId },
          });
        }

        console.log("[create-with-plan] Whop product created", { whopProductId });
      } catch (productError) {
        // Enhanced error logging with all relevant details
        const errorMessage = productError instanceof Error ? productError.message : String(productError);
        const is401 = errorMessage.includes("401");
        
        console.error("[create-with-plan] Failed to create Whop product", {
          error: errorMessage,
          httpStatus: is401 ? 401 : "unknown",
          companyId: companyId,
          hasCompanyId: !!companyId,
          companyIdType: typeof companyId,
          apiKeyDefined: !!appApiKey,
          apiKeyLength: appApiKey?.length || 0,
        });

        // Check if it's a permissions error
        if (is401) {
          return NextResponse.json(
            {
              error: "Missing app permissions or invalid request",
              details: "The app API key doesn't have permission to create products, or the request is missing required fields (e.g., company_id).",
              hint: "1. Add 'products:create' permission in Whop dashboard. 2. Ensure companyId is provided in the request body.",
              troubleshooting: {
                companyId: companyId || "MISSING - This should not happen if validation passed",
                hasApiKey: !!appApiKey,
                suggestion: companyId 
                  ? "Check app permissions in Whop dashboard"
                  : "companyId validation should have caught this - check request body",
              },
            },
            { status: 403 }
          );
        }

        return NextResponse.json(
          {
            error: "Failed to create Whop product",
            details: errorMessage,
          },
          { status: 500 }
        );
      }
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

    // Create Whop plan using App API Key
    if (!whopProductId) {
      return NextResponse.json(
        {
          error: "Product setup incomplete",
          details: "Whop product ID is missing. Please try again.",
        },
        { status: 500 }
      );
    }

    try {
      const appApiKey = getAppApiKey();
      if (!appApiKey) {
        throw new Error("WHOP_API_KEY not configured");
      }

      const planId = await createCompanyPlan({
        accessToken: appApiKey, // Use App API Key instead of OAuth token
        whopProductId,
        priceCents: product.priceCents,
        currency: product.currency.toLowerCase(),
        metadata: {
          linkVaultProductId: product.id,
          userId: user.id,
          whopUserId: user.whopUserId,
          companyId: user.companyId,
        },
      });

      const productWithPlan = await prisma.product.update({
        where: { id: product.id },
        data: { planId },
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

      return NextResponse.json({ product: productWithPlan }, { status: 201 });
    } catch (planError) {
      // Rollback product creation if plan creation fails
      await prisma.product.delete({ where: { id: product.id } }).catch(() => {});

      if (planError instanceof WhopApiError) {
        return NextResponse.json(
          {
            error: planError.message,
            details: planError.details,
          },
          { status: planError.status }
        );
      }

      throw planError;
    }
  } catch (error) {
    console.error("create-with-plan error:", error);

    if (error instanceof WhopApiError) {
      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
        },
        { status: error.status }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Unexpected error while creating product and plan" },
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

/**
 * Create a Whop product using App API Key
 * 
 * IMPORTANT: According to Whop API docs, products may require company_id.
 * If companyId is undefined, the request may fail with 401.
 */
async function createWhopProduct({
  apiKey,
  companyId,
  name,
}: {
  apiKey: string;
  companyId?: string;
  name: string;
}): Promise<string> {
  const endpoint = "https://api.whop.com/api/v2/products";
  
  // CRITICAL: company_id is required for Whop product creation
  // This function should only be called if companyId is defined
  if (!companyId) {
    throw new Error("companyId is required for Whop product creation but was not provided");
  }

  const body: Record<string, unknown> = {
    name,
    visibility: "hidden",
    company_id: companyId, // Always include company_id - it's required
  };

  console.log("[createWhopProduct] Including company_id in request", {
    companyId,
    companyIdType: typeof companyId,
    companyIdLength: companyId.length,
    note: "company_id is required for Whop API",
  });

  // Log request details (safe - no full API key)
  const maskedApiKey = apiKey.length >= 6 ? `${apiKey.substring(0, 6)}***` : "***";
  console.log("[createWhopProduct] Making request to Whop API", {
    endpoint,
    method: "POST",
    hasCompanyId: !!companyId,
    companyId: companyId || "undefined",
    apiKeyMasked: maskedApiKey,
    apiKeyLength: apiKey.length,
    requestBody: {
      name,
      visibility: "hidden",
      company_id: companyId || "NOT INCLUDED",
    },
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = responseText;
  }

  // Enhanced error logging
  if (!response.ok) {
    const errorMessage = typeof payload === "object" && payload !== null && "error" in payload
      ? JSON.stringify(payload)
      : responseText;
    
    console.error("[createWhopProduct] Whop API error response", {
      status: response.status,
      statusText: response.statusText,
      responseBody: payload,
      companyIdUsed: companyId || "undefined",
      hasCompanyId: !!companyId,
      endpoint,
      requestBody: body,
    });
    
    throw new Error(
      `Failed to create Whop product (${response.status}): ${errorMessage}`
    );
  }

  const product = typeof payload === "object" && payload !== null && "id" in payload
    ? (payload as { id?: string })
    : null;

  if (!product?.id) {
    throw new Error(`Whop product creation response missing id: ${JSON.stringify(payload)}`);
  }

  console.log("[createWhopProduct] Product created successfully", {
    productId: product.id,
    companyIdUsed: companyId || "none",
  });

  return product.id;
}
