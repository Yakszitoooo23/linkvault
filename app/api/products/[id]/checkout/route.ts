import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

type RouteParams = {
  id: string;
};

type WhopPlanResponse = {
  id: string;
};

type WhopCheckoutConfigurationResponse = {
  id: string;
};

type ProductWithCompany = {
  id: string;
  planId: string | null;
  priceCents: number;
  currency: string;
  company: {
    id: string;
    whopCompanyId: string;
    whopAccessToken: string | null;
    whopRefreshToken: string | null;
    tokenExpiresAt: Date | null;
    whopProductId: string | null;
  } | null;
};

type CompanyCredentials = {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
};

async function ensureCompanyCredentials(company: CompanyCredentials) {
  const { accessToken, refreshToken, tokenExpiresAt } = company;
  if (!accessToken) {
    throw new Error("Company is missing Whop access token");
  }

  if (!tokenExpiresAt) {
    return accessToken;
  }

  const now = new Date();
  if (tokenExpiresAt.getTime() <= now.getTime()) {
    if (!refreshToken) {
      throw new Error("Company Whop access token expired and no refresh token available");
    }

    console.warn("Company Whop access token expired; refresh flow required");
    // TODO: Implement token refresh using company.whopRefreshToken
    throw new Error("Company Whop access token expired; refresh required (not yet implemented)");
  }

  return accessToken;
}

async function createPlan({
  accessToken,
  whopProductId,
  priceCents,
  currency,
  productId,
}: {
  accessToken: string;
  whopProductId: string;
  priceCents: number;
  currency: string;
  productId: string;
}): Promise<string> {
  const response = await fetch("https://api.whop.com/api/v5/plans", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: whopProductId,
      plan_type: "one_time",
      initial_price: priceCents,
      currency,
      metadata: {
        linkVaultProductId: productId,
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    console.error("Whop plan creation failed", {
      status: response.status,
      payload,
    });
    throw new Error(
      `Failed to create Whop plan (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  const plan = (await response.json()) as WhopPlanResponse;
  if (!plan.id) {
    throw new Error("Whop plan creation response missing id");
  }
  return plan.id;
}

async function createCheckoutConfiguration({
  accessToken,
  planId,
  redirectUrl,
  productId,
}: {
  accessToken: string;
  planId: string;
  redirectUrl: string;
  productId: string;
}): Promise<string> {
  const response = await fetch("https://api.whop.com/api/v5/checkout_configurations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,
      success_url: redirectUrl,
      cancel_url: redirectUrl,
      metadata: {
        productId,
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    console.error("Whop checkout configuration failed", {
      status: response.status,
      payload,
    });
    throw new Error(
      `Failed to create Whop checkout configuration (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  const checkoutConfig = (await response.json()) as WhopCheckoutConfigurationResponse;
  if (!checkoutConfig.id) {
    throw new Error("Whop checkout configuration response missing id");
  }
  return checkoutConfig.id;
}

export async function POST(req: NextRequest, { params }: { params: RouteParams }) {
  try {
    const productId = params.id;

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const productRecord = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        company: {
          select: {
            id: true,
            whopCompanyId: true,
            whopAccessToken: true,
            whopRefreshToken: true,
            tokenExpiresAt: true,
            whopProductId: true,
          },
        },
      },
    } as any);
    const product = productRecord as ProductWithCompany | null;

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (!product.company) {
      console.error("Product missing associated company", { productId: product.id });
      return NextResponse.json(
        { error: "Product is not associated with a company" },
        { status: 400 }
      );
    }

    const { company } = product;

    if (!company.whopProductId) {
      console.error("Company missing Whop product ID", {
        companyId: company.id,
        whopCompanyId: company.whopCompanyId,
      });
      return NextResponse.json(
        { error: "Company is not configured with a Whop product" },
        { status: 400 }
      );
    }

    if (!company.whopAccessToken) {
      console.error("Company missing Whop access token", {
        companyId: company.id,
        whopCompanyId: company.whopCompanyId,
      });
      return NextResponse.json(
        { error: "Company is not authenticated with Whop" },
        { status: 400 }
      );
    }

    let accessToken: string;
    try {
      accessToken = await ensureCompanyCredentials({
        accessToken: company.whopAccessToken,
        refreshToken: company.whopRefreshToken,
        tokenExpiresAt: company.tokenExpiresAt,
      });
    } catch (credentialError) {
      console.error("Company Whop credential validation failed", {
        companyId: company.id,
        whopCompanyId: company.whopCompanyId,
        error: credentialError,
      });
      return NextResponse.json(
        {
          error:
            credentialError instanceof Error
              ? credentialError.message
              : "Company Whop credentials invalid",
        },
        { status: 401 }
      );
    }

    let planId = product.planId ?? undefined;

    if (!planId) {
      console.info("Creating Whop plan for product", {
        productId: product.id,
        companyId: company.id,
        whopCompanyId: company.whopCompanyId,
        whopProductId: company.whopProductId,
      });

      planId = await createPlan({
        accessToken,
        whopProductId: company.whopProductId,
        priceCents: product.priceCents,
        currency: product.currency.toLowerCase(),
        productId: product.id,
      });

      await prisma.product.update({
        where: { id: product.id },
        data: { planId } as any,
      });
    }

    const refererUrl = req.headers.get("referer");
    const fallbackUrl = `${req.nextUrl.origin}/product/${product.id}`;
    const redirectUrl = refererUrl ?? fallbackUrl;

    console.info("Creating Whop checkout configuration", {
      productId: product.id,
      companyId: company.id,
      planId,
    });

    const checkoutConfigId = await createCheckoutConfiguration({
      accessToken,
      planId,
      redirectUrl,
      productId: product.id,
    });

    return NextResponse.json({
      checkoutConfigId,
      planId,
    });
  } catch (error) {
    console.error("Product checkout configuration error:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Unexpected error creating checkout configuration" },
      { status: 500 }
    );
  }
}

