import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  WhopApiError,
  ensureCompanyAccessToken,
  createCompanyPlan,
} from "@/lib/whop";

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

    const authCookie = cookies().get("whop_user_id");
    const userId = authCookie?.value ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
      },
    });

    if (!user || !user.company) {
      return NextResponse.json(
        { error: "User is not linked to a Whop company" },
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

