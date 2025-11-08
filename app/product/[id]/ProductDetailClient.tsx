"use client";

import React, { useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { ArrowLeftIcon } from "@/components/ui/Icon";

declare global {
  interface Window {
    Whop?: {
      openCheckout: (checkoutId: string) => Promise<void>;
    };
  }
}

interface Product {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  imageKey: string | null;
  imageUrl: string | null;
  createdAt: string;
}

interface ProductDetailClientProps {
  product: Product;
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  const router = useRouter();
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

  const handleBuyClick = async (event?: React.MouseEvent) => {
    event?.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/products/${product.id}/checkout`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const baseMessage =
          (errorData && typeof errorData === "object" && "error" in errorData
            ? String(errorData.error)
            : null) ?? "Failed to create checkout configuration";

        const detailsMessage =
          errorData && typeof errorData === "object" && "details" in errorData
            ? JSON.stringify((errorData as Record<string, unknown>).details, null, 2)
            : null;

        const message = detailsMessage ? `${baseMessage}\n${detailsMessage}` : baseMessage;

        throw new Error(message);
      }

      const data: { checkoutConfigId?: string } = await response.json();

      if (!data.checkoutConfigId) {
        throw new Error("No checkout configuration ID received");
      }

      if (!window.Whop?.openCheckout) {
        throw new Error("Whop checkout SDK is not available");
      }

      await window.Whop.openCheckout(data.checkoutConfigId);
    } catch (err) {
      console.error("Whop checkout error:", err);
      const message = err instanceof Error ? err.message : "Checkout failed";
      setError(message);
      setToast({
        show: true,
        message,
        type: "error",
      });
      if (typeof window !== "undefined") {
        alert(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  // Always use API route for images to handle both local and S3 storage
  let displayImageUrl: string | null = null;
  
  console.log('[ProductDetailClient] Image data:', { imageUrl: product.imageUrl, imageKey: product.imageKey, id: product.id });
  
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
  
  console.log('[ProductDetailClient] Final displayImageUrl:', displayImageUrl);

  return (
    <div>
      <div className="container">
        <div className="product-detail">
          <Script src="https://assets.whop.com/sdk/v3/whop-sdk.js" strategy="beforeInteractive" />
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
                  disabled={isLoading}
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

