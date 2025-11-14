import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@whop-apps/sdk";

import { prisma } from "@/lib/db";
import {
  WhopApiError,
  createCompanyPlan,
} from "@/lib/whop";

// Helper to extract access token from request headers
function getAccessTokenFromHeaders(headers: Headers): string | null {
  // Try standard OAuth Bearer token first
  const authHeader = headers.get("authorization") || headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  
  // Check for other possible OAuth token headers
  const possibleTokenHeaders = [
    "x-whop-access-token",
    "x-whop-oauth-token",
    "whop-access-token",
    "whop-oauth-token",
  ];
  
  for (const headerName of possibleTokenHeaders) {
    const token = headers.get(headerName);
    if (token) {
      console.log(`[create-with-plan] Found ${headerName}, attempting to use it`);
      return token;
    }
  }
  
  // Try Whop user token (session token - might work for some API calls, but probably won't)
  const whopUserToken = headers.get("x-whop-user-token");
  if (whopUserToken) {
    console.log("[create-with-plan] Found x-whop-user-token (session token, may not work for API calls)");
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
  const isApiKey = accessToken.startsWith("apik_");
  console.log("[ensureCompanyProduct] Attempting to create Whop product", {
    tokenLength: accessToken.length,
    tokenPrefix: accessToken.substring(0, 20) + "...",
    endpoint: "https://api.whop.com/api/v5/products",
    usingApiKey: isApiKey,
    usingOAuthToken: !isApiKey,
  });

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

  const responseText = await response.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = responseText;
  }

  console.log("[ensureCompanyProduct] Whop API response", {
    status: response.status,
    statusText: response.statusText,
    payload,
    headers: Object.fromEntries(response.headers.entries()),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create Whop product (${response.status}): ${JSON.stringify(payload)}`
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

    const requestHeaders = headers();
    const tokenData = await validateToken({ headers: requestHeaders });
    
    // Log the full token data and all headers to understand what we're getting
    console.log("[create-with-plan] Full token validation result", {
      tokenData: JSON.stringify(tokenData, null, 2),
      tokenDataType: typeof tokenData,
      tokenDataKeys: tokenData ? Object.keys(tokenData) : [],
    });
    
    // Log all headers to see if there's an OAuth token somewhere
    const allHeaders: Record<string, string> = {};
    requestHeaders.forEach((value, key) => {
      allHeaders[key] = key.toLowerCase().includes('token') || key.toLowerCase().includes('auth') 
        ? value.substring(0, 20) + '...' 
        : value;
    });
    console.log("[create-with-plan] Request headers (tokens masked):", allHeaders);

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
    let user: any = await prisma.user.findUnique({
      where: { whopUserId },
      include: {
        company: true, // Keep for backward compatibility
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
      });

      console.log("[create-with-plan] User created on first use", {
        userId: user.id,
        whopUserId: user.whopUserId,
        companyId: user.companyId,
      });
    }


    // SOLUTION 1: Use user's product and tokens (no company required)
    // If user doesn't have whopProductId, try to create it on-demand
    if (!user.whopProductId) {
      console.log("[create-with-plan] User missing whopProductId, attempting to create on-demand", {
        userId: user.id,
        whopUserId: user.whopUserId,
        hasAccessToken: !!user.whopAccessToken,
      });

      // Try to get access token from user or request headers
      const requestHeaders = headers();
      const headerToken = getAccessTokenFromHeaders(requestHeaders);
      
      console.log("[create-with-plan] Token availability check", {
        userId: user.id,
        hasUserToken: !!user.whopAccessToken,
        hasHeaderToken: !!headerToken,
        headerTokenType: headerToken ? "x-whop-user-token (session token)" : "none",
      });

      // For Whop Apps, we might be able to use the App API Key instead of OAuth tokens
      // Try App API Key first, then OAuth token, then header token as last resort
      const appApiKey = process.env.WHOP_API_KEY;
      const accessTokenToUse = appApiKey || user.whopAccessToken;
      
      console.log("[create-with-plan] Token selection", {
        hasAppApiKey: !!appApiKey,
        hasUserOAuthToken: !!user.whopAccessToken,
        usingAppApiKey: !!appApiKey,
        usingOAuthToken: !appApiKey && !!user.whopAccessToken,
      });

      if (!accessTokenToUse) {
        console.error("[create-with-plan] No OAuth access token available to create Whop product", {
          userId: user.id,
          hasUserToken: !!user.whopAccessToken,
          hasHeaderToken: !!headerToken,
          note: "x-whop-user-token is a session token and cannot be used for API calls",
        });
        return NextResponse.json(
          {
            error: "Product setup required",
            details: "Your account needs to be set up with a Whop product. Please complete the app installation via OAuth.",
            hint: "The OAuth callback must run to get a valid access token. Check that your redirect URL is configured correctly in Whop dashboard.",
            action: "oauth_required",
            userId: user.id,
            troubleshooting: {
              redirectUrl: "Should be: https://linkvault-five.vercel.app/api/auth/callback",
              checkOAuthLogs: "Look for '[OAuth Callback] ====== CALLBACK CALLED ======' in Vercel logs",
            },
          },
          { status: 403 }
        );
      }

      try {
        console.log("[create-with-plan] Creating Whop product on-demand...");
        const whopProductId = await ensureCompanyProduct(accessTokenToUse);
        
        // Update user with the new product ID and tokens
        const updateData: any = { whopProductId };
        if (headerToken && !user.whopAccessToken) {
          updateData.whopAccessToken = headerToken;
          updateData.tokenExpiresAt = new Date(Date.now() + 3600 * 1000); // Assume 1 hour
        }

        await prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });

        // Update user object for rest of function
        (user as any).whopProductId = whopProductId;
        (user as any).whopAccessToken = accessTokenToUse;

        console.log("[create-with-plan] Whop product created on-demand", {
          userId: user.id,
          whopProductId,
        });
      } catch (productError) {
        console.error("[create-with-plan] Failed to create Whop product on-demand", {
          userId: user.id,
          error: productError instanceof Error ? productError.message : String(productError),
        });
        return NextResponse.json(
          {
            error: "Failed to set up Whop product",
            details: productError instanceof Error ? productError.message : "Unknown error",
            hint: "Please try reinstalling the app from the Whop dashboard.",
            action: "oauth_required",
          },
          { status: 500 }
        );
      }
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
      await (prisma.user.update as any)({
        where: { id: user.id },
        data: {
          whopAccessToken: tokenData.access_token,
          whopRefreshToken: tokenData.refresh_token ?? user.whopRefreshToken,
          tokenExpiresAt: newExpiresAt,
        },
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

