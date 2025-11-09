import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  WhopApiError,
  ensureCompanyAccessToken,
  createCompanyPlan,
  createCompanyCheckoutConfiguration,
} from "@/lib/whop";

type RouteParams = {
  id: string;
};

export async function POST(req: NextRequest, { params }: { params: RouteParams }) {
  try {
    const productId = params.id;

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        company: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (!product.company) {
      return NextResponse.json(
        { error: "Product is not associated with a Whop company" },
        { status: 400 }
      );
    }

    const company = product.company;

    if (!company.whopProductId) {
      return NextResponse.json(
        { error: "Company is not configured with a Whop product" },
        { status: 400 }
      );
    }

    const accessToken = await ensureCompanyAccessToken({
      id: company.id,
      whopAccessToken: company.whopAccessToken,
      whopRefreshToken: company.whopRefreshToken,
      tokenExpiresAt: company.tokenExpiresAt,
    });

    let planId = product.planId ?? undefined;

    if (!planId) {
      planId = await createCompanyPlan({
        accessToken,
        whopProductId: company.whopProductId,
        priceCents: product.priceCents,
        currency: product.currency.toLowerCase(),
        metadata: {
          linkVaultProductId: product.id,
          companyId: company.whopCompanyId,
        },
      });

      await prisma.product.update({
        where: { id: product.id },
        data: { planId },
      });
    }

    const refererUrl = req.headers.get("referer");
    const fallbackUrl = `${req.nextUrl.origin}/product/${product.id}`;
    const redirectUrl = refererUrl ?? fallbackUrl;

    const checkoutConfigId = await createCompanyCheckoutConfiguration({
      accessToken,
      planId,
      successUrl: redirectUrl,
      cancelUrl: redirectUrl,
      metadata: {
        productId: product.id,
        companyId: company.whopCompanyId,
      },
    });

    return NextResponse.json({
      checkoutConfigId,
      planId,
    });
  } catch (error) {
    console.error("Product checkout configuration error:", error);

    if (error instanceof WhopApiError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Unexpected error creating checkout configuration" },
      { status: 500 }
    );
  }
}

