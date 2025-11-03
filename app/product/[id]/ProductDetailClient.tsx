"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { ArrowLeftIcon } from "@/components/ui/Icon";

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
  const [isCheckingOut, setIsCheckingOut] = useState(false);
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

  const handleBuyNow = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (isCheckingOut) return;

    setIsCheckingOut(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: product.id }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create checkout");
        }

        const data = await response.json();

        if (data.checkoutUrl) {
          // Redirect to Whop checkout
          window.location.href = data.checkoutUrl;
        } else {
          throw new Error("No checkout URL received");
        }
      } catch (error) {
        console.error("Checkout error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to start checkout";
        setError(errorMessage);
        setToast({
          show: true,
          message: errorMessage,
          type: "error",
        });
        setIsCheckingOut(false);
      }
    })();
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const displayImageUrl =
    product.imageUrl ||
    (product.imageKey
      ? `/api/images?fileKey=${encodeURIComponent(product.imageKey)}`
      : null);

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
                  onClick={handleBuyNow}
                  disabled={isCheckingOut}
                  aria-busy={isCheckingOut}
                  className="buy-now-btn"
                >
                  {isCheckingOut ? "Processing..." : "Buy"}
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

