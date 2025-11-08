"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SearchIcon, DownloadIcon } from '@/components/ui/Icon';

interface OrdersClientProps {
  initialSearch?: string;
  initialPageSize?: number;
}

export function OrdersClient({ initialSearch = '', initialPageSize = 20 }: OrdersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (search) {
        params.set('q', search);
      } else {
        params.delete('q');
      }
      params.delete('page'); // Reset to page 1 when searching
      router.push(`/orders?${params.toString()}`);
    }, 400);

    return () => clearTimeout(timer);
  }, [search, router, searchParams]);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    const params = new URLSearchParams(searchParams);
    params.set('pageSize', newPageSize.toString());
    params.delete('page'); // Reset to page 1 when changing page size
    router.push(`/orders?${params.toString()}`);
  }, [router, searchParams]);

  const handleExportCSV = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    const exportUrl = `/api/orders/export?${params.toString()}`;
    
    // Create a temporary link to trigger download
    const link = document.createElement('a');
    link.href = exportUrl;
    link.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [searchParams]);

  return (
    <div className="toolbar-right-actions">
      <div className="search-input-wrapper">
        <SearchIcon size={16} className="search-icon" />
        <input
          type="text"
          placeholder="Search orders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
      </div>
      
      <select
        value={pageSize}
        onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))}
        className="page-size-select"
      >
        <option value={20}>20</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
      </select>
      
      <Button variant="secondary" onClick={handleExportCSV} aria-label="Export CSV">
        <DownloadIcon size={16} />
        Export CSV
      </Button>
    </div>
  );
}







