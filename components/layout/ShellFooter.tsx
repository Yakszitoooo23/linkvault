import React from 'react';

export function ShellFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="shell-footer">
      <div className="container">
        <div className="footer-content">
          <p className="footer-text">
            © {currentYear} LinkVault. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}



