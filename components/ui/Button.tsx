import React from 'react';

"use client";

import React from "react";
import Link from "next/link";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "subtle";
  href?: string;
}

export function Button({
  variant = "primary",
  className = "",
  disabled = false,
  href,
  children,
  ...rest
}: ButtonProps) {
  const baseClasses = "btn-base";
  const variantClasses = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    subtle: "btn-subtle",
  };
  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`.trim();

  if (href) {
    if (disabled) {
      return (
        <span className={`${classes} pointer-events-none opacity-60`} aria-disabled="true">
          {children}
        </span>
      );
    }

    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
