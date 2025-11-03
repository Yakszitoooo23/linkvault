"use client";

import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { LinkIcon } from '../ui/Icon';

interface ProductCardProps {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  imageKey: string | null;
  imageUrl?: string | null;
  createdAt: string;
}

export function ProductCard({ id, title, description, priceCents, imageKey, imageUrl, createdAt }: ProductCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return '1d ago';
    if (diffInDays < 7) return `${diffInDays}d ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`;
    return `${Math.floor(diffInDays / 30)}mo ago`;
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this product?')) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Refresh the page to update the product list
        window.location.reload();
      } else {
        alert('Failed to delete product');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    } finally {
      setIsDeleting(false);
    }
  };

  // Prioritize imageUrl over imageKey (legacy)
  const displayImageUrl = imageUrl || (imageKey ? `/api/images?fileKey=${encodeURIComponent(imageKey)}` : null);
  const shouldShowPlaceholder = !displayImageUrl || imageError;

  const handleCardClick = () => {
    window.location.href = `/product/${id}`;
  };

  const handleCopyLink = async (e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent card navigation
    
    const productUrl = `${window.location.origin}/product/${id}`;
    
    try {
      await navigator.clipboard.writeText(productUrl);
      setIsCopied(true);
      
      // Reset after 2 seconds
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = productUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setIsCopied(true);
        setTimeout(() => {
          setIsCopied(false);
        }, 2000);
      } catch (fallbackError) {
        console.error('Fallback copy failed:', fallbackError);
      }
      document.body.removeChild(textArea);
    }
  };

  // No Buy action on the homepage card; click card to open details

  return (
    <div className="product-card" onClick={handleCardClick}>
      {/* Product image */}
      <div className="product-image">
        {!shouldShowPlaceholder && displayImageUrl && (
          <img
            src={displayImageUrl}
            alt={title}
            className="product-image-img"
            onError={() => {
              console.error('Failed to load image:', displayImageUrl);
              setImageError(true);
            }}
          />
        )}
        {shouldShowPlaceholder && (
          <div className="image-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
              <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
            </svg>
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="product-info">
        <h3 className="product-title" title={title}>
          {title}
        </h3>
        <div className="product-meta">
          <span className="product-price">{formatPrice(priceCents)}</span>
          <span className="product-date">{formatRelativeTime(createdAt)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="product-actions" onClick={(e) => e.stopPropagation()}>
        <Button 
          variant="subtle" 
          onClick={handleCopyLink}
          aria-label="Copy product link"
        >
          <LinkIcon size={16} />
          {isCopied ? 'Copied!' : 'Product Link'}
        </Button>
        <Button 
          variant="subtle" 
          onClick={() => handleDelete()}
          disabled={isDeleting}
          aria-label="Delete product"
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
      </div>
    </div>
  );
}



