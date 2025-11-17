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
  currency: string;
  planId: string | null;
  createdAt: string;
}

interface ProductDetailClientProps {
  product: Product;
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  const router = useRouter();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    show: false,
    message: "",
    type: "success",
  });

  const handleBuyNow = async () => {
    if (!product) {
      console.warn("[ProductDetailClient] Buy clicked but product is missing");
      return;
    }

    if (isCheckingOut) {
      console.log("[ProductDetailClient] Already checking out, ignoring click");
      return;
    }

    console.log("[ProductDetailClient] Buy clicked", { productId: product.id });

    setIsCheckingOut(true);

    try {
      const response = await fetch(`/api/products/${product.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      console.log("[ProductDetailClient] Checkout response received", {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        let errorMessage = "Something went wrong while starting checkout";
        
        try {
          const errorData = await response.json();
          if (errorData && typeof errorData === "object" && "error" in errorData) {
            errorMessage = String(errorData.error);
          } else if (typeof errorData === "string") {
            errorMessage = errorData;
          }
        } catch {
          // If JSON parsing fails, use default message
        }

        console.error("[ProductDetailClient] Checkout API error", {
          status: response.status,
          errorMessage,
        });

        setToast({
          show: true,
          message: errorMessage,
          type: "error",
        });
        return;
      }

      const data = await response.json();
      console.log("[ProductDetailClient] Checkout response data", {
        hasCheckoutUrl: !!data.checkoutUrl,
        data,
      });

      if (data.checkoutUrl) {
        console.log("[ProductDetailClient] Redirecting to checkout", {
          checkoutUrl: data.checkoutUrl,
        });
        window.location.href = data.checkoutUrl;
      } else {
        console.error("[ProductDetailClient] No checkout URL in response", { data });
        setToast({
          show: true,
          message: "Something went wrong while starting checkout",
          type: "error",
        });
      }
    } catch (error) {
      console.error("[ProductDetailClient] Checkout error:", error);
      setToast({
        show: true,
        message: "Something went wrong while starting checkout",
        type: "error",
      });
    } finally {
      setIsCheckingOut(false);
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
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleBuyNow}
                  disabled={isCheckingOut}
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

