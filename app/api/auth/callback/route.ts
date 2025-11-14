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

    console.log("[OAuth Callback] Starting OAuth callback", {
      hasCode: !!code,
      hasError: !!error,
      hasState: !!state,
      allParams: Object.fromEntries(searchParams.entries()),
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

    console.log("[OAuth Callback] Fetching Whop companies...");
    const companies = await fetchWhopCompanies(access_token);
    console.log("[OAuth Callback] Companies fetched", {
      count: companies.length,
      companies: companies.map((c) => ({ id: c.id, name: c.name })),
    });

    if (companies.length === 0) {
      console.error("[OAuth Callback] CRITICAL: No Whop companies found for user", {
        whopUserId: whopUser.id,
        accessToken: access_token.substring(0, 20) + "...",
      });
      // Still proceed but log the issue - user might need to create a company first
    }

    const tokenExpiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000);

    const installedCompanyIds: string[] = [];

    for (const company of companies) {
      try {
        console.log("[OAuth Callback] Processing company installation", {
          companyId: company.id,
          companyName: company.name,
        });

        const whopProductId = await ensureCompanyProduct(access_token);
        console.log("[OAuth Callback] Company product ensured", {
          companyId: company.id,
          whopProductId,
        });

        const upsertedCompany = await prisma.company.upsert({
          where: { whopCompanyId: company.id },
          create: {
            whopCompanyId: company.id,
            name: company.name,
            whopAccessToken: access_token,
            whopRefreshToken: refresh_token,
            tokenExpiresAt,
            whopProductId,
            isActive: true,
            installedAt: new Date(),
          },
          update: {
            name: company.name,
            whopAccessToken: access_token,
            whopRefreshToken: refresh_token,
            tokenExpiresAt,
            whopProductId,
            isActive: true,
            updatedAt: new Date(),
          },
        });

        console.log("[OAuth Callback] Company upserted successfully", {
          companyId: company.id,
          internalId: upsertedCompany.id,
        });

        installedCompanyIds.push(upsertedCompany.id);
      } catch (companyError) {
        console.error("[OAuth Callback] Failed to process company installation", {
          companyId: company.id,
          companyName: company.name,
          error: companyError instanceof Error ? companyError.message : String(companyError),
          stack: companyError instanceof Error ? companyError.stack : undefined,
        });
      }
    }

    const firstCompanyId = installedCompanyIds[0] ?? null;

    console.log("[OAuth Callback] Linking user to company", {
      whopUserId: whopUser.id,
      firstCompanyId,
      installedCompanyIds,
    });

    const user = await prisma.user.upsert({
      where: { whopUserId: whopUser.id },
      create: {
        whopUserId: whopUser.id,
        role: "seller",
        companyId: firstCompanyId ?? undefined,
      },
      update: {
        companyId: firstCompanyId ?? undefined,
      },
    });

    console.log("[OAuth Callback] User upserted", {
      userId: user.id,
      whopUserId: user.whopUserId,
      companyId: user.companyId,
    });

    if (!user.companyId) {
      console.error("[OAuth Callback] WARNING: User created without companyId", {
        userId: user.id,
        whopUserId: user.whopUserId,
        companiesFound: companies.length,
        installedCompanyIds,
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

