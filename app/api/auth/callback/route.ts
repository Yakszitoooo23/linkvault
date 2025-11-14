import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

type WhopTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type WhopUserResponse = {
  id: string;
};

type WhopCompany = {
  id: string;
  name: string;
};

type WhopCompaniesResponse = {
  data?: WhopCompany[];
};

type WhopProductResponse = {
  id: string;
};

async function exchangeCodeForTokens(code: string): Promise<WhopTokenResponse> {
  // According to Whop docs: POST https://api.whop.com/v5/oauth/token
  // Body: JSON with grant_type, code, client_id, client_secret, redirect_uri
  // For Whop Apps, might need App ID and API Key instead of Client ID/Secret
  const endpoint = "https://api.whop.com/v5/oauth/token";
  
  // Try Client ID/Secret first, fallback to App ID/API Key
  const clientId = env.WHOP_CLIENT_ID || env.WHOP_APP_ID;
  const clientSecret = env.WHOP_CLIENT_SECRET || env.WHOP_API_KEY;
  
  if (!clientId || !clientSecret) {
    throw new Error("Missing OAuth credentials: need either WHOP_CLIENT_ID/WHOP_CLIENT_SECRET or WHOP_APP_ID/WHOP_API_KEY");
  }
  
  const requestBody = {
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: env.NEXT_PUBLIC_WHOP_REDIRECT_URL!,
  };

  // Log request details (mask secret)
  console.log("[OAuth Callback] Token exchange request", {
    endpoint,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: {
      ...requestBody,
      client_secret: requestBody.client_secret
        ? `${requestBody.client_secret.substring(0, 5)}...${requestBody.client_secret.substring(requestBody.client_secret.length - 5)}`
        : "MISSING",
    },
    clientId: env.WHOP_CLIENT_ID
      ? `${env.WHOP_CLIENT_ID.substring(0, 5)}...${env.WHOP_CLIENT_ID.substring(env.WHOP_CLIENT_ID.length - 5)}`
      : "MISSING",
    clientSecretLength: env.WHOP_CLIENT_SECRET?.length || 0,
    redirectUri: env.NEXT_PUBLIC_WHOP_REDIRECT_URL,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const errorText = await response.text().catch(() => null);
    console.error("[OAuth Callback] Token exchange error details", {
      status: response.status,
      statusText: response.statusText,
      errorPayload,
      errorText,
      hasClientId: !!env.WHOP_CLIENT_ID,
      hasClientSecret: !!env.WHOP_CLIENT_SECRET,
      clientIdLength: env.WHOP_CLIENT_ID?.length,
      clientSecretLength: env.WHOP_CLIENT_SECRET?.length,
    });
    throw new Error(
      `Token exchange failed (${response.status}): ${JSON.stringify(errorPayload || errorText)}`
    );
  }

  return (await response.json()) as WhopTokenResponse;
}

async function fetchWhopUser(accessToken: string): Promise<WhopUserResponse> {
  const response = await fetch("https://api.whop.com/api/v2/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Whop user (${response.status})`);
  }

  return (await response.json()) as WhopUserResponse;
}

async function fetchWhopCompanies(accessToken: string): Promise<WhopCompany[]> {
  const response = await fetch("https://api.whop.com/api/v5/me/companies", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      `Failed to fetch Whop companies (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  const companies = (await response.json()) as WhopCompaniesResponse;
  return companies.data ?? [];
}

async function ensureCompanyProduct(accessToken: string): Promise<string> {
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

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      `Failed to create Whop product (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  const product = (await response.json()) as WhopProductResponse;
  if (!product.id) {
    throw new Error("Whop product creation response missing id");
  }
  return product.id;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state"); // May contain company context

    // IMPORTANT: This log should appear in Vercel logs when OAuth callback is called
    console.log("[OAuth Callback] ====== CALLBACK CALLED ======", {
      timestamp: new Date().toISOString(),
      hasCode: !!code,
      hasError: !!error,
      hasState: !!state,
      allParams: Object.fromEntries(searchParams.entries()),
      url: req.url,
    });

    if (error) {
      console.error("[OAuth Callback] OAuth error:", error);
      // Redirect to home page on OAuth error, NOT back to callback
      const errorUrl = new URL("/", req.url);
      errorUrl.searchParams.set("error", error);
      return NextResponse.redirect(errorUrl.toString());
    }

    // Whop Apps might not use standard OAuth flow - check if we can get token from validateToken
    if (!code) {
      console.log("[OAuth Callback] No code parameter - checking if this is a Whop Apps installation");
      console.log("[OAuth Callback] Request headers:", {
        headers: Object.fromEntries(req.headers.entries()),
      });
      
      // Try to get token from validateToken (Whop Apps SDK)
      try {
        const { validateToken } = await import("@whop-apps/sdk");
        const tokenData = await validateToken({ headers: req.headers });
        console.log("[OAuth Callback] validateToken result:", {
          hasTokenData: !!tokenData,
          tokenDataKeys: tokenData ? Object.keys(tokenData) : [],
        });
        
        // If we have token data but no code, this might be a direct app installation
        // In this case, we might need to redirect to OAuth manually or handle differently
        if (tokenData) {
          console.log("[OAuth Callback] Got token data without code - this might be a Whop Apps installation");
          // Redirect to home page explaining OAuth is needed, NOT back to callback
          const redirectUrl = new URL("/", req.url);
          redirectUrl.searchParams.set("error", "oauth_required");
          redirectUrl.searchParams.set("message", "Please complete OAuth authorization");
          return NextResponse.redirect(redirectUrl.toString());
        }
      } catch (validateError) {
        console.error("[OAuth Callback] validateToken failed:", validateError);
      }
      
      console.error("[OAuth Callback] Missing authorization code and no token data available");
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
    }

    // For Whop Apps, we might need App ID and API Key instead of Client ID/Secret
    // Try both: first Client ID/Secret, then App ID/API Key
    const clientId = env.WHOP_CLIENT_ID || env.WHOP_APP_ID;
    const clientSecret = env.WHOP_CLIENT_SECRET || env.WHOP_API_KEY;
    
    if (!clientId || !clientSecret || !env.NEXT_PUBLIC_WHOP_REDIRECT_URL) {
      console.error("[OAuth Callback] Missing Whop OAuth configuration", {
        hasClientId: !!env.WHOP_CLIENT_ID,
        hasClientSecret: !!env.WHOP_CLIENT_SECRET,
        hasAppId: !!env.WHOP_APP_ID,
        hasApiKey: !!env.WHOP_API_KEY,
        hasRedirectUrl: !!env.NEXT_PUBLIC_WHOP_REDIRECT_URL,
        redirectUrl: env.NEXT_PUBLIC_WHOP_REDIRECT_URL,
        usingClientId: !!env.WHOP_CLIENT_ID,
        usingApiKey: !!env.WHOP_API_KEY,
      });
      // Redirect to home page on error, NOT back to callback
      const redirectUrl = new URL("/", req.url);
      redirectUrl.searchParams.set("error", "oauth_not_configured");
      return NextResponse.redirect(redirectUrl.toString());
    }

    console.log("[OAuth Callback] Exchanging code for tokens...");
    const { access_token, refresh_token, expires_in } = await exchangeCodeForTokens(code);
    console.log("[OAuth Callback] Token exchange successful", {
      hasAccessToken: !!access_token,
      hasRefreshToken: !!refresh_token,
      expiresIn: expires_in,
    });

    console.log("[OAuth Callback] Fetching Whop user...");
    const whopUser = await fetchWhopUser(access_token);
    console.log("[OAuth Callback] Whop user fetched", { whopUserId: whopUser.id });

    // Fetch user's companies and create Company records
    console.log("[OAuth Callback] Fetching user's companies...");
    let whopCompanies: WhopCompany[] = [];
    try {
      whopCompanies = await fetchWhopCompanies(access_token);
      console.log("[OAuth Callback] Companies fetched", { count: whopCompanies.length });
    } catch (companiesError) {
      console.error("[OAuth Callback] Failed to fetch companies", {
        error: companiesError instanceof Error ? companiesError.message : String(companiesError),
      });
      // Continue anyway - companies might not be available
    }

    const tokenExpiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000);
    
    // Upsert companies and create Whop product for first company
    let firstCompanyId: string | null = null;
    let companyWhopProductId: string | null = null;

    if (whopCompanies.length > 0) {
      console.log("[OAuth Callback] Upserting companies...");
      const companyRecords = [];
      
      for (const whopCompany of whopCompanies) {
        const company = await prisma.company.upsert({
          where: { whopCompanyId: whopCompany.id },
          create: {
            whopCompanyId: whopCompany.id,
            name: whopCompany.name,
            whopAccessToken: access_token,
            whopRefreshToken: refresh_token,
            tokenExpiresAt,
          },
          update: {
            whopAccessToken: access_token,
            whopRefreshToken: refresh_token,
            tokenExpiresAt,
            name: whopCompany.name, // Update name in case it changed
          },
        });
        companyRecords.push(company);
        console.log("[OAuth Callback] Company upserted", {
          companyId: company.id,
          whopCompanyId: company.whopCompanyId,
          name: company.name,
        });
      }

      // Use first company for product creation and user linking
      const firstCompany = companyRecords[0];
      firstCompanyId = firstCompany.id;

      // Create or get Whop product for company
      if (!firstCompany.whopProductId) {
        console.log("[OAuth Callback] Creating Whop product for company...");
        try {
          companyWhopProductId = await ensureCompanyProduct(access_token);
          await prisma.company.update({
            where: { id: firstCompany.id },
            data: { whopProductId: companyWhopProductId },
          });
          console.log("[OAuth Callback] Company Whop product created", {
            companyId: firstCompany.id,
            whopProductId: companyWhopProductId,
          });
        } catch (productError) {
          console.error("[OAuth Callback] Failed to create Whop product for company", {
            companyId: firstCompany.id,
            error: productError instanceof Error ? productError.message : String(productError),
          });
          // Continue anyway - product can be created later
        }
      } else {
        companyWhopProductId = firstCompany.whopProductId;
        console.log("[OAuth Callback] Using existing company Whop product", {
          companyId: firstCompany.id,
          whopProductId: companyWhopProductId,
        });
      }
    } else {
      console.warn("[OAuth Callback] No companies found for user", {
        whopUserId: whopUser.id,
      });
    }

    // Update or create user with OAuth tokens and link to company
    // First check if user exists to preserve existing data
    const existingUser = await prisma.user.findUnique({
      where: { whopUserId: whopUser.id },
      select: { whopProductId: true, companyId: true },
    });

    const user = await prisma.user.upsert({
      where: { whopUserId: whopUser.id },
      create: {
        whopUserId: whopUser.id,
        role: "seller",
        companyId: firstCompanyId ?? undefined,
        // Store company's product ID on user for backward compatibility
        whopProductId: companyWhopProductId ?? undefined,
        whopAccessToken: access_token,
        whopRefreshToken: refresh_token,
        tokenExpiresAt,
      },
      update: {
        // Update companyId if we have one
        companyId: firstCompanyId ?? existingUser?.companyId ?? undefined,
        // Only update whopProductId if we got a new one, otherwise keep existing
        whopProductId: companyWhopProductId ?? existingUser?.whopProductId ?? undefined,
        whopAccessToken: access_token,
        whopRefreshToken: refresh_token,
        tokenExpiresAt,
      },
    });

    console.log("[OAuth Callback] User upserted", {
      userId: user.id,
      whopUserId: user.whopUserId,
      companyId: user.companyId,
      whopProductId: user.whopProductId,
      hasAccessToken: !!user.whopAccessToken,
      companiesCreated: whopCompanies.length,
    });

    if (!user.companyId) {
      console.warn("[OAuth Callback] User created without companyId", {
        userId: user.id,
        whopUserId: user.whopUserId,
        companiesFound: whopCompanies.length,
      });
    }

    if (!user.whopProductId) {
      console.warn("[OAuth Callback] User created without whopProductId", {
        userId: user.id,
        whopUserId: user.whopUserId,
        companyId: user.companyId,
      });
    }

    // Redirect to a page, NOT back to the callback URL (which would cause a redirect loop)
    // Use /experience or /dashboard or just / as the success page
    const successUrl = new URL("/experience", req.url);
    successUrl.searchParams.set("success", "true");
    successUrl.searchParams.set("userId", user.id);

    return NextResponse.redirect(successUrl.toString(), {
      headers: {
        "Set-Cookie": `whop_user_id=${user.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}; ${process.env.NODE_ENV === "production" ? "Secure;" : ""}`,
      },
    });
  } catch (err) {
    console.error("[OAuth Callback] OAuth callback error:", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Redirect to home page on error, NOT back to callback
    const errorUrl = new URL("/", req.url);
    errorUrl.searchParams.set("error", "internal_error");
    return NextResponse.redirect(errorUrl.toString());
  }
}

