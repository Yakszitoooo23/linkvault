import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        priceCents: true,
        imageKey: true,
        createdAt: true,
      },
    });

    return NextResponse.json(products);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "fetch error" }, { status: 500 });
  }
}


