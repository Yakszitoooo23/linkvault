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
        company: true, // Keep for backward compatibility
      },
    }) as any; // Type assertion needed until migration is applied

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
      }) as any; // Type assertion needed until migration is applied
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
      // OAuth callback will update with OAuth tokens and product ID later when user installs the app
      user = await prisma.user.create({
        data: {
          whopUserId,
          role: "seller",
          companyId: null, // Will be set when OAuth runs (optional)
        },
        include: {
          company: true,
        },
      }) as any; // Type assertion needed until migration is applied

      console.log("[create-with-plan] User created on first use", {
        userId: user.id,
        whopUserId: user.whopUserId,
        companyId: user.companyId,
      });
    }


    // SOLUTION 1: Use user's product and tokens (no company required)
    if (!user.whopProductId || !user.whopAccessToken) {
      console.error("[create-with-plan] User missing Whop product", {
        userId: user.id,
        whopUserId: user.whopUserId,
      });
      return NextResponse.json(
        {
          error: "Product setup required",
          details: "Your account needs to be set up with a Whop product. Please complete the app installation.",
          hint: "Go to your Whop dashboard → Apps → Install this app. This will set up your account and enable product creation.",
          action: "oauth_required",
          userId: user.id,
        },
        { status: 403 }
      );
    }

    // Ensure user's access token is valid (refresh if needed)
    if (!user.whopAccessToken) {
      console.error("[create-with-plan] User missing OAuth access token", {
        userId: user.id,
        whopUserId: user.whopUserId,
      });
      return NextResponse.json(
        {
          error: "Authentication required",
          details: "Your account needs to be authenticated. Please reinstall the app to refresh your tokens.",
          hint: "Go to your Whop dashboard → Apps → Reinstall this app.",
          action: "oauth_required",
        },
        { status: 401 }
      );
    }

    let accessToken = user.whopAccessToken;
    
    if (user.tokenExpiresAt && user.tokenExpiresAt.getTime() <= Date.now()) {
      // Token expired, try to refresh
      if (!user.whopRefreshToken) {
        return NextResponse.json(
          {
            error: "Token expired",
            details: "Your authentication token has expired. Please reinstall the app to refresh it.",
            hint: "Go to your Whop dashboard → Apps → Reinstall this app.",
            action: "oauth_required",
          },
          { status: 401 }
        );
      }

      // Refresh token using the same logic as ensureCompanyAccessToken
      const refreshResponse = await fetch("https://api.whop.com/api/v2/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: user.whopRefreshToken,
          client_id: process.env.WHOP_CLIENT_ID,
          client_secret: process.env.WHOP_CLIENT_SECRET,
        }),
      });

      if (!refreshResponse.ok) {
        return NextResponse.json(
          {
            error: "Token refresh failed",
            details: "Failed to refresh your authentication token. Please reinstall the app.",
            hint: "Go to your Whop dashboard → Apps → Reinstall this app.",
            action: "oauth_required",
          },
          { status: 401 }
        );
      }

      const tokenData = (await refreshResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      accessToken = tokenData.access_token;
      const newExpiresAt = new Date(Date.now() + ((tokenData.expires_in ?? 3600) * 1000));

      // Update user with new tokens
      await prisma.user.update({
        where: { id: user.id },
        data: {
          whopAccessToken: tokenData.access_token,
          whopRefreshToken: tokenData.refresh_token ?? user.whopRefreshToken,
          tokenExpiresAt: newExpiresAt,
        } as any, // Type assertion needed until migration is applied
      });
    }

    // Create product linked to user
    const product = await prisma.product.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        priceCents: body.priceCents,
        currency: (body.currency ?? "USD").toUpperCase(),
        fileKey: body.fileKey,
        imageKey: body.imageKey ?? null,
        imageUrl: body.imageUrl ?? null,
        userId: user.id, // Link to user instead of company
        companyId: user.companyId, // Keep for backward compatibility (nullable)
      } as any, // Type assertion needed until migration is applied
    });

    try {
      const planId = await createCompanyPlan({
        accessToken,
        whopProductId: user.whopProductId,
        priceCents: product.priceCents,
        currency: product.currency.toLowerCase(),
        metadata: {
          linkVaultProductId: product.id,
          userId: user.id,
          whopUserId: user.whopUserId,
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

