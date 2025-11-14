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
  const response = await fetch("https://api.whop.com/api/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.WHOP_CLIENT_ID,
      client_secret: env.WHOP_CLIENT_SECRET,
      code,
      redirect_uri: env.NEXT_PUBLIC_WHOP_REDIRECT_URL,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(
      `Token exchange failed (${response.status}): ${JSON.stringify(errorPayload)}`
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
      const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/");
      redirectUrl.searchParams.set("error", error);
      return NextResponse.redirect(redirectUrl.toString());
    }

    if (!code) {
      console.error("[OAuth Callback] Missing authorization code");
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
    }

    if (!env.WHOP_CLIENT_ID || !env.WHOP_CLIENT_SECRET || !env.NEXT_PUBLIC_WHOP_REDIRECT_URL) {
      console.error("[OAuth Callback] Missing Whop OAuth configuration");
      const redirectUrl = new URL("/");
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

    // SOLUTION 1: Create Whop product per user (not per company)
    console.log("[OAuth Callback] Creating Whop product for user...");
    
    const tokenExpiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000);
    
    let whopProductId: string | null = null;
    try {
      whopProductId = await ensureCompanyProduct(access_token);
      console.log("[OAuth Callback] User Whop product created", {
        whopUserId: whopUser.id,
        whopProductId,
      });
    } catch (productError) {
      console.error("[OAuth Callback] Failed to create Whop product for user", {
        whopUserId: whopUser.id,
        error: productError instanceof Error ? productError.message : String(productError),
      });
      // Continue anyway - product can be created later
    }

    // Update or create user with OAuth tokens and product ID
    // First check if user exists to preserve existing whopProductId
    const existingUser = await prisma.user.findUnique({
      where: { whopUserId: whopUser.id },
      select: { whopProductId: true },
    });

    const user = await prisma.user.upsert({
      where: { whopUserId: whopUser.id },
      create: {
        whopUserId: whopUser.id,
        role: "seller",
        whopProductId: whopProductId ?? undefined,
        whopAccessToken: access_token,
        whopRefreshToken: refresh_token,
        tokenExpiresAt,
      },
      update: {
        // Only update whopProductId if we got a new one, otherwise keep existing
        whopProductId: whopProductId ?? existingUser?.whopProductId ?? undefined,
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
    });

    // Note: companyId is now optional (Solution 1 - no company requirement)
    if (!user.whopProductId) {
      console.warn("[OAuth Callback] User created without whopProductId", {
        userId: user.id,
        whopUserId: user.whopUserId,
      });
    }

    const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/experience");
    redirectUrl.searchParams.set("success", "true");
    redirectUrl.searchParams.set("userId", user.id);

    return NextResponse.redirect(redirectUrl.toString(), {
      headers: {
        "Set-Cookie": `whop_user_id=${user.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}; ${process.env.NODE_ENV === "production" ? "Secure;" : ""}`,
      },
    });
  } catch (err) {
    console.error("[OAuth Callback] OAuth callback error:", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/");
    redirectUrl.searchParams.set("error", "internal_error");
    return NextResponse.redirect(redirectUrl.toString());
  }
}

