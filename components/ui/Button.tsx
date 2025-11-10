import React from 'react';

"use client";

import React from "react";
import Link from "next/link";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  "aria-label"?: string;
  "aria-busy"?: boolean;
  className?: string;
  variant?: "primary" | "secondary" | "subtle";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  role?: string;
  href?: string;
}

export function Button({
  children,
  onClick,
  "aria-label": ariaLabel,
  "aria-busy": ariaBusy,
  className = "",
  variant = "primary",
  disabled = false,
  type = "button",
  role,
  href,
}: ButtonProps) {
  const baseClasses = "btn-base";
  const variantClasses = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    subtle: "btn-subtle",
  };

  if (href) {
    if (disabled) {
      return (
        <span
          aria-label={ariaLabel}
          aria-busy={ariaBusy}
          aria-disabled="true"
          className={`${baseClasses} ${variantClasses[variant]} ${className} pointer-events-none opacity-60`}
        >
          {children}
        </span>
      );
    }

    return (
      <Link
        href={href}
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        aria-label={ariaLabel}
        aria-busy={ariaBusy}
        role={role}
      >
        {children}
      </Link>
    );
  }

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
