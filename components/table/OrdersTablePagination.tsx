"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface OrdersTablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
}

export function OrdersTablePagination({ page, pageSize, total }: OrdersTablePaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const totalPages = Math.ceil(total / pageSize);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    router.push(`/orders?${params.toString()}`);
  };

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="orders-pagination">
      <div className="pagination-info">
        Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} orders
      </div>
      <div className="pagination-controls">
        <button
          className="pagination-btn"
          onClick={() => handlePageChange(page - 1)}
          disabled={!hasPrevPage}
          aria-label="Previous page"
        >
          ←
        </button>
        <span className="pagination-page">
          Page {page} of {totalPages}
        </span>
        <button
          className="pagination-btn"
          onClick={() => handlePageChange(page + 1)}
          disabled={!hasNextPage}
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </div>
  );
}






