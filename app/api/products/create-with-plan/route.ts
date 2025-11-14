import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@whop-apps/sdk";

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
        company: true,
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

    // If still not found, list all users for debugging (only in development)
    if (!user && process.env.NODE_ENV !== "production") {
      const allUsers = await prisma.user.findMany({
        select: {
          id: true,
          whopUserId: true,
          companyId: true,
        },
        take: 10,
      });
      console.log("[create-with-plan] Available users in database", {
        count: allUsers.length,
        users: allUsers,
        searchedFor: whopUserId,
      });
    }

    if (!user) {
      console.error("[create-with-plan] User not found after all attempts", {
        whopUserId,
        searchedBy: ["whopUserId", "id"],
        tokenCompanyId,
      });
      return NextResponse.json(
        { 
          error: "User not found",
          details: `No user found with ID: ${whopUserId}. Please ensure you have installed the app through Whop's OAuth flow.`,
          hint: "Try reinstalling the app from the Whop dashboard.",
        },
        { status: 404 }
      );
    }

    // If user doesn't have a company but token has companyId, try to link it
    if (!user.company && tokenCompanyId) {
      console.log("[create-with-plan] User missing company, attempting to link from token", {
        userId: user.id,
        tokenCompanyId,
      });

      const company = await prisma.company.findUnique({
        where: { whopCompanyId: tokenCompanyId },
      });

      if (company) {
        console.log("[create-with-plan] Found company from token, linking user", {
          userId: user.id,
          companyId: company.id,
        });
        user = await prisma.user.update({
          where: { id: user.id },
          data: { companyId: company.id },
          include: { company: true },
        });
      } else {
        console.warn("[create-with-plan] Company from token not found in database", {
          tokenCompanyId,
        });
      }
    }

    if (!user.company) {
      console.error("[create-with-plan] User is not linked to a Whop company", {
        userId: user.id,
        whopUserId: user.whopUserId,
        companyId: user.companyId,
        tokenCompanyId,
      });
      return NextResponse.json(
        {
          error: "User is not linked to a Whop company. Please reinstall the app or contact support.",
          details: "The app needs to be installed for a company to create products.",
        },
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

