"use client";

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { ArrowLeftIcon } from '@/components/ui/Icon';

interface Product {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  imageKey: string | null;
  imageUrl: string | null;
  whopPurchaseUrl: string | null;
  createdAt: string;
}

export default function ProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  
  // Debug: Log state changes
  React.useEffect(() => {
    console.log("[ProductPage] isCheckingOut state changed", { isCheckingOut });
  }, [isCheckingOut]);
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' | 'info' }>({
    show: false,
    message: '',
    type: 'success',
  });

  React.useEffect(() => {
    async function fetchProduct() {
      try {
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch product');
        }
        const data = await response.json();
        setProduct(data);
      } catch (error) {
        console.error('Error fetching product:', error);
        setToast({
          show: true,
          message: 'Failed to load product',
          type: 'error',
        });
      } finally {
        setIsLoading(false);
      }
    }

    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  const handleBuyNow = async () => {
    console.log("[ProductPage] Buy clicked", { productId: product?.id, product: product ? { id: product.id, title: product.title, hasPurchaseUrl: !!product.whopPurchaseUrl } : null });
    
    if (!product) {
      console.warn("[ProductPage] Buy clicked but product is null");
      return;
    }

    // If we already have whopPurchaseUrl, use it directly
    if (product.whopPurchaseUrl) {
      console.log("[ProductPage] Using existing whopPurchaseUrl", { url: product.whopPurchaseUrl });
      window.location.href = product.whopPurchaseUrl;
      return;
    }

    // Otherwise, call the checkout endpoint to create/get checkout URL
    console.log("[ProductPage] Calling checkout endpoint", { productId: product.id });
    console.log("[ProductPage] Setting isCheckingOut to true");
    setIsCheckingOut(true);
    console.log("[ProductPage] isCheckingOut should now be true");
    try {
      const response = await fetch(`/api/products/${product.id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      console.log("[ProductPage] Checkout response received", { 
        ok: response.ok, 
        status: response.status, 
        statusText: response.statusText 
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || 'Failed to create checkout');
      }

      const data = await response.json();
      console.log("[ProductPage] Checkout response data", { hasCheckoutUrl: !!data.checkoutUrl, data });
      
      if (data.checkoutUrl) {
        // Redirect to checkout
        console.log("[ProductPage] Redirecting to checkout", { checkoutUrl: data.checkoutUrl });
        window.location.href = data.checkoutUrl;
      } else {
        console.error("[ProductPage] No checkout URL in response", { data });
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('[ProductPage] Checkout error:', error);
      setToast({
        show: true,
        message: error instanceof Error ? error.message : 'Failed to start checkout',
        type: 'error',
      });
    } finally {
      console.log("[ProductPage] Setting isCheckingOut to false in finally block");
      setIsCheckingOut(false);
      console.log("[ProductPage] isCheckingOut should now be false");
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (isLoading) {
    return (
      <div>
        <div className="container">
          <div className="product-detail-loading">
            <p>Loading product...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <div className="container">
          <div className="product-detail-error">
            <h2>Product not found</h2>
            <Button variant="secondary" onClick={() => router.push('/')}>
              <ArrowLeftIcon size={16} />
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const displayImageUrl = product.imageKey
    ? `/api/images?fileKey=${encodeURIComponent(product.imageKey)}`
    : product.imageUrl;

  return (
    <div>
      <div className="container">
        <div className="product-detail">
          {/* Header */}
          <div className="product-detail-header">
            <Button variant="secondary" onClick={() => router.push('/')}>
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
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
                    <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
                  </svg>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="product-detail-info">
              <h1 className="product-detail-title">{product.title}</h1>
              <p className="product-detail-price">{formatPrice(product.priceCents)}</p>
              
              {product.description && (
                <div className="product-detail-description">
                  <h3>Description</h3>
                  <p>{product.description}</p>
                </div>
              )}

              <div className="product-detail-actions">
                {(() => {
                  console.log("[ProductPage] Rendering Buy button", { 
                    isCheckingOut, 
                    productId: product?.id,
                    hasProduct: !!product,
                    buttonDisabled: isCheckingOut 
                  });
                  return null;
                })()}
                <Button
                  variant="primary"
                  onClick={(e) => {
                    console.log("[ProductPage] Button onClick fired", { 
                      event: e, 
                      type: e.type, 
                      target: e.target,
                      currentTarget: e.currentTarget,
                      isCheckingOut,
                      productId: product?.id 
                    });
                    e.preventDefault();
                    e.stopPropagation();
                    handleBuyNow();
                  }}
                  onMouseDown={(e) => {
                    console.log("[ProductPage] Button onMouseDown fired", { 
                      event: e,
                      isCheckingOut,
                      buttonDisabled: (e.currentTarget as HTMLButtonElement).disabled
                    });
                  }}
                  disabled={isCheckingOut}
                  aria-busy={isCheckingOut}
                  role="button"
                  className="buy-now-btn"
                  data-checking-out={isCheckingOut}
                  data-product-id={product?.id}
                  style={{ 
                    cursor: isCheckingOut ? 'not-allowed' : 'pointer',
                    opacity: isCheckingOut ? 0.6 : 1,
                    pointerEvents: isCheckingOut ? 'none' : 'auto'
                  }}
                >
                  {isCheckingOut ? 'Processing...' : 'Buy Now'}
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
          onClose={() => setToast(prev => ({ ...prev, show: false }))}
        />
      )}
    </div>
  );
}

