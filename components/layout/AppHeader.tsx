import React from 'react';
import { Button } from '../ui/Button';
import { InfoIcon, UsersIcon, BellIcon, SearchIcon } from '../ui/Icon';

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="header-content">
        {/* Left side: Logo + App name */}
        <div className="header-left">
          <div className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity="0.1"/>
              <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="app-title">DigiSell</h1>
        </div>

        {/* Right side: Action icons */}
        <div className="header-right">
          <Button variant="subtle" aria-label="Info">
            <InfoIcon size={18} />
          </Button>
          <Button variant="subtle" aria-label="Users">
            <UsersIcon size={18} />
          </Button>
          <Button variant="subtle" aria-label="Notifications">
            <BellIcon size={18} />
          </Button>
          <Button variant="subtle" aria-label="Search">
            <SearchIcon size={18} />
          </Button>
        </div>
      </div>
    </header>
  );
}





