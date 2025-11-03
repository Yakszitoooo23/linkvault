"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '../ui/Button';
import { InfoIcon, LockIcon } from '../ui/Icon';

export function ShellHeader() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/products/new', label: 'Create Product' },
    { href: '/orders', label: 'Orders' },
  ];

  return (
    <header className="shell-header">
      <div className="container">
        <div className="header-content">
          {/* Left side: Logo + App name */}
          <div className="header-left">
            <Link href="/" className="app-brand">
              <LockIcon size={20} className="logo" />
              <span className="app-title">LinkVault</span>
            </Link>
          </div>

          {/* Center: Navigation Links */}
          <nav className="header-nav">
            <ul className="nav-list">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`nav-link ${pathname === link.href ? 'nav-link-active' : ''}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Right side: Action icons */}
          <div className="header-right">
            <Button variant="subtle" aria-label="Info">
              <InfoIcon size={18} />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}



