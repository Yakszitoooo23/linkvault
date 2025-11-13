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

    if (error) {
      console.error("OAuth error:", error);
      const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/");
      redirectUrl.searchParams.set("error", error);
      return NextResponse.redirect(redirectUrl.toString());
    }

    if (!code) {
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
    }

    if (!env.WHOP_CLIENT_ID || !env.WHOP_CLIENT_SECRET || !env.NEXT_PUBLIC_WHOP_REDIRECT_URL) {
      console.error("Missing Whop OAuth configuration");
      const redirectUrl = new URL("/");
      redirectUrl.searchParams.set("error", "oauth_not_configured");
      return NextResponse.redirect(redirectUrl.toString());
    }

    const { access_token, refresh_token, expires_in } = await exchangeCodeForTokens(code);
    const whopUser = await fetchWhopUser(access_token);
    const companies = await fetchWhopCompanies(access_token);

    if (companies.length === 0) {
      console.warn("No Whop companies found for user", whopUser.id);
    }

    const tokenExpiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000);

    const installedCompanyIds: string[] = [];

    for (const company of companies) {
      try {
        const whopProductId = await ensureCompanyProduct(access_token);

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

        installedCompanyIds.push(upsertedCompany.id);
      } catch (companyError) {
        console.error("Failed to process company installation", {
          companyId: company.id,
          error: companyError,
        });
      }
    }

    const firstCompanyId = installedCompanyIds[0] ?? null;

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

    const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/experience");
    redirectUrl.searchParams.set("success", "true");
    redirectUrl.searchParams.set("userId", user.id);

    return NextResponse.redirect(redirectUrl.toString(), {
      headers: {
        "Set-Cookie": `whop_user_id=${user.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}; ${process.env.NODE_ENV === "production" ? "Secure;" : ""}`,
      },
    });
  } catch (err) {
    console.error("OAuth callback error:", err);
    const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/");
    redirectUrl.searchParams.set("error", "internal_error");
    return NextResponse.redirect(redirectUrl.toString());
  }
}

