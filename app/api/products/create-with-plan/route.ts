import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@whop-apps/sdk";

import { prisma } from "@/lib/db";
import {
  WhopApiError,
  ensureCompanyAccessToken,
  createCompanyPlan,
} from "@/lib/whop";

// Helper to extract access token from request headers
function getAccessTokenFromHeaders(headers: Headers): string | null {
  const authHeader = headers.get("authorization") || headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
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

  const product = (await response.json()) as { id?: string };
  if (!product.id) {
    throw new Error("Whop product creation response missing id");
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

    // If user doesn't exist, try to create them on-the-fly using access token
    if (!user) {
      console.log("[create-with-plan] User not found, attempting to create on-the-fly", {
        whopUserId,
      });

      const requestHeaders = headers();
      
      // Log all headers to see what Whop sends
      const allHeaders: Record<string, string> = {};
      requestHeaders.forEach((value, key) => {
        allHeaders[key] = key.toLowerCase().includes("auth") ? value.substring(0, 20) + "..." : value;
      });
      console.log("[create-with-plan] All request headers", {
        headerKeys: Object.keys(allHeaders),
        authHeaders: Object.keys(allHeaders).filter(k => k.toLowerCase().includes("auth")),
        allHeaders,
      });

      const accessToken = getAccessTokenFromHeaders(requestHeaders);

      if (!accessToken) {
        console.error("[create-with-plan] No access token available to create user", {
          whopUserId,
          availableHeaders: Object.keys(allHeaders),
        });
        
        // Since we can't get the OAuth token from headers, the user must go through OAuth first
        return NextResponse.json(
          { 
            error: "User not found. Please install the app first.",
            details: `No user found with ID: ${whopUserId}. You need to install this app through Whop's OAuth flow to create products.`,
            hint: "Go to your Whop dashboard → Apps → Install this app, or reinstall it if already installed.",
            action: "install_required",
          },
          { status: 403 }
        );
      }

      try {
        console.log("[create-with-plan] Fetching user and company info from Whop API...");
        const whopUser = await fetchWhopUserInfo(accessToken);
        const companies = await fetchWhopCompanies(accessToken);

        console.log("[create-with-plan] Fetched from Whop API", {
          whopUserId: whopUser.id,
          companiesCount: companies.length,
          companies: companies.map((c) => ({ id: c.id, name: c.name })),
        });

        if (companies.length === 0) {
          console.error("[create-with-plan] No companies found for user", {
            whopUserId: whopUser.id,
          });
          return NextResponse.json(
            { 
              error: "No company found",
              details: "You need to have a company in Whop to use this app. Please create a company first.",
            },
            { status: 403 }
          );
        }

        // Use the first company
        const firstCompany = companies[0];
        console.log("[create-with-plan] Using first company", {
          companyId: firstCompany.id,
          companyName: firstCompany.name,
        });

        // Ensure company product exists
        const whopProductId = await ensureCompanyProduct(accessToken);
        console.log("[create-with-plan] Company product ensured", {
          whopProductId,
        });

        // Upsert company
        const company = await prisma.company.upsert({
          where: { whopCompanyId: firstCompany.id },
          create: {
            whopCompanyId: firstCompany.id,
            name: firstCompany.name,
            whopAccessToken: accessToken,
            whopRefreshToken: null, // We don't have refresh token from headers
            tokenExpiresAt: new Date(Date.now() + 3600 * 1000), // Assume 1 hour expiry
            whopProductId,
            isActive: true,
            installedAt: new Date(),
          },
          update: {
            name: firstCompany.name,
            whopAccessToken: accessToken,
            tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
            whopProductId,
            isActive: true,
            updatedAt: new Date(),
          },
        });

        console.log("[create-with-plan] Company upserted", {
          companyId: company.id,
          whopCompanyId: company.whopCompanyId,
        });

        // Create user and link to company
        user = await prisma.user.upsert({
          where: { whopUserId: whopUser.id },
          create: {
            whopUserId: whopUser.id,
            role: "seller",
            companyId: company.id,
          },
          update: {
            companyId: company.id,
          },
          include: {
            company: true,
          },
        });

        console.log("[create-with-plan] User created/updated", {
          userId: user.id,
          whopUserId: user.whopUserId,
          companyId: user.companyId,
        });
      } catch (createError) {
        console.error("[create-with-plan] Failed to create user on-the-fly", {
          error: createError instanceof Error ? createError.message : String(createError),
          stack: createError instanceof Error ? createError.stack : undefined,
        });
        return NextResponse.json(
          { 
            error: "Failed to create user automatically",
            details: createError instanceof Error ? createError.message : "Unknown error",
            hint: "Please try reinstalling the app from the Whop dashboard.",
          },
          { status: 500 }
        );
      }
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

