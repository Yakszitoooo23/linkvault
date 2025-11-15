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

  const handleBuyNow = () => {
    if (!product) return;

    // Use whopPurchaseUrl directly if available
    if (product.whopPurchaseUrl) {
      window.location.href = product.whopPurchaseUrl;
      return;
    }

    // Fallback: Show error if checkout URL is missing
    setToast({
      show: true,
      message: 'Checkout URL not configured. Please recreate the product or contact support.',
      type: 'error',
    });
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
                {!product.whopPurchaseUrl && (
                  <div className="dashboard-error" role="alert" style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '4px' }}>
                    <strong>Checkout not configured.</strong> This product does not have a checkout URL. Please recreate the product or contact support.
                  </div>
                )}
                <Button
                  variant="primary"
                  onClick={handleBuyNow}
                  disabled={!product.whopPurchaseUrl}
                  role="button"
                  className="buy-now-btn"
                >
                  Buy Now
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

