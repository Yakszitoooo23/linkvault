import React from 'react';

interface LabelProps {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}

export function Label({ htmlFor, children, required = false, className = '' }: LabelProps) {
  return (
    <label htmlFor={htmlFor} className={`form-label ${className}`}>
      {children}
      {required && <span className="required-asterisk" aria-label="required">*</span>}
    </label>
  );
}









