import React from 'react';
import { FileAlertIcon } from '../ui/Icon';

export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <FileAlertIcon size={48} className="empty-state-icon" />
        <h2 className="empty-state-title">No products found</h2>
        <p className="empty-state-subtitle">
          Create your first product to start selling.
        </p>
      </div>
    </div>
  );
}






