import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  'aria-label'?: string;
  'aria-busy'?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary' | 'subtle';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  role?: string;
}

export function Button({ 
  children, 
  onClick, 
  'aria-label': ariaLabel, 
  'aria-busy': ariaBusy,
  className = '', 
  variant = 'primary',
  disabled = false,
  type = 'button',
  role
}: ButtonProps) {
  const baseClasses = 'btn-base';
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary', 
    subtle: 'btn-subtle'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
      disabled={disabled}
      role={role}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
}



