import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@whop-apps/sdk";

import { prisma } from "@/lib/db";
import {
  WhopApiError,
  ensureCompanyAccessToken,
  createCompanyPlan,
} from "@/lib/whop";

// Helper to extract access token from request headers
function getAccessTokenFromHeaders(headers: Headers): string | null {
  // Try standard OAuth Bearer token first
  const authHeader = headers.get("authorization") || headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  
  // Try Whop user token (session token - might work for some API calls)
  const whopUserToken = headers.get("x-whop-user-token");
  if (whopUserToken) {
    console.log("[create-with-plan] Found x-whop-user-token, attempting to use it");
    return whopUserToken;
  }
  
  return null;
}

// Helper to fetch user info from Whop API
async function fetchWhopUserInfo(accessToken: string): Promise<{ id: string }> {
  const response = await fetch("https://api.whop.com/api/v2/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Whop user (${response.status})`);
  }

  return (await response.json()) as { id: string };
}

// Helper to fetch companies from Whop API
async function fetchWhopCompanies(accessToken: string): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch("https://api.whop.com/api/v5/me/companies", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      `Failed to fetch Whop companies (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  const companies = (await response.json()) as { data?: Array<{ id: string; name: string }> };
  return companies.data ?? [];
}

// Helper to ensure company product exists
async function ensureCompanyProduct(accessToken: string): Promise<string> {
  const response = await fetch("https://api.whop.com/api/v5/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "LinkVault Digital Products",
      visibility: "hidden",
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      `Failed to create Whop product (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  const product = (await response.json()) as { id?: string };
  if (!product.id) {
    throw new Error("Whop product creation response missing id");
  }
  return product.id;
}

type CreateProductWithPlanBody = {
  title: string;
  description?: string | null;
  priceCents: number;
  currency?: string;
  fileKey: string;
  imageKey?: string | null;
  imageUrl?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CreateProductWithPlanBody>;

    if (!body.title || typeof body.priceCents !== "number" || !body.fileKey) {
      return NextResponse.json(
        { error: "Missing required fields: title, priceCents, fileKey" },
        { status: 400 }
      );
    }

    const tokenData = await validateToken({ headers: headers() });
    
    // Log the full token data to understand what we're getting
    console.log("[create-with-plan] Full token validation result", {
      tokenData: JSON.stringify(tokenData, null, 2),
      tokenDataType: typeof tokenData,
      tokenDataKeys: tokenData ? Object.keys(tokenData) : [],
    });

    const { userId: whopUserId, companyId: tokenCompanyId } = (tokenData || {}) as {
      userId?: string;
      companyId?: string;
      [key: string]: unknown;
    };

    console.log("[create-with-plan] Extracted token values", {
      userId: whopUserId,
      tokenCompanyId,
      userIdType: typeof whopUserId,
      userIdLength: whopUserId?.length,
    });

    if (!whopUserId) {
      console.error("[create-with-plan] No userId in token", { tokenData });
      return NextResponse.json(
        { 
          error: "Authentication required",
          details: "No user ID found in authentication token. Please reinstall the app.",
        },
        { status: 401 }
      );
    }

    // Try to find user by whopUserId first (from token - this should be the Whop user ID like usr_xxx)
    let user = await prisma.user.findUnique({
      where: { whopUserId },
      include: {
        company: true,
      },
    });

    console.log("[create-with-plan] User lookup by whopUserId", {
      searchedFor: whopUserId,
      found: !!user,
      userId: user?.id,
      userWhopUserId: user?.whopUserId,
      userCompanyId: user?.companyId,
    });

    // If not found, try by internal id (validateToken might return internal id)
    if (!user) {
      console.log("[create-with-plan] User not found by whopUserId, trying by id", {
        whopUserId,
      });
      user = await prisma.user.findUnique({
        where: { id: whopUserId },
        include: {
          company: true,
        },
      });
      console.log("[create-with-plan] User lookup by id", {
        searchedFor: whopUserId,
        found: !!user,
        userId: user?.id,
      });
    }

    // SOLUTION A: Create user on first use if they don't exist
    if (!user) {
      console.log("[create-with-plan] User not found, creating user on first use (Solution A)", {
        whopUserId,
        tokenCompanyId,
      });

      // Create user immediately with companyId: null
      // OAuth callback will update with company info later when user installs the app
      user = await prisma.user.create({
        data: {
          whopUserId,
          role: "seller",
          companyId: null, // Will be set when OAuth runs
        },
        include: {
          company: true,
        },
      });

      console.log("[create-with-plan] User created on first use", {
        userId: user.id,
        whopUserId: user.whopUserId,
        companyId: user.companyId,
      });
    }


    // If user doesn't have a company but token has companyId, try to link it
    if (!user.company && tokenCompanyId) {
      console.log("[create-with-plan] User missing company, attempting to link from token", {
        userId: user.id,
        tokenCompanyId,
      });

      const company = await prisma.company.findUnique({
        where: { whopCompanyId: tokenCompanyId },
      });

      if (company) {
        console.log("[create-with-plan] Found company from token, linking user", {
          userId: user.id,
          companyId: company.id,
        });
        user = await prisma.user.update({
          where: { id: user.id },
          data: { companyId: company.id },
          include: { company: true },
        });
      } else {
        console.warn("[create-with-plan] Company from token not found in database", {
          tokenCompanyId,
        });
      }
    }

    // Check if user has a company (required for product creation)
    if (!user.company) {
      console.error("[create-with-plan] User is not linked to a Whop company", {
        userId: user.id,
        whopUserId: user.whopUserId,
        companyId: user.companyId,
        tokenCompanyId,
      });
      
      // Solution A: User was created on first use, but needs OAuth to get company
      return NextResponse.json(
        {
          error: "Company setup required",
          details: "Your account has been created, but you need to complete the app installation to set up your company.",
          hint: "Go to your Whop dashboard → Apps → Install this app. This will link your account to your company and enable product creation.",
          action: "oauth_required",
          userId: user.id, // Return user ID so frontend knows user exists
        },
        { status: 403 }
      );
    }

    const company = user.company;

    if (!company.whopProductId) {
      console.error("Company missing Whop product", {
        companyId: company.id,
        whopCompanyId: company.whopCompanyId,
      });
      return NextResponse.json(
        { error: "Company is not configured with a Whop product. Please reinstall the app." },
        { status: 400 }
      );
    }

    const accessToken = await ensureCompanyAccessToken({
      id: company.id,
      whopAccessToken: company.whopAccessToken,
      whopRefreshToken: company.whopRefreshToken,
      tokenExpiresAt: company.tokenExpiresAt,
    });

    const product = await prisma.product.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        priceCents: body.priceCents,
        currency: (body.currency ?? "USD").toUpperCase(),
        fileKey: body.fileKey,
        imageKey: body.imageKey ?? null,
        imageUrl: body.imageUrl ?? null,
        companyId: company.id,
      },
    });

    try {
      const planId = await createCompanyPlan({
        accessToken,
        whopProductId: company.whopProductId,
        priceCents: product.priceCents,
        currency: product.currency.toLowerCase(),
        metadata: {
          linkVaultProductId: product.id,
          companyId: company.whopCompanyId,
        },
      });

      const productWithPlan = await prisma.product.update({
        where: { id: product.id },
        data: { planId },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              whopCompanyId: true,
              whopProductId: true,
            },
          },
        },
      });

      return NextResponse.json({ product: productWithPlan }, { status: 201 });
    } catch (planError) {
      await prisma.product
        .delete({ where: { id: product.id } })
        .catch((deleteErr) => console.error("Failed to rollback product after plan error", deleteErr));
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

