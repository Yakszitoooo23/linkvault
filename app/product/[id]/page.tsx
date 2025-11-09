import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "./ProductDetailClient";

interface Product {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  imageKey: string | null;
  imageUrl: string | null;
  currency: string;
  planId: string | null;
  createdAt: string;
}

async function getProduct(id: string): Promise<Product | null> {
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        priceCents: true,
        imageKey: true,
        imageUrl: true,
        currency: true,
        planId: true,
        createdAt: true,
      },
    });
    if (!product) return null;
    return {
      ...product,
      createdAt: product.createdAt.toISOString(),
    };
  } catch (error) {
    console.error("Error fetching product:", error);
    return null;
  }
}

export default async function ProductPage({
  params,
}: {
  params: { id: string };
}) {
  const product = await getProduct(params.id);

  if (!product) {
    notFound();
  }

  return <ProductDetailClient product={product} />;
}

