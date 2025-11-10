"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/product/ProductCard";
import { EmptyState } from "@/components/product/EmptyState";

type DashboardProduct = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  imageKey: string | null;
  imageUrl: string | null;
  createdAt: string;
};

type CompanySummary = {
  id: string;
  whopCompanyId: string;
  name: string;
  whopProductId: string | null;
};

type DashboardResponse =
  | {
      company: CompanySummary;
      products: DashboardProduct[];
    }
  | DashboardProduct[];

interface DashboardPageProps {
  params: { companyId: string };
}

const DashboardPage: React.FC<DashboardPageProps> = ({ params }) => {
  const router = useRouter();
  const { companyId } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanySummary | null>(null);
  const [products, setProducts] = useState<DashboardProduct[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/products?companyId=${encodeURIComponent(companyId)}`, {
          method: "GET",
          cache: "no-store",
        });

        if (response.status === 404) {
          setError("Company not found");
          setCompany(null);
          setProducts([]);
          return;
        }

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? "Failed to load company products");
        }

        const data: DashboardResponse = await response.json();

        if (Array.isArray(data)) {
          // Fallback for older response format
          setCompany(null);
          setProducts(data);
        } else {
          setCompany(data.company);
          setProducts(data.products);
        }
      } catch (err) {
        console.error("Failed to load company dashboard:", err);
        setError(err instanceof Error ? err.message : "Failed to load company dashboard");
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [companyId]);

  const handleCreateProduct = () => {
    router.push(`/products/new?companyId=${encodeURIComponent(companyId)}`);
  };

  const companyName = company?.name ?? companyId;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">{companyName}</h1>
          <p className="dashboard-subtitle">Manage products for company {companyId}</p>
        </div>
        <div className="dashboard-actions">
          <Link href="/" className="btn-base btn-secondary">
            Back to Home
          </Link>
          <Button variant="primary" onClick={handleCreateProduct} disabled={loading}>
            New Product
          </Button>
        </div>
      </div>

      {error && (
        <div className="dashboard-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="dashboard-loading">Loading company products...</div>
      ) : products.length === 0 ? (
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
              imageUrl={product.imageUrl}
              createdAt={product.createdAt}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;

