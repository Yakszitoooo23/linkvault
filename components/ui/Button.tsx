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

  const content = (
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

  if (href && !disabled) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
