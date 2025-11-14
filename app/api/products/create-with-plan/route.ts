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

    // Verify user from iframe token
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

    console.log("[create-with-plan] Authenticated user", {
      userId: whopUser.userId,
      companyId: whopUser.companyId,
    });

    // Parse request body
    const body = (await req.json()) as Partial<CreateProductWithPlanBody>;

    if (!body.title || typeof body.priceCents !== "number" || !body.fileKey) {
      return NextResponse.json(
        { error: "Missing required fields: title, priceCents, fileKey" },
        { status: 400 }
      );
    }

    // Get or create user in our database
    let user = await prisma.user.findUnique({
      where: { whopUserId: whopUser.userId },
      include: { company: true },
    });

    if (!user) {
      console.log("[create-with-plan] Creating user on first use", {
        whopUserId: whopUser.userId,
        companyId: whopUser.companyId,
      });

      user = await prisma.user.create({
        data: {
          whopUserId: whopUser.userId,
          role: "seller",
          companyId: whopUser.companyId ? await getOrCreateCompany(whopUser.companyId) : null,
        },
        include: { company: true },
      });
    }

    // If user has companyId from token but not in DB, link them
    if (whopUser.companyId && !user.companyId) {
      const companyId = await getOrCreateCompany(whopUser.companyId);
      user = await prisma.user.update({
        where: { id: user.id },
        data: { companyId },
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

      try {
        whopProductId = await createWhopProduct({
          apiKey: appApiKey,
          companyId: whopUser.companyId,
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
        console.error("[create-with-plan] Failed to create Whop product", {
          error: productError instanceof Error ? productError.message : String(productError),
        });

        // Check if it's a permissions error
        if (productError instanceof Error && productError.message.includes("401")) {
          return NextResponse.json(
            {
              error: "Missing app permissions",
              details: "The app API key doesn't have permission to create products. Please add 'products:create' permission in Whop dashboard.",
              hint: "Go to Whop Developer Dashboard → Your App → Permissions → Add 'products:create'",
            },
            { status: 403 }
          );
        }

        return NextResponse.json(
          {
            error: "Failed to create Whop product",
            details: productError instanceof Error ? productError.message : "Unknown error",
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
  const body: Record<string, unknown> = {
    name,
    visibility: "hidden",
  };

  // Add company_id if available
  if (companyId) {
    body.company_id = companyId;
  }

  const response = await fetch("https://api.whop.com/api/v2/products", {
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

  if (!response.ok) {
    const errorMessage = typeof payload === "object" && payload !== null && "error" in payload
      ? JSON.stringify(payload)
      : responseText;
    
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

  return product.id;
}
