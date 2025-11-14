import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@whop-apps/sdk";

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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CreateProductBody>;
    console.log("Product creation request body:", JSON.stringify(body, null, 2));

    // Get authenticated user (required for userId)
    const tokenData = await validateToken({ headers: headers() });
    const { userId: whopUserId } = (tokenData || {}) as {
      userId?: string;
      [key: string]: unknown;
    };

    if (!whopUserId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Find user to get their internal ID
    const user = await prisma.user.findUnique({
      where: { whopUserId },
      select: { id: true, companyId: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found. Please install the app first." },
        { status: 404 }
      );
    }

    // Get companyId from body (for backward compatibility) or from user
    const companyIdFromBody = (body as any).companyId as string | undefined;
    const companyId = companyIdFromBody || user.companyId || null;

    if (!body.title || typeof body.priceCents !== "number" || !body.fileKey) {
      console.error("Missing required fields", {
        title: body.title,
        priceCents: body.priceCents,
        fileKey: body.fileKey,
      });
      return NextResponse.json(
        { error: "Missing required fields: title, priceCents, fileKey" },
        { status: 400 }
      );
    }

    if (body.imageUrl && typeof body.imageUrl === "string") {
      const isValidUrl =
        body.imageUrl.startsWith("http://") ||
        body.imageUrl.startsWith("https://") ||
        body.imageUrl.startsWith("/");
      if (!isValidUrl) {
        return NextResponse.json(
          { error: "Invalid imageUrl format. Must be absolute URL or start with /" },
          { status: 400 }
        );
      }
    }

    console.info("Creating product via legacy endpoint", {
      userId: user.id,
      companyId,
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
        imageUrl: body.imageUrl ?? null,
        userId: user.id, // Required: link to user
        companyId, // Optional: for backward compatibility
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
