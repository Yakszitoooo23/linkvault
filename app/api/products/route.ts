import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const whopCompanyId = searchParams.get("companyId");

    if (whopCompanyId) {
      const company = await prisma.company.findUnique({
        where: { whopCompanyId },
        select: {
          id: true,
          whopCompanyId: true,
          name: true,
          whopProductId: true,
        },
      });

      if (!company) {
        return NextResponse.json({ error: "Company not found" }, { status: 404 });
      }

      const products = await prisma.product.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          priceCents: true,
          currency: true,
          planId: true,
          imageKey: true,
          imageUrl: true,
          createdAt: true,
        },
      });

      return NextResponse.json({
        company,
        products: products.map((product) => ({
          ...product,
          createdAt: product.createdAt.toISOString(),
        })),
      });
    }

    const products = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        planId: true,
        imageKey: true,
        imageUrl: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      products.map((product) => ({
        ...product,
        createdAt: product.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error("Failed to list products:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch products";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreateProductBody = {
  title: string;
  description?: string | null;
  priceCents: number;
  currency?: string;
  fileKey: string;
  imageKey?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CreateProductBody>;

    const authCookie = cookies().get("whop_user_id");
    const userId = authCookie?.value ?? null;

    if (!userId) {
      console.warn("Product creation attempted without authentication");
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, companyId: true },
    });

    if (!user?.companyId) {
      console.warn("Authenticated user not linked to company", { userId: user?.id });
      return NextResponse.json({ error: "User not linked to a company" }, { status: 403 });
    }

    if (!body.title || typeof body.priceCents !== "number" || !body.fileKey) {
      return NextResponse.json(
        { error: "Missing required fields: title, priceCents, fileKey" },
        { status: 400 }
      );
    }

    console.info("Creating product for company", {
      companyId: user.companyId,
      userId: user.id,
      title: body.title,
    });

    const product = await prisma.product.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        priceCents: body.priceCents,
        currency: body.currency ?? "USD",
        fileKey: body.fileKey,
        imageKey: body.imageKey ?? null,
        companyId: user.companyId,
      },
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

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Failed to create product:", error);
    const message = error instanceof Error ? error.message : "Failed to create product";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

