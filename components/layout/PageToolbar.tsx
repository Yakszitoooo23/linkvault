import React from 'react';

interface PageToolbarProps {
  title?: string;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
}

export function PageToolbar({ title, leftActions, rightActions }: PageToolbarProps) {
  return (
    <div className="page-toolbar">
      <div className="toolbar-content">
        {title && (
          <div className="toolbar-title">
            <h2>{title}</h2>
          </div>
        )}
        
        <div className="toolbar-actions">
          {leftActions && (
            <div className="toolbar-left">
              {leftActions}
            </div>
          )}
          
          {rightActions && (
            <div className="toolbar-right">
              {rightActions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}








