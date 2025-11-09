import { NextRequest, NextResponse } from "next/server";

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

    const companyIdFromBody = (body as any).companyId as string | undefined;
    if (!companyIdFromBody) {
      console.error("Legacy product creation missing companyId");
      return NextResponse.json(
        { error: "Company context missing. Please use the company dashboard to create products." },
        { status: 400 }
      );
    }

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
      companyId: companyIdFromBody,
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
        companyId: companyIdFromBody,
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
