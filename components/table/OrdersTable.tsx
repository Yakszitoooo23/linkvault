import React from 'react';
import { formatCentsUSD, relativeDate, formatFullDateTime, truncateText, truncateMiddle } from '@/lib/format';
import { OrdersTablePagination } from './OrdersTablePagination';

interface OrderRow {
  id: string;
  productTitle: string;
  productId: string;
  amountCents: number;
  buyerId: string;
  createdAt: string;
}

interface OrdersTableProps {
  rows: OrderRow[];
  page: number;
  pageSize: number;
  total: number;
}

export function OrdersTable({ rows, page, pageSize, total }: OrdersTableProps) {
  if (rows.length === 0) {
    return (
      <div className="orders-container">
        <div className="orders-empty-state">
          <div className="empty-state-content">
            <h3 className="empty-state-title">No orders yet</h3>
            <p className="empty-state-subtitle">
              Orders will appear here once customers make purchases.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-container">
      <div className="orders-table-wrapper">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Amount</th>
              <th>Customer</th>
              <th>Purchase Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="product-cell">
                  <div className="product-info">
                    <div className="product-title" title={row.productTitle}>
                      {truncateText(row.productTitle, 40)}
                    </div>
                    <div className="product-id">
                      {row.productId}
                    </div>
                  </div>
                </td>
                <td className="amount-cell">
                  <span className="amount-value">
                    {formatCentsUSD(row.amountCents)}
                  </span>
                </td>
                <td className="customer-cell">
                  <span className="customer-id" title={row.buyerId}>
                    {truncateMiddle(row.buyerId, 20)}
                  </span>
                </td>
                <td className="date-cell">
                  <span 
                    className="date-relative" 
                    title={formatFullDateTime(new Date(row.createdAt))}
                  >
                    {relativeDate(new Date(row.createdAt))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OrdersTablePagination
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}
