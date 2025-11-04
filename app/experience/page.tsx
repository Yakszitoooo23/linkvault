import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/Icon";
import { ProductCard } from "@/components/product/ProductCard";
import { EmptyState } from "@/components/product/EmptyState";
import { ExperienceClient } from "./ExperienceClient";

interface Product {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  imageKey: string | null;
  createdAt: string;
}

async function getProducts(): Promise<Product[]> {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        title: true,
        description: true,
        priceCents: true,
        imageKey: true,
        createdAt: true,
      },
    });
    return products.map(product => ({
      ...product,
      createdAt: product.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return [];
  }
}

export default async function Experience() {
  const products = await getProducts();

  return (
    <div>
      {/* Toolbar */}
      <div className="toolbar">
        <ExperienceClient />
      </div>

      {/* Main Content */}
      {products.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              title={product.title}
              description={product.description}
              priceCents={product.priceCents}
              imageKey={product.imageKey}
              createdAt={product.createdAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
