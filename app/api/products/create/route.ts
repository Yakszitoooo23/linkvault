import { NextRequest, NextResponse } from "next/server";
import { verifyWhopUser } from "@/lib/whopAuth";
import { prisma } from "@/lib/db";

type CreateProductBody = {
  title: string;
  description?: string | null;
  priceCents: number;
  currency?: string;
  fileKey: string;
  imageKey?: string | null;
  imageUrl?: string | null;
};

/**
 * Create a product (without Whop plan)
 * Uses iframe auth (x-whop-user-token)
 */
export async function POST(req: NextRequest) {
  try {
    // Verify user from iframe token
    const whopUser = await verifyWhopUser();
    if (!whopUser) {
      return NextResponse.json(
        {
          error: "Authentication required",
          details: "Invalid or missing Whop user token. Please ensure you're accessing this app from within Whop.",
        },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Partial<CreateProductBody>;

    if (!body.title || typeof body.priceCents !== "number" || !body.fileKey) {
      return NextResponse.json(
        { error: "Missing required fields: title, priceCents, fileKey" },
        { status: 400 }
      );
    }

    // Get or create user
    let user = await prisma.user.findUnique({
      where: { whopUserId: whopUser.userId },
      select: { id: true, companyId: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          whopUserId: whopUser.userId,
          role: "seller",
        },
        select: { id: true, companyId: true },
      });
    }

    // Create product
    const product = await prisma.product.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        priceCents: body.priceCents,
        currency: body.currency ?? "USD",
        fileKey: body.fileKey,
        imageKey: body.imageKey ?? null,
        imageUrl: body.imageUrl ?? null,
        userId: user.id,
        companyId: user.companyId,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error: any) {
    console.error("Product creation error:", error);

    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "A product with this information already exists" },
        { status: 400 }
      );
    }

    if (error?.code === "P2003") {
      return NextResponse.json(
        { error: "Invalid company reference for product" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error?.message ?? "An unexpected error occurred while creating the product" },
      { status: 500 }
    );
  }
}
