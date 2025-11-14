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
    endpoint: "https://api.whop.com/api/v2/products",
    usingApiKey: isApiKey,
    usingOAuthToken: !isApiKey,
  });

  const response = await fetch("https://api.whop.com/api/v2/products", {
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
        company: {
          select: {
            id: true,
            whopCompanyId: true,
            name: true,
            whopProductId: true,
            whopAccessToken: true,
            whopRefreshToken: true,
            tokenExpiresAt: true,
          },
        },
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


    // Use company's product if available, otherwise user's product
    // If neither exists, try to create it on-demand
    const whopProductIdToUse = user.company?.whopProductId || user.whopProductId;
    
    if (!whopProductIdToUse) {
      console.log("[create-with-plan] Missing whopProductId, attempting to create on-demand", {
        userId: user.id,
        whopUserId: user.whopUserId,
        companyId: user.company?.id,
        hasCompanyProduct: !!user.company?.whopProductId,
        hasUserProduct: !!user.whopProductId,
        hasCompanyToken: !!user.company?.whopAccessToken,
        hasUserToken: !!user.whopAccessToken,
      });

      // Try to get access token from user, company, or request headers
      const requestHeaders = headers();
      const headerToken = getAccessTokenFromHeaders(requestHeaders);
      
      // Prioritize OAuth tokens (they have permission to create products)
      // App API Key doesn't have permission for product creation
      // Priority: Company OAuth token > User OAuth token > Error
      const companyToken = user.company?.whopAccessToken;
      const userToken = user.whopAccessToken;
      const accessTokenToUse = companyToken || userToken;
      
      console.log("[create-with-plan] Token availability check", {
        userId: user.id,
        hasCompanyToken: !!companyToken,
        hasUserToken: !!userToken,
        hasHeaderToken: !!headerToken,
        headerTokenType: headerToken ? "x-whop-user-token (session token)" : "none",
        usingCompanyToken: !!companyToken,
        usingUserToken: !companyToken && !!userToken,
      });
      
      console.log("[create-with-plan] Token selection", {
        hasCompanyToken: !!companyToken,
        hasUserOAuthToken: !!userToken,
        usingCompanyToken: !!companyToken,
        usingUserOAuthToken: !companyToken && !!userToken,
        note: "App API Key cannot create products - requires OAuth token",
      });

      if (!accessTokenToUse) {
        console.error("[create-with-plan] No OAuth access token available to create Whop product", {
          userId: user.id,
          hasCompanyToken: !!companyToken,
          hasUserToken: !!userToken,
          hasHeaderToken: !!headerToken,
          companyId: user.company?.id,
          note: "OAuth tokens are required to create products. App API Key doesn't have permission.",
        });
        return NextResponse.json(
          {
            error: "Product setup required",
            details: "Your account needs to be set up with OAuth tokens to create Whop products. Please complete the app installation via OAuth.",
            hint: "The OAuth callback must run to get a valid access token. Reinstall the app from your Whop dashboard.",
            action: "oauth_required",
            userId: user.id,
            troubleshooting: {
              redirectUrl: "Should be: https://linkvault-five.vercel.app/api/auth/callback",
              checkOAuthLogs: "Look for '[OAuth Callback] ====== CALLBACK CALLED ======' in Vercel logs",
              solution: "Go to Whop dashboard → Apps → Reinstall LinkVault to trigger OAuth flow",
            },
          },
          { status: 403 }
        );
      }

      try {
        console.log("[create-with-plan] Creating Whop product on-demand...");
        const whopProductId = await ensureCompanyProduct(accessTokenToUse);
        
        // Update company or user with the new product ID
        if (user.company) {
          // Update company with product ID
          await prisma.company.update({
            where: { id: user.company.id },
            data: { whopProductId },
          });
          // Also update user for backward compatibility
          await prisma.user.update({
            where: { id: user.id },
            data: { whopProductId },
          });
          // Update user object
          (user as any).company.whopProductId = whopProductId;
        } else {
          // Update user with product ID
          await prisma.user.update({
            where: { id: user.id },
            data: { whopProductId },
          });
        }

        // Update user object for rest of function
        (user as any).whopProductId = whopProductId;

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

    // Use company's OAuth token if available, otherwise user's token
    // Company tokens are preferred as they're scoped to the company
    const companyToken = user.company?.whopAccessToken;
    const userToken = user.whopAccessToken;
    const accessToken = companyToken || userToken;

    if (!accessToken) {
      console.error("[create-with-plan] Missing OAuth access token", {
        userId: user.id,
        whopUserId: user.whopUserId,
        companyId: user.company?.id,
        hasCompanyToken: !!companyToken,
        hasUserToken: !!userToken,
      });
      return NextResponse.json(
        {
          error: "Authentication required",
          details: "Your account needs to be authenticated with OAuth tokens. Please reinstall the app to refresh your tokens.",
          hint: "Go to your Whop dashboard → Apps → Reinstall this app.",
          action: "oauth_required",
        },
        { status: 401 }
      );
    }
    
    // Check if token is expired (check company token first, then user token)
    const companyTokenExpired = user.company?.tokenExpiresAt && user.company.tokenExpiresAt.getTime() <= Date.now();
    const userTokenExpired = user.tokenExpiresAt && user.tokenExpiresAt.getTime() <= Date.now();
    
    if (companyTokenExpired || userTokenExpired) {
      // Token expired, try to refresh
      const refreshToken = user.company?.whopRefreshToken || user.whopRefreshToken;
      if (!refreshToken) {
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
          refresh_token: refreshToken,
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

      const newAccessToken = tokenData.access_token;
      const newExpiresAt = new Date(Date.now() + ((tokenData.expires_in ?? 3600) * 1000));

      // Update company or user with new tokens
      if (user.company) {
        await prisma.company.update({
          where: { id: user.company.id },
          data: {
            whopAccessToken: newAccessToken,
            whopRefreshToken: tokenData.refresh_token ?? user.company.whopRefreshToken,
            tokenExpiresAt: newExpiresAt,
          },
        });
        // Also update user for backward compatibility
        await prisma.user.update({
          where: { id: user.id },
          data: {
            whopAccessToken: newAccessToken,
            whopRefreshToken: tokenData.refresh_token ?? user.whopRefreshToken,
            tokenExpiresAt: newExpiresAt,
          },
        });
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            whopAccessToken: newAccessToken,
            whopRefreshToken: tokenData.refresh_token ?? user.whopRefreshToken,
            tokenExpiresAt: newExpiresAt,
          },
        });
      }

      // Update accessToken variable for rest of function
      accessToken = newAccessToken;
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
        whopProductId: whopProductIdToUse || user.whopProductId || user.company?.whopProductId,
        priceCents: product.priceCents,
        currency: product.currency.toLowerCase(),
        metadata: {
          linkVaultProductId: product.id,
          userId: user.id,
          whopUserId: user.whopUserId,
          companyId: user.company?.id,
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

