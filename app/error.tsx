'use client';

import { useEffect } from 'react';
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowLeftIcon } from "@/components/ui/Icon";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="error-page">
      <div className="error-container">
        <div className="error-content">
          <h1 className="error-title">500</h1>
          <h2 className="error-subtitle">Something went wrong</h2>
          <p className="error-message">
            {error.message || "An unexpected error occurred. Please try again."}
          </p>
          <div className="error-actions">
            <Button variant="primary" onClick={reset}>
              Try Again
            </Button>
            <Link href="/">
              <Button variant="secondary">
                <ArrowLeftIcon size={16} />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

