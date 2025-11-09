"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { ArrowLeftIcon } from "@/components/ui/Icon";
import { useWhopIframeSdk } from "@/components/providers/WhopProvider";

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

interface ProductDetailClientProps {
  product: Product;
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  const router = useRouter();
  const iframeSdk = useWhopIframeSdk();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    show: false,
    message: "",
    type: "success",
  });

  const planReady = useMemo(() => Boolean(product.planId), [product.planId]);

  const handleBuyClick = async (event?: React.MouseEvent) => {
    event?.preventDefault();
    if (isLoading) return;

    if (!planReady || !product.planId) {
      setError("This product is not configured for purchase yet. Please contact the creator.");
      setToast({
        show: true,
        message: "This product is not ready for checkout. Please try again later.",
        type: "error",
      });
      return;
    }

    if (!iframeSdk) {
      setError("Checkout SDK is not available.");
      setToast({
        show: true,
        message: "Checkout is currently unavailable. Please refresh and try again.",
        type: "error",
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await iframeSdk.inAppPurchase({ planId: product.planId });

      if (result.status === "ok") {
        setToast({
          show: true,
          message: "Purchase successful! You now have access to this product.",
          type: "success",
        });
      } else {
        const message =
          (result as { error?: string }).error ?? "Checkout was cancelled or failed.";
        throw new Error(message);
      }
    } catch (err) {
      console.error("Whop in-app purchase error:", err);
      const message = err instanceof Error ? err.message : "Checkout failed";
      setError(message);
      setToast({
        show: true,
        message,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: product.currency ?? "USD",
    }).format(cents / 100);
  };

  // Always use API route for images to handle both local and S3 storage
  let displayImageUrl: string | null = null;
  
  if (product.imageKey) {
    displayImageUrl = `/api/images?fileKey=${encodeURIComponent(product.imageKey)}`;
  } else if (product.imageUrl) {
    if (product.imageUrl.startsWith('/api/images')) {
      displayImageUrl = product.imageUrl;
    } else if (product.imageUrl.startsWith('/uploads/')) {
      const filename = product.imageUrl.replace('/uploads/', '');
      displayImageUrl = `/api/images?fileKey=${encodeURIComponent(filename)}`;
    } else if (product.imageUrl.startsWith('http://') || product.imageUrl.startsWith('https://')) {
      displayImageUrl = product.imageUrl;
    } else {
      displayImageUrl = `/api/images?fileKey=${encodeURIComponent(product.imageUrl)}`;
    }
  }
  
  return (
    <div>
      <div className="container">
        <div className="product-detail">
          {/* Header */}
          <div className="product-detail-header">
            <Button
              variant="secondary"
              onClick={() => router.push("/")}
              aria-label="Back to home"
            >
              <ArrowLeftIcon size={16} />
              Back
            </Button>
          </div>

          {/* Product content */}
          <div className="product-detail-content">
            {/* Image */}
            <div className="product-detail-image">
              {displayImageUrl ? (
                <img src={displayImageUrl} alt={product.title} />
              ) : (
                <div className="image-placeholder">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      opacity="0.3"
                    />
                    <path
                      d="M8 12h8M12 8v8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      opacity="0.3"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="product-detail-info">
              <h1 className="product-detail-title">{product.title}</h1>
              <p className="product-detail-price">
                {formatPrice(product.priceCents)}
              </p>

              {product.description && (
                <div className="product-detail-description">
                  <h3>Description</h3>
                  <p>{product.description}</p>
                </div>
              )}

              <div className="product-detail-actions">
                {error && (
                  <div className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
                    {error}
                  </div>
                )}
                <Button
                  variant="primary"
                  onClick={handleBuyClick}
                  disabled={isLoading || !planReady}
                  aria-busy={isLoading}
                  className="buy-now-btn"
                >
                  {isLoading ? "Processing..." : "Buy"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast((prev) => ({ ...prev, show: false }))}
        />
      )}
    </div>
  );
}

